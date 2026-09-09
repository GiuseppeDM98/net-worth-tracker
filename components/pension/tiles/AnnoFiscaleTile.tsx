'use client';

/**
 * «Quanto mi restituisce il fisco?» — the Anno fiscale tile of Previdenza, the one tile ON the
 * page's year axis.
 *
 * The IRPEF ceiling is per taxpayer, so the tile is a stack of blocks, one per contributor: the
 * estimated saving as the KPI, the deducted share of the effective ceiling as a 3px track (the
 * same «used against a ceiling» shape as the Budget track — a ceiling is not a gain, so the fill
 * is `--foreground`, never a sign token), then the rows a reader needs to check the figure: what
 * could be deducted and, for an eligible worker, the plafond the ceiling grows by. A fund linked
 * to no member has no taxpayer to compute against and becomes a single call to action.
 *
 * Every word comes from `pensionNarrative.ts` (reading, aside, footer) and every figure from
 * `PensionMemberTax`: the tile only formats. The saving is a flow, not a gain, so the KPI stays
 * `text-foreground` (DESIGN.md → The Sign-Color Token Rule).
 */

import Link from 'next/link';
import type { Narrative } from '@/lib/utils/narrative';
import type { PensionMemberBlock, PensionMemberTax } from '@/lib/utils/pensionSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

export interface AnnoFiscaleTileProps {
  /** The axis year every figure is read on («Anno fiscale 2026»). */
  taxYear: number;
  /** The tile's reading line — one clause per contributor, from `describeAnnoFiscale`. */
  reading: Narrative;
  /** The scope beside the eyebrow: «Mario · RAL 38.000 €», «per contribuente», «fondo non assegnato». */
  aside: string;
  /** The disclaimer pinned to the bottom: an estimate, not tax advice. */
  footer: Narrative;
  /** One block per contributor (or per unassigned fund), from `summarizePensionMembers`. */
  blocks: PensionMemberBlock[];
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums';
const ROW_CLASS = 'flex items-baseline justify-between gap-3 py-2 text-[13px]';
const HINT_CLASS = 'ml-1.5 text-[11px] text-muted-foreground';
const VALUE_CLASS = 'shrink-0 font-mono tabular-nums text-foreground';

/** Width of the deducted fill, 0-100; a ceiling of zero has no share to draw. */
function deductedShare(tax: PensionMemberTax): number {
  if (tax.effectiveCeiling <= 0) return 0;
  return Math.min(100, (tax.deducted / tax.effectiveCeiling) * 100);
}

function MemberBlock({ block, tax, named }: { block: PensionMemberBlock; tax: PensionMemberTax; named: boolean }) {
  const name = block.name ?? '';
  const deducted = cachedFormatCurrencyEUR(tax.deducted, true);
  const ceiling = cachedFormatCurrencyEUR(tax.effectiveCeiling, true);
  const share = deductedShare(tax);

  return (
    <div>
      <p className={TILE_SUB_EYEBROW_CLASS}>{named ? `${name} · Risparmio IRPEF stimato` : 'Risparmio IRPEF stimato'}</p>
      <p className={cn('mt-1.5 text-foreground', KPI_VALUE_CLASS)}>
        {tax.taxSaving !== null ? `~${cachedFormatCurrencyEUR(tax.taxSaving, true)}` : '—'}
      </p>
      {tax.ral === null && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Imposta la RAL di {name} in{' '}
          <Link href="/dashboard/settings" className="text-foreground underline hover:no-underline">
            Impostazioni → Preferenze → Famiglia
          </Link>{' '}
          per stimare il risparmio IRPEF.
        </p>
      )}

      {/* The deducted share of the ceiling: the caption carries both figures, the track the ratio.
          The track is a `progressbar` like the Budget track — a bare div's aria-label is never
          announced — and its name repeats the caption in Italian figures, never a dot decimal. */}
      <div className="mt-3.5">
        <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="min-w-0">
            Dedotto <span className="font-mono tabular-nums text-foreground">{deducted}</span>
          </span>
          <span className="shrink-0 font-mono tabular-nums">tetto {ceiling}</span>
        </div>
        <div
          className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(share)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Dedotto ${deducted} su un tetto di ${ceiling}`}
        >
          <div className="h-full rounded-full bg-foreground" style={{ width: `${share}%` }} />
        </div>
      </div>

      <div className="mt-3 divide-y divide-border">
        <div className={ROW_CLASS}>
          <span className="min-w-0 text-foreground">
            Deducibili<span className={HINT_CLASS}>volontario + datoriale</span>
          </span>
          <span className={VALUE_CLASS}>{cachedFormatCurrencyEUR(tax.deductible)}</span>
        </div>
        {tax.showPlafond && (
          <div className={ROW_CLASS}>
            <span className="min-w-0 text-foreground">
              Extra oltre il tetto
              <span className={HINT_CLASS}>
                plafond residuo <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(tax.plafondResidual, true)}</span>
              </span>
            </span>
            <span className={VALUE_CLASS}>{cachedFormatCurrencyEUR(tax.extraAvailable)}</span>
          </div>
        )}
        {tax.showPlafond && tax.isAccrualYear && (
          <div className={ROW_CLASS}>
            <span className="min-w-0 text-foreground">{"Plafond creato quest'anno"}</span>
            <span className={VALUE_CLASS}>{cachedFormatCurrencyEUR(tax.plafondCreatedThisYear)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A fund linked to no member: nothing to compute, one action to take. The button keeps its
 * fixed height at every width (44px, 28px from desktop), so the fund name — the one part of
 * the label that can be long — truncates instead of wrapping past the box; the reading above
 * names the fund in full. Each word group is its own flex item (an inline-flex chip drops the
 * space of a text node), spaced by the gap.
 */
function UnassignedRow({ block }: { block: PensionMemberBlock }) {
  return (
    <div className={ROW_CLASS}>
      <Link
        href="/dashboard/assets"
        className="inline-flex h-11 min-w-0 max-w-full items-center gap-1 rounded-md border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-7"
      >
        <span className="shrink-0">Collega</span>
        <span className="min-w-0 truncate">{block.fundNames.join(', ')}</span>
        <span className="shrink-0 whitespace-nowrap">a un contribuente in Patrimonio</span>
      </Link>
    </div>
  );
}

/**
 * The Anno fiscale tile: one block per contributor — KPI, track, rows — and a call to action
 * for a fund nobody is linked to, over the narrative's reading, aside and footer.
 */
export function AnnoFiscaleTile({ taxYear, reading, aside, footer, blocks, className }: AnnoFiscaleTileProps) {
  const named = blocks.length > 1;

  return (
    <Tile eyebrow={`Anno fiscale ${taxYear}`} aside={aside} reading={reading} ariaLabel="Anno fiscale" className={className}>
      <div className="mt-3.5 flex flex-col gap-4">
        {blocks.map((block) => {
          if (block.kind === 'unassigned') return <UnassignedRow key={block.key} block={block} />;
          if (block.tax === null) return null;
          return <MemberBlock key={block.key} block={block} tax={block.tax} named={named} />;
        })}
      </div>

      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
