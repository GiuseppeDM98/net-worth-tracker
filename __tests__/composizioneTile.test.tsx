/**
 * `ComposizioneTile` (components/dashboard/overview/ComposizioneTile.tsx): every class ≥ 0 → a ring
 * over one row per part, a class at 0 € with no row (The Ring Rule, 2026-11-12); a class below zero
 * → the stacked bar and every row, as before. Figures invented and round. chartService's formatter
 * drags the Firebase chain in: mocked away, as in overviewSummary.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { ComposizioneTile } from '@/components/dashboard/overview/ComposizioneTile';
import type { PieChartData } from '@/types/assets';

const cls = (assetClass: string, name: string, value: number, total: number): PieChartData => ({
  assetClass,
  name,
  value,
  percentage: (value / total) * 100,
  color: `var(--class-${assetClass})`,
});

const rowLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-class-row] [data-class-label]')).map((node) => node.textContent);

describe('ComposizioneTile', () => {
  it('O3: draws the ring with one row per part when every class is ≥ 0, the class at 0 € without a row', () => {
    const { container } = render(
      <ComposizioneTile
        data={[cls('equity', 'Azioni', 60_000, 100_000), cls('bonds', 'Obbligazioni', 40_000, 100_000), cls('cash', 'Liquidità', 0, 100_000)]}
      />,
    );
    expect(container.querySelector('[data-ring]')).not.toBeNull();
    expect(rowLabels(container)).toEqual(['Azioni', 'Obbligazioni']);
  });

  it('O3: keeps the bar and every row when a class is below zero', () => {
    const { container } = render(
      <ComposizioneTile
        data={[cls('equity', 'Azioni', 60_000, 50_000), cls('bonds', 'Obbligazioni', 0, 50_000), cls('cash', 'Liquidità', -10_000, 50_000)]}
      />,
    );
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(container.querySelector('[role="img"][aria-label="Composizione per asset class"]')).not.toBeNull();
    expect(rowLabels(container)).toEqual(['Azioni', 'Obbligazioni', 'Liquidità']);
  });

  it('captions the fold with the names it holds', () => {
    const total = 1_000_000;
    const { container } = render(
      <ComposizioneTile
        data={[
          cls('equity', 'Azioni', 520_000, total),
          cls('bonds', 'Obbligazioni', 180_000, total),
          cls('realestate', 'Immobili', 140_000, total),
          cls('crypto', 'Criptovalute', 60_000, total),
          cls('cash', 'Liquidità', 40_000, total),
          cls('commodity', 'Materie Prime', 30_000, total),
          cls('trendFollowing', 'Trend Following', 30_000, total),
        ]}
      />,
    );
    expect(rowLabels(container)).toEqual(['Azioni', 'Obbligazioni', 'Immobili', 'Criptovalute', 'Liquidità', 'Altre 2 classi']);
    expect(container.querySelector('[data-class-caption]')?.textContent).toBe('Materie Prime, Trend Following');
  });
});
