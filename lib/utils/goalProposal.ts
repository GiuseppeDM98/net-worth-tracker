/**
 * The ```goal-proposal protocol.
 *
 * The assistant can never write a goal by itself: when the user asks it to create one,
 * it emits a fenced code block with language `goal-proposal` carrying only JSON, the
 * markdown renderer turns that block into a card, and the write happens only if the
 * user presses Conferma.
 *
 * This module owns the shape both ends of that protocol agree on. It is deliberately
 * client-safe (no `server-only`, no Firestore) so the card can validate before it
 * renders anything, and `lib/server/validation.ts` builds the route's request schema on
 * top of the same object — one definition, so a field can never be accepted by one side
 * and rejected by the other.
 *
 * Allocation percentages must total 100. The tolerance exists because the model writes
 * one-decimal numbers, not because a mix that misses by two points is acceptable.
 */

import { z } from 'zod';
import { AssetClass } from '@/types/assets';

/** Sum tolerance for recommendedAllocation, in percentage points. */
export const GOAL_ALLOCATION_SUM_TOLERANCE = 0.5;

const ASSET_CLASSES: [AssetClass, ...AssetClass[]] = [
  'equity',
  'bonds',
  'crypto',
  'realestate',
  'cash',
  'commodity',
  'trendFollowing',
  'carry',
];

// partialRecord, not record: in zod 4 a record keyed by an enum requires EVERY key,
// so a mix of equity and bonds alone would be rejected as incomplete.
const recommendedAllocationSchema = z
  .partialRecord(z.enum(ASSET_CLASSES), z.number().finite().min(0).max(100))
  .refine(
    (allocation) => {
      const total = Object.values(allocation).reduce<number>((sum, pct) => sum + (pct ?? 0), 0);
      return Math.abs(total - 100) <= GOAL_ALLOCATION_SUM_TOLERANCE;
    },
    { message: "Le percentuali dell'allocazione consigliata devono sommare a 100." }
  );

/**
 * The proposal payload, identical in the fenced block and in the POST body.
 *
 * `targetDateIso` stays a plain YYYY-MM-DD string end to end: it is stored as one
 * (`InvestmentGoal.targetDate`) and read back with `new Date(...)` by the trajectory
 * math, so parsing it into a Date here would only invite a timezone round-trip.
 */
/** A quota the model proposes: the instrument by its EXACT name from the STRUMENTI block, a percent of it. */
export const goalProposalAssignmentSchema = z.object({
  assetName: z.string().trim().min(1).max(160),
  percentage: z.number().finite().positive().max(100),
});

export const goalProposalSchema = z.object({
  // Set when the proposal MODIFIES an existing goal (2026-10-20): the id the OBIETTIVI block
  // prints. Absent, the card creates a goal.
  goalId: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().finite().positive().optional(),
  targetDateIso: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La scadenza deve essere in formato YYYY-MM-DD.')
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Scadenza non valida.')
    .optional(),
  priority: z.enum(['alta', 'media', 'bassa']),
  monthlyContribution: z.number().finite().nonnegative().optional(),
  recommendedAllocation: recommendedAllocationSchema.optional(),
  notes: z.string().max(500).optional(),
  // The instruments behind the goal, by name; on an update they REPLACE the goal's quotas.
  // Absent on an update = the quotas stay as they are.
  assignments: z.array(goalProposalAssignmentSchema).max(20).optional(),
});

export type GoalProposal = z.infer<typeof goalProposalSchema>;
export type GoalProposalAssignment = z.infer<typeof goalProposalAssignmentSchema>;

/**
 * A quota as the route writes it — resolved to an asset id by the card, which holds the assets;
 * the server never guesses a name. Percent of the asset, the only form a proposal carries.
 */
export const goalWriteAssignmentSchema = z.object({
  assetId: z.string().trim().min(1).max(80),
  percentage: z.number().finite().positive().max(100),
});

export const goalWriteAssignmentsSchema = z.array(goalWriteAssignmentSchema).max(20);

export type GoalWriteAssignment = z.infer<typeof goalWriteAssignmentSchema>;

/**
 * Parses the body of a ```goal-proposal block.
 *
 * Returns null for anything that is not a valid proposal — malformed JSON, a missing
 * name, an allocation that does not total 100. The caller renders the block as ordinary
 * code in that case: a model that got the format wrong must degrade to showing what it
 * wrote, never to a crashed message thread.
 */
/** Language of the fenced block that turns into a goal proposal card. */
export const GOAL_PROPOSAL_LANGUAGE = 'goal-proposal';

export function parseGoalProposal(raw: string): GoalProposal | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  const result = goalProposalSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
