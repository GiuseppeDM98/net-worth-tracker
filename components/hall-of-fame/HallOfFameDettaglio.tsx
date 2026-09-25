'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the full ranking — twenty months or ten
 * years — for whichever of the ten combinations the reader asks for.
 *
 * This is where the old page's `Mensile|Annuale` + `Crescita|Calo|Entrate|Spese` switcher went.
 * It is NOT above the grid: the tiles up there ARE the categories, and a switcher over them
 * would answer the same question twice (the One-Tile-One-Question Rule). Down here it governs
 * one tile, so the grid keeps its meaning and nothing is lost — every ranking the document
 * carries is reachable, and so is every note filed against one.
 *
 * Closed by default: the verdict and the five tiles already answer the page's question.
 *
 * Nothing is fetched here — the boards come from `hallOfFameSummary.ts` through the page, the
 * words from `hallOfFameNarrative.ts`, so no figure can disagree with the grid above.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HallOfFameNote } from '@/types/hall-of-fame';
import {
  countNotedRows,
  getBoard,
  type HallOfFameSummary,
  type RecordCategory,
  type RecordPeriod,
} from '@/lib/utils/hallOfFameSummary';
import { describeFullRanking, describePartialYearChip } from '@/lib/utils/hallOfFameNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { NoteTrigger, type NotePrefill } from '@/components/hall-of-fame/NoteTrigger';

interface HallOfFameDettaglioProps {
  summary: HallOfFameSummary;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
  onAddNote: (prefill: NotePrefill, trigger: HTMLElement | null) => void;
}

const PERIOD_OPTIONS: ReadonlyArray<{ value: RecordPeriod; label: string }> = [
  { value: 'monthly', label: 'Mensile' },
  { value: 'annual', label: 'Annuale' },
];

const CATEGORY_OPTIONS: ReadonlyArray<{ value: RecordCategory; label: string }> = [
  { value: 'growth', label: 'Crescita' },
  { value: 'decline', label: 'Calo' },
  { value: 'income', label: 'Entrate' },
  { value: 'expenses', label: 'Spese' },
  { value: 'savings', label: 'Risparmio' },
];

/** The heading of the value column, per ranking. */
const VALUE_HEADER: Record<RecordCategory, string> = {
  growth: 'Crescita',
  decline: 'Calo',
  income: 'Entrate',
  expenses: 'Spese',
  savings: 'Risparmio',
};

/**
 * The two pills pick a VALUE the tile reads, and no `tabpanel` exists for them: `radio`
 * semantics (AGENTS.md → Accessibility). Options keep the tile's 12px, at the dense-list floor
 * of 32px on a pointer (they measured 25px with `py-1`, 2026-09-24) and 44px below `desktop:`.
 */
const PILL_CLASS =
  '[&>button]:min-h-8 [&>button]:text-[12px] max-desktop:[&>button]:min-h-11 max-desktop:[&>button]:text-[13px]';

const MINUS = '−';

