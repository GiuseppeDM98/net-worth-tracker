/**
 * The «Piano» stage's answer (lib/utils/operatingPlanSchema.ts, 2026-11-19): the JSON the structured
 * output returns, parsed loosely — the shape is the API's, the numbers the reconcile's — with the
 * months rounded to integers. Mutation: the `Math.round` of `sellMonth` dropped.
 */

import { describe, expect, it } from 'vitest';
import { parseOperatingPlanAnswer } from '@/lib/utils/operatingPlanSchema';

const answer = {
  summary: 'Un piano di dodici mesi.',
  monthlyInflowEur: 500,
  months: 12.4,
  rows: [
    { ref: 'S1', action: 'buy', targetPercentage: 60, reason: 'Il nucleo.' },
    { ref: 'S2', action: 'sell', targetPercentage: 0, sellQuantity: 10, sellMonth: 2.6, reason: 'Lo sostituisce N1.' },
  ],
  reviewMonth: 5.5,
  reviewReason: 'A metà strada.',
  departures: [],
};

describe('parseOperatingPlanAnswer', () => {
  it('parses the answer and rounds the months to integers', () => {
    const parsed = parseOperatingPlanAnswer(JSON.stringify(answer));
    expect(parsed).toMatchObject({ months: 12, reviewMonth: 6, monthlyInflowEur: 500 });
    expect(parsed?.rows[1]).toMatchObject({ ref: 'S2', action: 'sell', sellQuantity: 10, sellMonth: 3 });
    expect(parsed?.rows[0].sellMonth).toBeUndefined();
  });

  it('is null on text that is not JSON or not the shape', () => {
    expect(parseOperatingPlanAnswer('non è JSON')).toBeNull();
    expect(parseOperatingPlanAnswer(JSON.stringify({ ...answer, rows: [{ ref: 'S1', action: 'compra' }] }))).toBeNull();
    expect(parseOperatingPlanAnswer(JSON.stringify({ ...answer, summary: '' }))).toBeNull();
  });
});
