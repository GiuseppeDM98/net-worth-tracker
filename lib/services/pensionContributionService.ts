/**
 * PENSION CONTRIBUTION SERVICE (client SDK)
 *
 * Persistence + value/transfer effects for contributions to a fondo pensione, stored in the
 * dedicated `pensionContributions` collection (spec 01 §3) — NEVER as an `Expense` of consumption:
 * a contribution must not enter the savings-rate / budget / Analisi metrics (invariant #1). Same
 * event-per-asset shape as `dividends`.
 *
 * Why the client SDK and not an Admin route (unlike the trade ledger): there is no multi-document
 * replay to serialise here. The one place that touches two balances at once — the voluntary
 * contribution — is already atomic through `reconcileTransferCreate` → `updateCashAssetBalancesAtomic`
 * (a single Firestore transaction). Firestore rules authorise owner + delegated members (spec 01 §4).
 *
 * VALUE EFFECT (invariant #2). Every contribution raises the fund's value by `amount` immediately:
 * the fund is a manually-valued asset whose euro value lives in `quantity` at price 1, exactly like a
 * cash balance. The natures differ only in where the money comes from:
 *   - TFR / employer never transit the user's account → the fund is credited standalone, no Expense.
 *   - VOLUNTARY is the user moving their own money → modelled as a `transfer` account → fund: an
 *     audit-trail transfer entry in the cashflow (net-zero, already excluded from spend/savings) plus
 *     `reconcileTransferCreate` (account −amount, fund +amount, atomic). The transfer's destination
 *     credit IS the fund's value increment, so the value is never double-counted.
 *
 * NOT handled here, by design: the periodic statement update (the absolute NAV overwrite that
 * captures market return) is a plain asset edit in Patrimonio via `updateAsset` — `pensionFund` is a
 * non-ledger type, so it keeps direct value editing like `cash`/`realestate`.
 *
 * Editing a contribution is out of scope for v1: delete and re-enter (the delete reverses the effect
 * exactly, so the round-trip is lossless).
 *
 * QUERY SHAPE — no composite index. Reads use equality filters only (`userId`, optionally `assetId`)
 * with NO `orderBy`; the ordering is applied in memory. A profile records ~12–24 contributions a
 * year, so sorting client-side is free, and it keeps `firestore.indexes.json` untouched. Same
 * reasoning as `getAssetTransactions` / `getUserSnapshotsAdmin`. (Spec 01 §5 recommended option.)
 */

