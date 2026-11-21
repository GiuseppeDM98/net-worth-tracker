/**
 * accumulationPlanSchema — structural (zod) and domain validation for a PAC draft.
 *
 * `accumulationPlanDraftSchema` checks SHAPE only (ranges, required fields); everything that needs
 * the actual portfolio (a member's allocationRole, a source account's assetClass) lives in
 * `validateDraftAgainstAssets`, which reads `assetsById` and never Firebase — same Firebase-free
 * discipline as `accumulationPlanUtils.ts`, but this module is allowed the role helper it needs.
 */
import { z } from 'zod';
import type { Asset } from '@/types/assets';
import type { AccumulationPlanDraft } from '@/types/accumulationPlan';
import { disposalMonthIndex, isPlanBuyable, isPlanCashFund } from './accumulationPlanUtils';
import { unitPriceEur } from './costBasisEur';
import { describeDraftIssue, type DraftIssueCode } from './accumulationNarrative';

/**
 * The SAME value predicate the seeder (`seedPositionsFromAssets`) and the path's held rows use
 * (`calculateAssetValue(asset) > 0`), restated here Firebase-free: `calculateAssetValue` lives in
 * `lib/services/assetService.ts`, which imports `@/lib/firebase/config`, and this module never
 * does (see the file header) — `unitPriceEur` is the same Firebase-free primitive
 * `accumulationPlanUtils.ts` re-exports for the same reason. Once this check read
 * `asset.quantity <= 0` instead, a DIFFERENT predicate from the seeder/candidates'
 * `calculateAssetValue(asset) > 0` («valore > 0», not «quantità > 0») — an asset held with
 * quantity > 0 but a price not yet fetched (the FX-on-a-cold-instance Known Issue) was demanded by
 * the validator and offered by no row: `unassigned_tradable` could never clear, «Avanti» stayed
 * disabled forever.
 */
function hasPositiveValue(asset: Asset): boolean {
  return asset.quantity * unitPriceEur(asset) > 0;
}

export interface DraftIssue {
  code: DraftIssueCode;
  message: string;
  assetId?: string;
  positionId?: string;
}

const planPositionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  targetPercentage: z.number(),
  memberAssetIds: z.array(z.string().min(1)).min(1),
  buyAssetId: z.string().min(1),
});

const planDisposalSchema = z.object({
  assetId: z.string().min(1),
  quantity: z.number().optional(),
  monthIndex: z.number().int().min(1).optional(),
  estimatedProceedsEur: z.number(),
  status: z.enum(['planned', 'executed', 'skipped']),
  transactionIds: z.array(z.string()).optional(),
  executedAmountEur: z.number().optional(),
  reinvestAssetId: z.string().min(1).optional(),
});

const planLiquiditySchema = z.object({
  sourceCashAssetIds: z.array(z.string().min(1)),
  reserveEur: z.number(),
  monthlyInflowEur: z.number(),
});

export const accumulationPlanDraftSchema = z.object({
  name: z.string().min(1),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  months: z.number().int(),
  liquidity: planLiquiditySchema,
  positions: z.array(planPositionSchema),
  disposals: z.array(planDisposalSchema),
  reviewMonthIndex: z.number().int().min(1).optional(),
  advisorNotes: z.array(z.string().max(400)).max(40).optional(),
});

/** Every asset a draft names, whichever role it plays. */
function labelOf(assetId: string, assetsById: Map<string, Asset>): string {
  return assetsById.get(assetId)?.name ?? assetId;
}

/**
 * Cross-referential checks that need the real portfolio. Structural checks (§ months_range,
 * negative_amount shape) are covered by `accumulationPlanDraftSchema` at the call site that owns
 * parsing; this function assumes the draft already parsed and re-checks the numeric ranges that
 * ALSO need to surface as a `DraftIssue` (so the editor's status line, not zod's own error shape,
 * is what the user reads). `firstIndex` is the plan month of the draft's first month (1 for a new plan,
 * `k` for a revision's draft): a sale's `monthIndex` is counted from the plan's first month.
 */
