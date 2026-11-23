/**
 * The «Piano» stage's structured answer (2026-11-19, doc/guide/consulente-piano.md): the zod shape
 * the server hands the API (`betaZodOutputFormat(operatingPlanAnswerSchema).schema`) and the parse
 * of what comes back. The bounds are loose on purpose: the API guarantees the shape, and
 * `reconcileOperatingPlan` owns the numbers. Server only — the Consulente's components never import
 * it (a test reads their sources), so zod's object stays out of the route's bundle.
 */

import { z } from 'zod';
import type { RawOperatingPlan } from '@/lib/utils/operatingPlan';

export const operatingPlanAnswerSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  monthlyInflowEur: z.number().finite(),
  months: z.number().finite(),
  rows: z.array(z.object({
    ref: z.string().trim().min(1).max(8),
    action: z.enum(['buy', 'hold', 'sell']),
    targetPercentage: z.number().finite(),
    sellQuantity: z.number().finite().optional(),
    sellMonth: z.number().finite().optional(),
    reinvestInto: z.string().trim().min(1).max(8).optional(),
    reason: z.string().max(400),
  })).max(80),
  reviewMonth: z.number().finite().optional(),
  reviewReason: z.string().max(400),
  departures: z.array(z.string().max(400)).max(10),
});

/** JSON.parse + safeParse; the months (`months`, `sellMonth`, `reviewMonth`) rounded to integers. Null on anything else. */
export function parseOperatingPlanAnswer(text: string): RawOperatingPlan | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = operatingPlanAnswerSchema.safeParse(json);
  if (!parsed.success) return null;
  const answer = parsed.data;
  return {
    ...answer,
    months: Math.round(answer.months),
    rows: answer.rows.map((row) => ({
      ...row,
      ...(row.sellMonth !== undefined ? { sellMonth: Math.round(row.sellMonth) } : {}),
    })),
    ...(answer.reviewMonth !== undefined ? { reviewMonth: Math.round(answer.reviewMonth) } : {}),
  };
}
