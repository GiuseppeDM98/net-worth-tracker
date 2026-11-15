/**
 * `IntestatariTile` (components/dashboard/overview/IntestatariTile.tsx): the owners are a ring (The Ring
 * Rule, 2026-11-12) with the rows as its legend, on «Valore» and on «Carico» (the owner on the mirror
 * tour, 2026-11-15), each on its own figures; past six owners the ring folds and the sixth row on wears
 * the fold's grey. Figures invented and round. Seen red on 2026-11-15 with the ring's parts taken as the
 * values whatever the basis (the first case) and with the swatch taken as `ring[index].color` instead
 * of `ringSwatchAt` (the second).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntestatariTile } from '@/components/dashboard/overview/IntestatariTile';
import { RING_REST_COLOR } from '@/lib/utils/ringChart';
import type { OwnershipRow, OwnershipSummary } from '@/lib/utils/assetOwnership';

const member = (index: number, value: number): OwnershipRow => ({
  key: `m-${index}`,
  kind: 'member',
  memberId: `m-${index}`,
  label: `Persona ${index}`,
  value,
  sharePct: null,
  costValue: value,
  costSharePct: null,
  assetCount: 1,
});

const summaryOf = (rows: OwnershipRow[]): OwnershipSummary => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const withShares = rows.map((row) => ({ ...row, sharePct: (row.value / total) * 100, costSharePct: (row.value / total) * 100 }));
  return { rows: withShares, total, costTotal: total, assetCount: rows.length, hasOwners: true, reassign: [], withoutCostBasis: [] };
};

const swatchesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('li [aria-hidden="true"].h-2.w-2')).map((swatch) => swatch.style.background);

describe('IntestatariTile', () => {
  beforeEach(() => window.localStorage.clear());

  // «Carico» a ring too: the owner on the mirror tour, 2026-11-15 (the spec had kept its bars).
  it('I2: a ring on «Valore» and on «Carico», each on its own figures', () => {
    const rows = [{ ...member(1, 60_000), costValue: 30_000 }, { ...member(2, 40_000), costValue: 10_000 }];
    const summary = { ...summaryOf(rows), costTotal: 40_000 };
    const { container } = render(<IntestatariTile summary={summary} />);
    const ringLabel = () => container.querySelector('[data-ring] svg')?.getAttribute('aria-label') ?? '';
    expect(ringLabel()).toMatch(/^Patrimonio per intestatario: Persona 1 60%, Persona 2 40%; patrimonio 100/);
    expect(screen.getByRole('list', { name: 'Patrimonio per intestatario' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Carico' }));
    expect(ringLabel()).toMatch(/^Prezzo di carico per intestatario: Persona 1 75%, Persona 2 25%; carico 40/);
    expect(screen.getByRole('list', { name: 'Prezzo di carico per intestatario' })).toBeTruthy();
    expect(swatchesOf(container)).toEqual(['var(--chart-2)', 'var(--chart-7)']);
  });

  it('I2: seven owners fold the ring — the sixth and seventh swatches wear the fold’s grey', () => {
    const rows = [70, 60, 50, 40, 30, 20, 10].map((thousands, index) => member(index + 1, thousands * 1000));
    const { container } = render(<IntestatariTile summary={summaryOf(rows)} />);
    const swatches = swatchesOf(container);
    expect(swatches).toHaveLength(7);
    expect(swatches.slice(5)).toEqual([RING_REST_COLOR, RING_REST_COLOR]);
  });
});
