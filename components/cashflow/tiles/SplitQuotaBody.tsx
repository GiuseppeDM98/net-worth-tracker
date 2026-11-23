'use client';

import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { splitRingSegments, type SplitBasis } from '@/lib/utils/expenseSplitSummary';
import { ringSwatchAt } from '@/lib/utils/ringChart';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';

const SWATCH_CLASS = 'h-2 w-2 shrink-0 self-center rounded-[2px]';

/**
 * The Quota tile's body on Cashflow › Divisione: with a computed basis, the incomes the shares are
 * measured on as a ring (The Ring Rule, 2026-11-12; centre «entrate», their sum) beside one block per
 * person, each name led by its arc's swatch; nothing without a basis (the tile's reading names the
 * remedy). Settings order, so a person keeps a colour whatever the period.
 */
export function SplitQuotaBody({ basis }: { basis: SplitBasis }) {
  if (basis.kind !== 'computed') return null;
  const ring = splitRingSegments(basis);

  const blocks = (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {basis.members.map((entry, index) => (
        <div key={entry.member.id} className="min-w-0" data-split-person="">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, ring && 'flex items-center gap-1.5')}>
            {ring && <span className={SWATCH_CLASS} style={{ background: ringSwatchAt(ring, index) }} aria-hidden="true" />}
            {entry.member.name}
          </p>
          <p className="mt-1 font-mono text-[22px] leading-none tracking-tight">{cachedFormatCurrencyEUR(entry.income, true)}</p>
        </div>
      ))}
    </div>
  );

  if (!ring) return <div className="mt-4">{blocks}</div>;
  return (
    <div className="@container mt-4">
      <div className={RING_LAYOUT_CLASS}>
        <RingChart segments={ring} centerValue={basis.totalIncome} centerLabel="entrate" ariaLabel="Entrate per persona" />
        <div className={RING_ROWS_CLASS}>{blocks}</div>
      </div>
    </div>
  );
}
