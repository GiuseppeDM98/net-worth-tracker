'use client';

import { useState } from 'react';
import { hasCostFigures, type OwnershipBasis, type OwnershipSummary } from '@/lib/utils/assetOwnership';
import { ownershipRowOn } from '@/lib/utils/ownershipBasis';
import { describeOwnership, describeOwnershipAside, describeOwnershipFooter } from '@/lib/utils/patrimonioNarrative';
import { cn } from '@/lib/utils';
import type { TileCollapse } from '@/components/ui/tile';
import { AsideToggle, type AsideToggleOption } from '@/components/ui/aside-toggle';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { OverviewTile } from './OverviewTile';

interface IntestatariTileProps {
  /** `summarizeOwnership` — the payload's on the Panoramica, the page's own on Patrimonio. */
  summary: OwnershipSummary;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («quote per persona»). */
  asideWhenClosed?: string;
  className?: string;
}

/** «Valore | Carico» — today's value, or what was put in (owner, 2026-10-18). */
const BASIS_OPTIONS: ReadonlyArray<AsideToggleOption<OwnershipBasis>> = [
  { value: 'value', label: 'Valore' },
  { value: 'cost', label: 'Carico' },
];

/**
 * The basis is remembered per browser, ONE memory for the Panoramica and Patrimonio (the owner's
 * call: a reader who thinks in carry does so on both pages), like Strumenti's two toggles.
 */
const BASIS_STORAGE_KEY = 'patrimonio.intestatari.base';

function readStoredBasis(): OwnershipBasis {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(BASIS_STORAGE_KEY) === 'cost' ? 'cost' : 'value';
  } catch {
    return 'value';
  }
}

function writeStoredBasis(basis: OwnershipBasis): void {
  try {
    window.localStorage.setItem(BASIS_STORAGE_KEY, basis);
  } catch {
    // A blocked storage only forgets the choice; the tile is unaffected.
  }
}

/**
 * «Di chi è?» (owner, 2026-10-17) — the net worth by Intestatario: one ranked row per household
 * member holding something, then «In comune», then the orphaned ids, each with its amount, its
 * share of the NET total and how many assets it holds a part of (a split asset counts in every
 * row that has a quota of it, the owner's call of the quotas' day). The same tile on the
 * Panoramica (fed by the day's payload) and on Patrimonio (fed by the live assets), as
 * `PatrimonioTile` and `ComposizioneTile` already are. A group that is a net debt keeps its
 * amount with the minus and draws no bar (a bar has no negative width). The footer turns to the
 * warning tone when an asset's stored quotas no longer fit its quantity («quote da riassegnare»).
 *
 * The aside's «Valore | Carico» switch (owner, 2026-10-18) reads the same rows on today's value
 * or on the price of carry — who owns what, or who put the money in: the gains sit with whoever
 * holds the instruments that made them, and a household that split its accounts evenly may look
 * uneven on the value alone. The reading follows the switch, the page's verdict never does
 * (DESIGN.md → The Scope-Is-Not-An-Axis Rule); the closed row's answer in the landscape index
 * stays on the value (the switch is not visible there). A payload cached before the carry
 * figures offers no switch (`hasCostFigures`).
 */
export function IntestatariTile({ summary, collapse, asideWhenClosed, className }: IntestatariTileProps) {
  const [storedBasis, setStoredBasis] = useState<OwnershipBasis>(readStoredBasis);
  const canSwitch = hasCostFigures(summary);
  const basis: OwnershipBasis = canSwitch ? storedBasis : 'value';
  const selectBasis = (next: OwnershipBasis) => {
    setStoredBasis(next);
    writeStoredBasis(next);
  };

  const rows: RankedRow[] = summary.rows.map((row) => {
    const { value, sharePct } = ownershipRowOn(row, basis);
    return {
      key: row.key,
      label: row.label,
      caption: `${row.assetCount} asset`,
      amount: value,
      percentage: sharePct === null ? 0 : Math.max(0, sharePct),
    };
  });
  const footer = describeOwnershipFooter(summary, basis);
  const asideText = describeOwnershipAside(summary);
  const aside = canSwitch ? (
    <div className="flex flex-wrap items-center gap-2">
      <span>{asideText}</span>
      <AsideToggle options={BASIS_OPTIONS} value={basis} onChange={selectBasis} ariaLabel="Base delle quote" />
    </div>
  ) : (
    asideText
  );

  return (
    <OverviewTile
      eyebrow="Intestatari"
      aside={aside}
      asideWhenClosed={asideWhenClosed}
      reading={describeOwnership(summary, basis)}
      collapse={collapse}
      className={className}
    >
      <div className="mt-2">
        <RankedRows rows={rows} color="var(--chart-1)" ariaLabel={basis === 'cost' ? 'Prezzo di carico per intestatario' : 'Patrimonio per intestatario'} />
      </div>
      <p className={cn('mt-auto border-t border-border pt-3.5 text-[11px]', footer.tone === 'warning' ? 'text-warning-foreground' : 'text-muted-foreground')}>{footer.text}</p>
    </OverviewTile>
  );
}