export function HallOfFameDettaglio({ summary, notes, onNoteClick, onAddNote }: HallOfFameDettaglioProps) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<RecordPeriod>('monthly');
  const [category, setCategory] = useState<RecordCategory>('growth');

  const board = getBoard(summary, period, category);
  const notedCount = useMemo(() => countNotedRows(board, notes), [board, notes]);
  const reading = useMemo(() => describeFullRanking({ board, notedCount }), [board, notedCount]);

  const isMonthly = period === 'monthly';
  const signedValue = category === 'growth' || category === 'decline' || category === 'savings';
  const signedPercentage = category === 'growth' || category === 'decline';
  // Only a net-worth ranking prints the base it was measured against.
  const showBase = category === 'growth' || category === 'decline';
  const showPercentage = !!board && board.rows.some((row) => row.percentage !== null);

  // Whether the table actually scrolls inside its strip: only then the right edge fades, so
  // the columns cut off at 390 («Variazione», «Patrimonio prima», «Nota») read as continuing
  // instead of as missing. Measured, never assumed (AGENTS.md → the Strumenti precedent).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [tableScrolls, setTableScrolls] = useState(false);
  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current;
      setTableScrolls(!!el && el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, period, category, showBase, showPercentage]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* No `aria-label`: the name is the visible text, contents included — a one-word label hid from a
          screen reader the sentence a sighted reader uses to decide whether to open it (WCAG 2.5.3). */}
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border-t border-border/40 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          {/* A flex item drops a leading space on screen, but the accessible name keeps it. */}
          <span className="sr-only">: </span>
          <span className="text-[13px] text-muted-foreground">
            La classifica completa — 20 mesi e 10 anni, per crescita, calo, entrate, spese e risparmio
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-12')}>
            <Tile
              eyebrow="Classifica completa"
              aside={
                /* The two pills sit side by side only from desktop: at 390 they are 464px of
                   controls in a 318px tile. Below that width they stack, their targets grow to
                   44px (a 32px tab is a mouse size), and each one scrolls inside its own strip
                   that bleeds to the tile's padding — the tile scrolls, never the page. */
                <div className="flex max-w-full flex-col items-start gap-2 desktop:flex-row desktop:items-center">
                  <div className="max-w-full overflow-x-auto max-desktop:-mx-5 max-desktop:px-5">
                    <SegmentedPill
                      options={PERIOD_OPTIONS}
                      value={period}
                      onChange={setPeriod}
                      layoutId="hof-detail-period"
                      ariaLabel="Periodo della classifica"
                      semantics="radio"
                      className={PILL_CLASS}
                    />
                  </div>
                  <div className="max-w-full overflow-x-auto max-desktop:-mx-5 max-desktop:px-5">
                    <SegmentedPill
                      options={CATEGORY_OPTIONS}
                      value={category}
                      onChange={setCategory}
                      layoutId="hof-detail-category"
                      ariaLabel="Categoria della classifica"
                      semantics="radio"
                      className={PILL_CLASS}
                    />
                  </div>
                </div>
              }
              reading={reading}
              ariaLabel="Classifica completa"
            >
              {/* An absence is the reading's ONE sentence: nothing repeats it in the body. */}
              {board && board.total > 0 && (
                /* The table scrolls inside its own wrapper, never the page; the -mx/px pair lets
                   the scroll reach the tile's edge, and the fade says the columns go on. */
                <div
                  ref={scrollerRef}
                  className={cn(
                    '-mx-5 mt-3 overflow-x-auto px-5',
                    tableScrolls && '[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]',
                  )}
                >
                  <table className="w-full min-w-[520px] border-collapse">
                    <thead>
                      <tr>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[52px] pb-2 text-left')}>
                          Pos.
                        </th>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left')}>
                          {isMonthly ? 'Mese' : 'Anno'}
                        </th>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[130px] pb-2 text-right')}>
                          {VALUE_HEADER[category]}
                        </th>
                        {showPercentage && (
                          <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[100px] pb-2 text-right')}>
                            {category === 'savings' ? 'Quota' : 'Variazione'}
                          </th>
                        )}
                        {showBase && (
                          <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[150px] pb-2 text-right')}>
                            {isMonthly ? 'Patrimonio prima' : 'Patrimonio a inizio anno'}
                          </th>
                        )}
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[56px] pb-2 text-right')}>
                          Nota
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.rows.map((row, index) => {
                        const partial = describePartialYearChip(row);
                        return (
                          <tr key={row.key} className="group border-t border-border">
                            <th
                              scope="row"
                              className="py-[9px] text-left font-mono text-[13px] font-normal tabular-nums text-muted-foreground"
                            >
                              {index + 1}
                            </th>
                            <td className="py-[9px] text-[13px] text-foreground">
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                {row.longLabel}
                                {row.isCurrent && <span className={TILE_SUB_EYEBROW_CLASS}>ora</span>}
                                {partial && (
                                  <span className={cn(TILE_SUB_EYEBROW_CLASS, 'normal-case tracking-normal')}>{partial}</span>
                                )}
                              </span>
                            </td>
                            <td
                              className={cn(
                                'py-[9px] text-right font-mono text-[13px] tabular-nums',
                                signedValue ? signTextClass(row.value) : 'text-foreground',
                              )}
                            >
                              {signedValue && (row.value >= 0 ? '+' : MINUS)}
                              {cachedFormatCurrencyEUR(Math.abs(row.value), true)}
                            </td>
                            {showPercentage && (
                              <td className="py-[9px] text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                                {row.percentage === null ? (
                                  '—'
                                ) : (
                                  <>
                                    {signedPercentage && (row.percentage >= 0 ? '+' : MINUS)}
                                    {formatPercentage(Math.abs(row.percentage), 1)}
                                  </>
                                )}
                              </td>
                            )}
                            {showBase && (
                              <td className="py-[9px] text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                                {row.base === null ? '—' : cachedFormatCurrencyEUR(row.base, true)}
                              </td>
                            )}
                            <td className="py-[5px] text-right">
                              <span className="flex justify-end">
                                <NoteTrigger
                                  notes={notes}
                                  sectionKey={board.sectionKey}
                                  year={row.year}
                                  month={row.month}
                                  onNoteClick={onNoteClick}
                                  onAddNote={onAddNote}
                                  alwaysVisible
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <TileMethodNote
                summary="Il primo mese dello storico non entra in nessuna classifica."
                subject="Classifica completa"
              >
                <span>
                  Ogni record confronta un periodo con quello prima: il primo mese non ha un mese prima
                  con cui confrontarsi, e un anno che parte a dicembre è misurato su quel solo mese.
                </span>
                <span>Un periodo chiuso esattamente dov{"'"}era non è né una crescita né un calo.</span>
              </TileMethodNote>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