import { collection, doc, getDocs, addDoc, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { toDate } from '@/lib/utils/dateHelpers';
import { getAssetById, updateCashAssetBalance } from '@/lib/services/assetService';
import {
  reconcileTransferCreate,
  reconcileTransferDelete,
} from '@/lib/services/cashBalanceReconciliation';
import { createExpense, deleteExpense } from '@/lib/services/expenseService';
import { ensureTransferCategory, getCategoryById } from '@/lib/services/expenseCategoryService';
import {
  isDeductibleSource,
  type ContributionSource,
  type PensionContribution,
} from '@/types/pension';

export const PENSION_CONTRIBUTIONS_COLLECTION = 'pensionContributions';

/** Fallback label for the transfer entry when the category document cannot be re-read. */
const DEFAULT_TRANSFER_CATEGORY_NAME = 'Trasferimenti';

/** Default note on the audit-trail transfer entry of a voluntary contribution. */
const DEFAULT_VOLUNTARY_TRANSFER_NOTE = 'Versamento volontario al fondo pensione';

/**
 * Every valid contribution nature — the runtime guard behind the compile-time union, since the input
 * can reach this service from an untyped form value. Listed explicitly (not derived from
 * `DEDUCTIBLE_PENSION_NATURES`) so a new NON-deductible nature cannot be silently rejected here.
 * It is part of the checklist comment on `PensionContributionNature` in types/pension.ts.
 */
const CONTRIBUTION_SOURCES: readonly ContributionSource[] = ['tfr', 'voluntary', 'employer'];

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Convert a Firestore contribution doc into the domain shape (Timestamp → Date at the boundary). */
function docToPensionContribution(id: string, data: Record<string, unknown>): PensionContribution {
  return {
    id,
    userId: data.userId as string,
    assetId: data.assetId as string,
    source: data.source as ContributionSource,
    amount: data.amount as number,
    date: toDate(data.date as never),
    taxYear: data.taxYear as number,
    deductible: data.deductible as boolean,
    notes: data.notes as string | undefined,
    linkedExpenseId: data.linkedExpenseId as string | undefined,
    sourceCashAssetId: data.sourceCashAssetId as string | undefined,
    createdAt: toDate(data.createdAt as never),
  };
}

/**
 * All pension contributions for an owner, newest first, optionally scoped to one fund asset.
 *
 * Sorting happens in memory (see the module note on the query shape). Ties on `date` fall back to
 * `createdAt` so two contributions entered for the same day keep a stable, insertion-ordered display.
 */
export async function getPensionContributions(
  ownerId: string,
  assetId?: string
): Promise<PensionContribution[]> {
  const constraints = [where('userId', '==', ownerId)];
  if (assetId) constraints.push(where('assetId', '==', assetId));

  const snapshot = await getDocs(
    query(collection(db, PENSION_CONTRIBUTIONS_COLLECTION), ...constraints)
  );

  return snapshot.docs
    .map((snap) => docToPensionContribution(snap.id, snap.data() as Record<string, unknown>))
    .sort(
      (a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime()
    );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface PensionContributionInput {
  /** The fondo pensione asset (AssetType `pensionFund`) this contribution flows into. */
  assetId: string;
  source: ContributionSource;
  /** Positive magnitude in EUR. */
  amount: number;
  date: Date;
  /** Tax year of competence; defaults to the calendar year of `date`. */
  taxYear?: number;
  notes?: string;
  /**
   * Origin cash account for a VOLUNTARY contribution — required only for that nature, the one that
   * actually leaves the user's account.
   */
  sourceCashAssetId?: string;
}

/**
 * Validate the parts of the input that need no I/O (spec 01 §6). Throws on the first violation:
 * there is no server route in front of this service, so the service IS the boundary.
 *
 * The `taxYear` rule deserves a word. Deduction follows the cash principle — the ceiling is consumed
 * in the year the money is paid — so the tax year is normally the calendar year of `date`. The only
 * legitimate divergence is a payroll payment straddling the year end (a January instalment booked to
 * the closing year, or vice versa), hence the ±1 window rather than an arbitrary absolute range.
 */
function validatePensionContributionInput(input: PensionContributionInput): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('A pension contribution amount must be a positive number');
  }
  if (!CONTRIBUTION_SOURCES.includes(input.source)) {
    throw new Error(`Unknown pension contribution source: ${String(input.source)}`);
  }
  if (input.taxYear !== undefined) {
    const contributionYear = input.date.getFullYear();
    if (!Number.isInteger(input.taxYear) || Math.abs(input.taxYear - contributionYear) > 1) {
      throw new Error(
        `Tax year ${input.taxYear} is not plausible for a contribution dated ${contributionYear}`
      );
    }
  }
}

/**
 * Validate the origin account of a voluntary contribution: it must exist and be a cash asset.
 *
 * Why the extra read: the transfer debits the origin through `updateCashAssetBalance`, which writes
 * `quantity` directly. Pointed at a non-cash asset that would silently destroy a share count rather
 * than move a balance — a corruption no later screen could explain.
 */
async function assertVoluntarySourceIsCashAccount(sourceCashAssetId: string): Promise<void> {
  const sourceAsset = await getAssetById(sourceCashAssetId);
  if (!sourceAsset) {
    throw new Error(`Source cash account ${sourceCashAssetId} was not found`);
  }
  if (sourceAsset.assetClass !== 'cash') {
    throw new Error('A voluntary pension contribution must come from a cash account');
  }
}

/**
 * Write the contribution document. `deductible` is derived from `source` and persisted so per-year
 * deductible roll-ups never have to re-derive it; `sourceCashAssetId` is kept only for the nature
 * that has one, so the delete path can reverse the exact transfer.
 */
async function writePensionContribution(
  userId: string,
  input: PensionContributionInput,
  linkedExpenseId?: string
): Promise<string> {
  const payload = removeUndefinedFields({
    userId,
    assetId: input.assetId,
    source: input.source,
    amount: Math.abs(input.amount),
    date: Timestamp.fromDate(input.date),
    taxYear: input.taxYear ?? input.date.getFullYear(),
    deductible: isDeductibleSource(input.source),
    notes: input.notes,
    linkedExpenseId,
    sourceCashAssetId: input.source === 'voluntary' ? input.sourceCashAssetId : undefined,
    createdAt: Timestamp.now(),
  });

  const docRef = await addDoc(collection(db, PENSION_CONTRIBUTIONS_COLLECTION), payload);
  return docRef.id;
}

/**
 * Create the audit-trail transfer entry for a voluntary contribution (account → fund).
 *
 * The category name is denormalised on every expense, so it is re-read from the category document
 * rather than assumed: a user who renamed their transfer category would otherwise see a row labelled
 * with a name that no longer exists.
 */
async function createVoluntaryTransferEntry(
  userId: string,
  input: PensionContributionInput
): Promise<string> {
  const transferCategoryId = await ensureTransferCategory(userId);
  const transferCategory = await getCategoryById(transferCategoryId);

  const result = await createExpense(
    userId,
    {
      type: 'transfer',
      categoryId: transferCategoryId,
      amount: Math.abs(input.amount),
      currency: 'EUR',
      date: input.date,
      notes: input.notes ?? DEFAULT_VOLUNTARY_TRANSFER_NOTE,
      linkedCashAssetId: input.sourceCashAssetId,
      transferCashAssetId: input.assetId,
    },
    transferCategory?.name ?? DEFAULT_TRANSFER_CATEGORY_NAME
  );

  // Neither `isRecurring` nor `isInstallment` is set, so this is always the single-expense branch.
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Record a pension contribution and apply its value/transfer effect (see the module doc).
 *
 * Returns the new contribution's id. Preconditions: `amount > 0`; a voluntary contribution requires
 * a `sourceCashAssetId` pointing at a cash asset.
 *
 * Failure handling. The client SDK cannot span an Expense, two asset balances and the contribution
 * document in one transaction, so each path compensates for the step that can strand data:
 *   - voluntary: if the balance move fails, the just-created transfer entry is removed, otherwise the
 *     cashflow would show a transfer that never happened — and deleting it by hand later would move
 *     the balances a second time, in the wrong direction;
 *   - both: if the contribution document fails to write, the value effect is rolled back, so a retry
 *     cannot credit the fund twice.
 * Compensation is best-effort and never masks the original error.
 */
export async function recordPensionContribution(
  userId: string,
  input: PensionContributionInput
): Promise<string> {
  validatePensionContributionInput(input);
  const amount = Math.abs(input.amount);

  if (input.source !== 'voluntary') {
    // TFR / employer: the money never transits the user's account — credit the fund standalone.
    await updateCashAssetBalance(input.assetId, amount);
    try {
      return await writePensionContribution(userId, input);
    } catch (error) {
      await compensate(() => updateCashAssetBalance(input.assetId, -amount), {
        step: 'fund credit rollback',
        assetId: input.assetId,
      });
      throw error;
    }
  }

  if (!input.sourceCashAssetId) {
    throw new Error('A voluntary pension contribution requires a source cash account');
  }
  await assertVoluntarySourceIsCashAccount(input.sourceCashAssetId);

  const transferExpenseId = await createVoluntaryTransferEntry(userId, input);

  try {
    // Move the balances: account −amount, fund +amount (the fund credit IS the value increment).
    await reconcileTransferCreate({
      originId: input.sourceCashAssetId,
      destId: input.assetId,
      amount,
    });
  } catch (error) {
    await compensate(() => deleteExpense(transferExpenseId), {
      step: 'transfer entry rollback',
      expenseId: transferExpenseId,
    });
    throw error;
  }

  try {
    return await writePensionContribution(userId, input, transferExpenseId);
  } catch (error) {
    await compensate(async () => {
      await reconcileTransferDelete({
        originId: input.sourceCashAssetId,
        destId: input.assetId,
        amount,
      });
      await deleteExpense(transferExpenseId);
    }, { step: 'voluntary transfer rollback', expenseId: transferExpenseId });
    throw error;
  }
}

/**
 * Delete a pension contribution and REVERSE its value/transfer effect — the exact mirror of
 * `recordPensionContribution`, so the fund value and (for a voluntary contribution) the source
 * balance and its transfer entry return to where they were (invariant #5).
 *
 * The reversal is best-effort and must never block the record's removal: the fund or the transfer
 * entry may already have been deleted by hand, in which case there is nothing left to reverse and the
 * contribution should still be removable. The balance helpers already skip assets that no longer
 * exist, and the document is deleted last, in every case.
 */
export async function deletePensionContribution(contribution: PensionContribution): Promise<void> {
  const amount = Math.abs(contribution.amount);

  try {
    if (contribution.source === 'voluntary') {
      // Reverse the transfer: credit the account back, debit the fund. `reconcileTransferDelete`
      // handles a missing origin by moving only the fund leg, so a record written without a source
      // account still un-does the value effect.
      await reconcileTransferDelete({
        originId: contribution.sourceCashAssetId,
        destId: contribution.assetId,
        amount,
      });
      if (contribution.linkedExpenseId) {
        await deleteExpense(contribution.linkedExpenseId);
      }
    } else {
      // TFR / employer only credited the fund — debit it back.
      await updateCashAssetBalance(contribution.assetId, -amount);
    }
  } catch (error) {
    console.warn('Pension contribution reversal failed; deleting the record anyway', {
      contributionId: contribution.id,
      operation: 'deletePensionContribution',
      error,
    });
  }

  await deleteDoc(doc(db, PENSION_CONTRIBUTIONS_COLLECTION, contribution.id));
}

/**
 * Run a compensating action for a step that already succeeded, swallowing its own failure.
 *
 * A compensation runs because something else has already gone wrong; letting it throw would replace
 * the original, meaningful error with a secondary one. It is logged instead, with enough context to
 * reconcile the leftovers by hand.
 */
async function compensate(
  action: () => Promise<void>,
  context: Record<string, unknown>
): Promise<void> {
  try {
    await action();
  } catch (compensationError) {
    console.error('Pension contribution compensation failed', {
      ...context,
      operation: 'recordPensionContribution',
      error: compensationError,
    });
  }
}
