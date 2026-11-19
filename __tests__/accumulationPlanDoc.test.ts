/**
 * Tests for lib/utils/accumulationPlanDoc.ts — the lock's reading: which plan a lock document still
 * holds open (one plan in draft or active per account, 2026-11-12).
 */
import { describe, it, expect } from 'vitest';
import { docToAccumulationPlan, openPlanHeldBy, selectOpenPlan } from '@/lib/utils/accumulationPlanDoc';
import type { AccumulationPlan } from '@/types/accumulationPlan';

describe('openPlanHeldBy', () => {
  it('a free lock holds nothing', () => {
    expect(openPlanHeldBy(null, null)).toBeNull();
    expect(openPlanHeldBy(undefined, null)).toBeNull();
  });

  it('a lock on a draft or an active plan holds it', () => {
    expect(openPlanHeldBy('p1', 'draft')).toBe('p1');
    expect(openPlanHeldBy('p1', 'active')).toBe('p1');
  });

  // Seen red treating `completed` as held.
  it('a lock on a closed or missing plan holds nothing', () => {
    expect(openPlanHeldBy('p1', 'completed')).toBeNull();
    expect(openPlanHeldBy('p1', 'cancelled')).toBeNull();
    expect(openPlanHeldBy('p1', null)).toBeNull();
  });
});

describe('selectOpenPlan', () => {
  it('picks the draft or active plan', () => {
    const plans = [{ id: 'a', status: 'completed' }, { id: 'b', status: 'active' }] as AccumulationPlan[];
    expect(selectOpenPlan(plans)?.id).toBe('b');
    expect(selectOpenPlan(undefined)).toBeUndefined();
  });
});

describe('docToAccumulationPlan', () => {
  // Seen red without the mapping.
  it('reads the review month', () => {
    const at = new Date('2027-01-10T12:00:00');
    const base = { userId: 'u1', name: 'Piano', status: 'active', startMonth: '2027-01', months: 12, liquidity: {}, createdAt: at, updatedAt: at };
    expect(docToAccumulationPlan('p', { ...base, reviewMonthIndex: 6 }).reviewMonthIndex).toBe(6);
    expect(docToAccumulationPlan('p', base).reviewMonthIndex).toBeUndefined();
  });
});
