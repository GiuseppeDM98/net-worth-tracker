/**
 * Patrimonio › Compravendita — the executor of a plan (lib/utils/realEstateOperationPlan.ts).
 *
 * Every step goes through the service that already owns that write, so a row written here is the row
 * the expense form would write: `createAsset` for the property and the loans, `createExpenseSettledOnDate`
 * (+ `applyBalanceEffects`, `applyDebtRepayments`) for transfers, spending rows and series — each moves
 * its account ON ITS OWN DATE (lib/utils/cashSettlement.ts) —, `updateCashAssetBalancesAtomic` for a
 * value moved by hand, `reverseAppliedBalances` + `deleteExpenseRows` for the occurrences a sale stops.
 *
 * NOT atomic across steps: a property, a loan and a 360-row series are separate writes. The steps run
 * in plan order and the first failure stops the run; the result says how many landed, so the page can
 * name what was written and what was not (`describePartialFailure`) instead of retrying blindly.
 */

import { createAsset, updateCashAssetBalancesAtomic } from '@/lib/services/assetService';
import { createCostCenter } from '@/lib/services/costCenterService';
import { ensureTransferCategory } from '@/lib/services/expenseCategoryService';
import { createExpenseSettledOnDate, deleteExpenseRows, getFeesOf } from '@/lib/services/expenseService';
import { applyBalanceEffects, reverseAppliedBalances } from '@/lib/services/cashBalanceReconciliation';
import { applyDebtRepayments } from '@/lib/services/debtRepaymentService';
import type { AssetFormData } from '@/types/assets';
import type { ExpenseCategory, ExpenseFormData } from '@/types/expenses';
import type { OwnershipAnswer } from '@/types/realEstateOperation';
import { dateOfIso, type AssetRef, type PlanStep, type PlannedRow, type RealEstatePlan } from '@/lib/utils/realEstateOperationPlan';

export interface RealEstateExecution {
  /** Steps written, in plan order. */
  done: number;
  total: number;
  /** The step that failed, when one did. */
  failedAt: number | null;
  error: unknown;
  /** The ids the run created: the property, the mortgage, the centre. */
  createdIds: { property?: string; mortgage?: string; costCenter?: string };
}

/** «Intestatari» as the asset form writes them (types/assets.ts → ownerMemberId, ownerShares). */
export function ownershipFields(ownership: OwnershipAnswer): Pick<AssetFormData, 'ownerMemberId' | 'ownerShares'> {
  if (ownership.mode === 'member') return { ownerMemberId: ownership.memberId };
  if (ownership.mode === 'shares') {
    const shares = ownership.shares.filter((share) => (share.percent ?? 0) > 0).map((share) => ({ memberId: share.memberId, percent: share.percent as number }));
    return shares.length > 0 ? { ownerShares: shares } : {};
  }
  return {};
}

/** A property as the asset form writes one: valued in `quantity` at price 1, by hand. */
export function propertyFormData(step: Extract<PlanStep, { kind: 'createProperty' }>): AssetFormData {
  return {
    ticker: '',
    name: step.name,
    type: 'realestate',
    assetClass: 'realestate',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 1,
    isLiquid: false,
    autoUpdatePrice: false,
    stampDutyExempt: false,
    isPrimaryResidence: step.isPrimaryResidence,
    // The home one lives in is out of the Allocazione, as the Consulente proposes by default.
    allocationRole: step.isPrimaryResidence ? 'excluded' : 'tradable',
    ...ownershipFields(step.ownership),
  };
}

/** A loan as the asset form writes one: the principal in `quantity`, its TAN; a mortgage names its property and derives its owner. */
export function loanFormData(step: Extract<PlanStep, { kind: 'createLoan' }>, propertyId: string | undefined): AssetFormData {
  return {
    ticker: '',
    name: step.name,
    type: 'loan',
    assetClass: step.financesProperty ? 'realestate' : 'cash',
    currency: 'EUR',
    quantity: step.principal,
    currentPrice: 1,
    isLiquid: false,
    autoUpdatePrice: false,
    // A loan is no securities account: never in the stamp duty (AssetDialog does the same).
    stampDutyExempt: true,
    isPrimaryResidence: false,
    debtInterestRate: step.ratePct > 0 ? step.ratePct : undefined,
    financedAssetId: step.financesProperty ? propertyId : undefined,
    ...(step.financesProperty ? {} : ownershipFields(step.ownership)),
  };
}

