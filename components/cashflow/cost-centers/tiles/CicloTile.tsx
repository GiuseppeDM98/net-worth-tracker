'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CenterSummary } from '@/lib/utils/costCenterSummary';
import { formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface CicloTileProps {
  summary: CenterSummary;
  /** «attivo» / «fermo» / «archiviato». */
  aside: string;
  reading: Narrative;
  footer: Narrative;
  className?: string;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-[13px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/**
 * «Il progetto è vivo?» — the dates that answer it: when the center was created, its
 * first and last expense, how many months carried a spend. The lifecycle itself (active,
 * dormant past 90 days, archived) is the reading; the actions that change it sit beside
 * the verdict, not here.
 */
export function CicloTile({ summary, aside, reading, footer, className }: CicloTileProps) {
  return (
    <Tile eyebrow="Ciclo di vita" aside={<span>{aside}</span>} reading={reading} className={className}>
      <dl className="mt-2 flex flex-col divide-y divide-border">
        <Row label="Creato" value={formatDate(toDate(summary.center.createdAt))} />
        {summary.firstDate && <Row label="Prima spesa" value={formatDate(summary.firstDate)} />}
        {summary.lastDate && <Row label="Ultima spesa" value={formatDate(summary.lastDate)} />}
        {summary.center.archivedAt && <Row label="Archiviato" value={formatDate(toDate(summary.center.archivedAt))} />}
        {summary.monthsSpan > 0 && <Row label="Mesi con spese" value={`${summary.monthsWithSpending} su ${summary.monthsSpan}`} />}
      </dl>
      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