export function validateDraftAgainstAssets(
  draft: AccumulationPlanDraft,
  assetsById: Map<string, Asset>,
  firstIndex = 1
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  // A loan's role is the role of what it finances: the predicate reads the whole list.
  const assets = [...assetsById.values()];

  if (!Number.isInteger(draft.months) || draft.months < 1 || draft.months > 60) {
    issues.push({ code: 'months_range', message: describeDraftIssue({ code: 'months_range' }) });
  }
  if (draft.liquidity.reserveEur < 0 || draft.liquidity.monthlyInflowEur < 0) {
    issues.push({ code: 'negative_amount', message: describeDraftIssue({ code: 'negative_amount' }) });
  }

  if (draft.positions.length === 0) {
    issues.push({ code: 'no_positions', message: describeDraftIssue({ code: 'no_positions' }) });
  }

  const sum = draft.positions.reduce((total, p) => total + p.targetPercentage, 0);
  if (draft.positions.length > 0 && Math.abs(sum - 100) > 0.01) {
    issues.push({ code: 'weights_sum', message: describeDraftIssue({ code: 'weights_sum', sum }) });
  }

  for (const position of draft.positions) {
    if (position.targetPercentage < 0) {
      issues.push({
        code: 'weight_negative',
        message: describeDraftIssue({ code: 'weight_negative', label: position.label }),
        positionId: position.id,
      });
    }
    if (!position.memberAssetIds.includes(position.buyAssetId)) {
      issues.push({
        code: 'buy_not_member',
        message: describeDraftIssue({ code: 'buy_not_member', label: position.label }),
        positionId: position.id,
        assetId: position.buyAssetId,
      });
    }
    for (const memberId of position.memberAssetIds) {
      const member = assetsById.get(memberId);
      if (member && !isPlanBuyable(member, assets)) {
        issues.push({
          code: 'position_not_tradable',
          message: describeDraftIssue({ code: 'position_not_tradable', label: labelOf(memberId, assetsById) }),
          positionId: position.id,
          assetId: memberId,
        });
      }
    }
  }

  const positionMembers = new Set(draft.positions.flatMap((p) => p.memberAssetIds));
  for (const disposal of draft.disposals) {
    const asset = assetsById.get(disposal.assetId);
    // A money-market fund may be sold, never bought (owner, 2026-11-18).
    if (asset && !isPlanBuyable(asset, assets) && !isPlanCashFund(asset, assets)) {
      issues.push({
        code: 'position_not_tradable',
        message: describeDraftIssue({ code: 'position_not_tradable', label: labelOf(disposal.assetId, assetsById) }),
        assetId: disposal.assetId,
      });
    }
    // a partial sale of a position's member is allowed; a total one is not.
    if (disposal.quantity !== undefined && (!Number.isInteger(disposal.quantity) || disposal.quantity <= 0)) {
      issues.push({
        code: 'disposal_quantity',
        message: describeDraftIssue({ code: 'disposal_quantity', label: labelOf(disposal.assetId, assetsById) }),
        assetId: disposal.assetId,
      });
    } else if (positionMembers.has(disposal.assetId)) {
      const held = asset?.quantity ?? 0;
      if (disposal.quantity === undefined || disposal.quantity >= held) {
        issues.push({
          code: 'disposal_full_on_position',
          message: describeDraftIssue({ code: 'disposal_full_on_position', label: labelOf(disposal.assetId, assetsById) }),
          assetId: disposal.assetId,
        });
      }
    }
    // The swap (owner, 2026-11-20): its proceeds buy an instrument the plan buys, never the one sold.
    if (disposal.reinvestAssetId !== undefined
      && (disposal.reinvestAssetId === disposal.assetId || !draft.positions.some((p) => p.buyAssetId === disposal.reinvestAssetId))) {
      issues.push({
        code: 'swap_target',
        message: describeDraftIssue({ code: 'swap_target', label: labelOf(disposal.assetId, assetsById) }),
        assetId: disposal.assetId,
      });
    }
    if (disposalMonthIndex(disposal) > firstIndex - 1 + draft.months) {
      issues.push({
        code: 'sale_month_out',
        message: describeDraftIssue({ code: 'sale_month_out', label: labelOf(disposal.assetId, assetsById) }),
        assetId: disposal.assetId,
      });
    }
  }

  // duplicate_asset: an asset in two positions, or in a position AND a disposal.
  const seenIn = new Map<string, number>();
  for (const position of draft.positions) {
    for (const memberId of position.memberAssetIds) {
      seenIn.set(memberId, (seenIn.get(memberId) ?? 0) + 1);
    }
  }
  // A disposal counts as a second appearance only when it is not a partial sale of a position's member.
  const disposalSeen = new Map<string, number>();
  for (const disposal of draft.disposals) {
    disposalSeen.set(disposal.assetId, (disposalSeen.get(disposal.assetId) ?? 0) + 1);
    if (!positionMembers.has(disposal.assetId)) seenIn.set(disposal.assetId, (seenIn.get(disposal.assetId) ?? 0) + 1);
  }
  for (const [assetId, count] of disposalSeen.entries()) {
    if (count > 1 && positionMembers.has(assetId)) seenIn.set(assetId, 2);
  }
  for (const [assetId, count] of seenIn.entries()) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_asset',
        message: describeDraftIssue({ code: 'duplicate_asset', label: labelOf(assetId, assetsById) }),
        assetId,
      });
    }
  }

  for (const sourceId of draft.liquidity.sourceCashAssetIds) {
    const asset = assetsById.get(sourceId);
    // An account deleted after the draft was built (2026-11-20): a plan must never be written on it.
    if (!asset) {
      issues.push({ code: 'source_missing', message: describeDraftIssue({ code: 'source_missing' }), assetId: sourceId });
    } else if (asset.assetClass !== 'cash') {
      issues.push({
        code: 'source_not_cash',
        message: describeDraftIssue({ code: 'source_not_cash', label: labelOf(sourceId, assetsById) }),
        assetId: sourceId,
      });
    }
  }

  // Only what a plan may buy is demanded here: the seeder and the editor's rows offer nothing else
  // (`isPlanBuyable`), so a property, a loan or an account never blocks «Avanti».
  const assignedAssetIds = new Set(seenIn.keys());
  for (const asset of assetsById.values()) {
    if (assignedAssetIds.has(asset.id)) continue;
    if (!isPlanBuyable(asset, assets)) continue;
    if (!hasPositiveValue(asset)) continue;
    issues.push({
      code: 'unassigned_tradable',
      message: describeDraftIssue({ code: 'unassigned_tradable', label: asset.name }),
      assetId: asset.id,
    });
  }

  return issues;
}