/** The expense the form would build for a planned row. */
export function expenseFormDataOf(row: PlannedRow, resolveId: (ref: AssetRef) => string | undefined, categoryId: string, costCenter: { id: string; name: string } | null): ExpenseFormData {
  const date = dateOfIso(row.dateIso);
  const isSeries = !!row.months && row.months > 0;
  return {
    type: row.type,
    categoryId,
    subCategoryId: row.category.subCategoryId,
    amount: row.amount,
    currency: 'EUR',
    date,
    notes: row.notes,
    isRecurring: isSeries,
    recurringFrequency: isSeries ? 'monthly' : undefined,
    recurringDay: isSeries ? date.getDate() : undefined,
    recurringCount: isSeries ? row.months : undefined,
    linkedCashAssetId: row.account ? resolveId(row.account) : undefined,
    transferCashAssetId: row.destination ? resolveId(row.destination) : undefined,
    debtAssetId: row.loan ? resolveId(row.loan) : undefined,
    isDebtPayoff: row.isPayoff ? true : undefined,
    propertyAssetId: row.property ? resolveId(row.property) : undefined,
    personalMemberId: row.member,
    costCenterId: row.inCostCenter && costCenter ? costCenter.id : undefined,
    costCenterName: row.inCostCenter && costCenter ? costCenter.name : undefined,
  };
}

/**
 * Runs the plan, step by step, and says how far it got. `existingCostCenter` is the centre the plan
 * books in when it names one that exists (`plan.costCenterId`).
 */
export async function executeRealEstatePlan(
  ownerId: string,
  plan: RealEstatePlan,
  categories: readonly ExpenseCategory[],
  existingCostCenter: { id: string; name: string } | null,
  now: Date = new Date()
): Promise<RealEstateExecution> {
  const created: Record<string, string> = {};
  const createdIds: RealEstateExecution['createdIds'] = {};
  let costCenter = existingCostCenter;
  let transferCategory: { id: string; name: string } | null = null;
  const resolveId = (ref: AssetRef): string | undefined => ('id' in ref ? ref.id : created[ref.ref]);

  // A step of its own, awaited below: the React Compiler map wants no logic inside a try.
  const run = async (step: PlanStep): Promise<void> => {
    switch (step.kind) {
      case 'createCostCenter': {
        const center = await createCostCenter(ownerId, { name: step.name });
        costCenter = { id: center.id, name: center.name };
        createdIds.costCenter = center.id;
        return;
      }
      case 'createProperty': {
        created.property = await createAsset(ownerId, propertyFormData(step));
        createdIds.property = created.property;
        return;
      }
      case 'createLoan': {
        created[step.ref] = await createAsset(ownerId, loanFormData(step, created.property ?? plan.propertyId ?? undefined));
        if (step.ref === 'mortgage') createdIds.mortgage = created[step.ref];
        return;
      }
      case 'adjustProperty': {
        const propertyId = created.property ?? plan.propertyId;
        if (!propertyId) throw new Error('The property to adjust is unknown');
        await updateCashAssetBalancesAtomic([{ assetId: propertyId, signedDelta: step.delta }]);
        return;
      }
      case 'payOffWithSale': {
        if (!plan.propertyId) throw new Error('The property sold is unknown');
        // One transaction: the debt and the house fall together, no row, no account.
        await updateCashAssetBalancesAtomic([
          { assetId: step.loanId, signedDelta: -step.amount },
          { assetId: plan.propertyId, signedDelta: -step.amount },
        ]);
        return;
      }
      case 'row': {
        let categoryId = step.row.category.categoryId;
        let categoryName = step.row.category.categoryName;
        if (step.row.type === 'transfer') {
          if (!transferCategory) {
            const id = await ensureTransferCategory(ownerId);
            transferCategory = { id, name: categories.find((category) => category.id === id)?.name ?? 'Trasferimenti' };
          }
          categoryId = transferCategory.id;
          categoryName = transferCategory.name;
        }
        const data = expenseFormDataOf(step.row, resolveId, categoryId, costCenter);
        const { appliedEffects, appliedDebtRows } = await createExpenseSettledOnDate(ownerId, data, categoryName, step.row.category.subCategoryName, now);
        // The rows already happened move their accounts and repay their loans now; the rest on their date.
        await applyDebtRepayments(appliedDebtRows);
        await applyBalanceEffects(appliedEffects);
        return;
      }
      case 'stopSeries': {
        const rows = step.series.rows;
        const all = [...rows, ...(await getFeesOf(ownerId, rows))];
        await reverseAppliedBalances(all);
        await deleteExpenseRows(ownerId, all);
        return;
      }
    }
  };

  for (const [index, step] of plan.steps.entries()) {
    const failure = await run(step).then(
      () => null,
      (error: unknown) => error
    );
    if (failure !== null) {
      console.error('Real estate operation stopped', { ownerId, step: step.kind, index, error: failure });
      return { done: index, total: plan.steps.length, failedAt: index, error: failure, createdIds };
    }
  }
  return { done: plan.steps.length, total: plan.steps.length, failedAt: null, error: null, createdIds };
}
