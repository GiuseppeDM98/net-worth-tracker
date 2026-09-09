'use client';

/**
 * «Quanto ha reso il mercato?» — the Rendimento tile of Previdenza.
 *
 * The one tile of the page OFF the year axis: a TWR is measured on the window where the
 * contributions are trustworthy, not on a fiscal year, so the aside names that window
 * («nov 2025 → ago 2026») instead of the picker's year. The shape is one KPI per contributor —
 * the TWR, net of every contribution — with the euro that explain it as flat rows underneath:
 * the market's gain (a gain, sign-coloured), the return on the person's own capital once the
 * employer's share is counted (a return, sign-coloured) and that employer share itself, muted
 * and captioned «retribuzione, non rendimento» because it is compensation, never yield.
 *
 * Only a MEASURED block prints figures. A suspicious, idle or not-yet-open window is explained
 * by the reading (and by the verdict above the grid); printing «Guadagno di mercato» under a
 * sentence saying «that difference is not market return» would contradict it forty pixels away,
 * and the eye reads the number first (`isPensionReturnMeasurable`, lib/utils/pensionReturn.ts).
 * The words are all the narrative layer's — this component only formats and lays out.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { PensionMemberBlock } from '@/lib/utils/pensionSummary';
import type { PensionReturnResult } from '@/lib/utils/pensionReturn';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor, signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

export interface PensionRendimentoTileProps {
  /** The answer in words, from `describeRendimento` — it also explains every block that is not a measure. */
  reading: Narrative;
  /** The window actually measured («nov 2025 → ago 2026»), or why there is none yet, from `describeRendimentoAside`. */
  aside: string;
  /** The secondary fact pinned at the bottom (`RENDIMENTO_FOOTER`). */
  footer: Narrative;
  /** One block per contributor; only those with `returnState === 'measured'` print figures. */
  blocks: PensionMemberBlock[];
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums';
const ROW_CLASS = 'flex items-baseline justify-between gap-3 py-2 text-[13px]';
const ROW_VALUE_CLASS = 'shrink-0 whitespace-nowrap font-mono tabular-nums';

/** The typographic minus, so a loss never prints the hyphen-minus the Intl formatter would not use. */
const TYPOGRAPHIC_MINUS = '−';

/** «+7,96%» / «−2,40%». */
function signedPct(value: number): string {
  return `${value >= 0 ? '+' : TYPOGRAPHIC_MINUS}${formatPercentage(Math.abs(value), 2)}`;
}

/** «+2.228,99 €» / «−700,00 €» — cents kept, this is the euro behind the percentage. */
function signedCurrency(value: number): string {
  return `${value >= 0 ? '+' : TYPOGRAPHIC_MINUS}${cachedFormatCurrencyEUR(Math.abs(value))}`;
}

function Row({
  label,
  hint,
  muted,
  children,
}: {
  label: string;
  hint?: string;
  /** A row about a flow rather than a return reads muted, label and value alike. */
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={ROW_CLASS}>
      <span className={cn('min-w-0', muted ? 'text-muted-foreground' : 'text-foreground')}>
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** A block the caller already narrowed: its `return` is the measure it prints. */
interface MeasuredEntry {
  block: PensionMemberBlock;
  result: PensionReturnResult;
}

function MeasuredBlock({ block, result, named, first }: MeasuredEntry & { named: boolean; first: boolean }) {
  // With several contributors the sub-eyebrow names whose TWR this is; an unassigned fund falls
  // back to its first fund name, which can be long, so only the name truncates — never the label.
  const owner = named ? (block.name ?? block.fundNames[0]) : null;
  // The employer's share is what separates the personal return from the TWR: without it the two
  // figures coincide and the row would print the KPI a second time.
  const personalReturn = result.contributions.employer > 0 ? result.personalReturn : null;

  return (
    <div className={first ? 'mt-3.5' : 'mt-4'}>
      <p className={cn(TILE_SUB_EYEBROW_CLASS, 'flex min-w-0 items-baseline gap-1')}>
        {owner !== null && <span className="min-w-0 truncate">{owner}</span>}
        <span className="shrink-0">{owner !== null ? '· TWR · al netto dei versamenti' : 'TWR · al netto dei versamenti'}</span>
      </p>
      <p className={cn(KPI_VALUE_CLASS, 'mt-1.5', getMetricValueColor(result.twr, 'percentage'))}>
        {signedPct(result.twr)}
      </p>
      <p className="mt-1.5 text-[11px] leading-[1.45] text-muted-foreground">
        {result.annualizedTwr === null ? (
          <>
            Su <span className="font-mono tabular-nums">{result.monthsCovered}</span>{' '}
            {result.monthsCovered === 1 ? 'mese' : 'mesi'}: troppo pochi per annualizzare.
          </>
        ) : (
          <>
            <span className="font-mono tabular-nums">{signedPct(result.annualizedTwr)}</span> annualizzato
          </>
        )}
      </p>

      <div className="mt-3.5 flex flex-col divide-y divide-border">
        <Row label="Guadagno di mercato">
          <span className={cn(ROW_VALUE_CLASS, signTextClass(result.marketGain))}>{signedCurrency(result.marketGain)}</span>
        </Row>
        {personalReturn !== null && (
          <Row label="Ritorno sul tuo capitale" hint="mercato + datore">
            <span className={cn(ROW_VALUE_CLASS, getMetricValueColor(personalReturn, 'percentage'))}>
              {signedPct(personalReturn)}
            </span>
          </Row>
        )}
        {result.contributions.employer > 0 && (
          <Row label="Contributo datoriale" hint="retribuzione, non rendimento" muted>
            <span className={cn(ROW_VALUE_CLASS, 'text-muted-foreground')}>
              {cachedFormatCurrencyEUR(result.contributions.employer)}
            </span>
          </Row>
        )}
      </div>
    </div>
  );
}

/**
 * «Quanto ha reso il mercato?» — one TWR per contributor, the euro behind it as rows, on the
 * window the aside names. A block whose return is not a measure prints nothing here: the reading
 * already says why.
 */
export function RendimentoTile({ reading, aside, footer, blocks, className }: PensionRendimentoTileProps) {
  // `returnState === 'measured'` is only ever resolved from a non-null result (pensionSummary's
  // `resolveReturnState`); the `return` check narrows the type without a non-null assertion.
  const measured: MeasuredEntry[] = blocks.flatMap((block) =>
    block.returnState === 'measured' && block.return ? [{ block, result: block.return }] : [],
  );
  const named = blocks.length > 1;

  return (
    <Tile eyebrow="Rendimento" ariaLabel="Rendimento del fondo" aside={aside} reading={reading} className={className}>
      {measured.map(({ block, result }, index) => (
        <MeasuredBlock key={block.key} block={block} result={result} named={named} first={index === 0} />
      ))}

      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
