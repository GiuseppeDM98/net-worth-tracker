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
export const goalProposalSchema = z.object({
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
});

export type GoalProposal = z.infer<typeof goalProposalSchema>;

/**
 * Parses the body of a ```goal-proposal block.
 *
 * Returns null for anything that is not a valid proposal — malformed JSON, a missing
 * name, an allocation that does not total 100. The caller renders the block as ordinary
 * code in that case: a model that got the format wrong must degrade to showing what it
 * wrote, never to a crashed message thread.
 */
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
