/**
 * `ownershipRingSegments` (lib/utils/ownershipRing.ts): the «Intestatari» rows on their VALUE as the
 * parts of one ring (The Ring Rule, 2026-11-12) — members and «In comune» coloured by rank, the
 * orphaned group in the fold's neutral ink; a group that is a net debt makes the whole no ring.
 * Figures invented and round. Seen red on 2026-11-15 with the segments returned without `isRingWhole`.
 */

import { describe, expect, it } from 'vitest';
import { ownershipRingSegments } from '@/lib/utils/ownershipRing';
import { RING_REST_COLOR } from '@/lib/utils/ringChart';
import type { OwnershipRow, OwnershipRowKind, OwnershipSummary } from '@/lib/utils/assetOwnership';

const row = (key: string, kind: OwnershipRowKind, label: string, value: number): OwnershipRow => ({
  key,
  kind,
  memberId: kind === 'member' ? key : null,
  label,
  value,
  sharePct: null,
  costValue: value,
  costSharePct: null,
  assetCount: 1,
});

const summaryOf = (rows: OwnershipRow[]): OwnershipSummary => ({
  rows,
  total: rows.reduce((sum, entry) => sum + entry.value, 0),
  costTotal: 0,
  assetCount: rows.length,
  hasOwners: true,
  reassign: [],
  withoutCostBasis: [],
});

describe('ownershipRingSegments', () => {
  it('I1: members and «In comune» by rank, «Senza intestatario» in the neutral ink', () => {
    const summary = summaryOf([
      row('m-marco', 'member', 'Marco', 60_000),
      row('m-giulia', 'member', 'Giulia', 30_000),
      row('common', 'common', 'In comune', 10_000),
      row('unassigned', 'unassigned', 'Senza intestatario', 5_000),
    ]);
    expect(ownershipRingSegments(summary)).toEqual([
      { key: 'm-marco', label: 'Marco', value: 60_000, color: 'var(--chart-2)' },
      { key: 'm-giulia', label: 'Giulia', value: 30_000, color: 'var(--chart-7)' },
      { key: 'common', label: 'In comune', value: 10_000, color: 'var(--chart-6)' },
      { key: 'unassigned', label: 'Senza intestatario', value: 5_000, color: RING_REST_COLOR },
    ]);
  });

  // The owner on the mirror tour, 2026-11-15: «Carico» is a ring too, on the rows' carry figures.
  it('I1: on «Carico» the parts are the carry figures, not the values', () => {
    const summary = summaryOf([
      { ...row('m-marco', 'member', 'Marco', 60_000), costValue: 30_000 },
      { ...row('common', 'common', 'In comune', 40_000), costValue: 10_000 },
    ]);
    expect(ownershipRingSegments(summary, 'cost')).toEqual([
      { key: 'm-marco', label: 'Marco', value: 30_000, color: 'var(--chart-2)' },
      { key: 'common', label: 'In comune', value: 10_000, color: 'var(--chart-7)' },
    ]);
  });

  it('I1: a group that is a net debt (−5.000 €) makes no ring', () => {
    const summary = summaryOf([
      row('m-marco', 'member', 'Marco', 60_000),
      row('m-giulia', 'member', 'Giulia', -5_000),
      row('common', 'common', 'In comune', 10_000),
    ]);
    expect(ownershipRingSegments(summary)).toBeNull();
  });
});
