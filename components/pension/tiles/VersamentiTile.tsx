'use client';

/**
 * VERSAMENTI — «quali versamenti ho registrato?»: the ledger of the axis year, at the tile's
 * cadence. The tile is the one management surface of Previdenza, so it keeps being a table from
 * `desktop:` (DESIGN.md → Table inside a Tile: the 9px sub-eyebrow as the header, 13px cells,
 * every number mono, rows separated by a 1px border and nothing else, a `<th scope="row">` on
 * the date) and becomes a flat `divide-y` list below it — a card per row would be a card inside
 * the tile. ONE of the two is mounted, chosen by the `desktop:` media query: mounting both and
 * hiding one doubled every row's subtree and its hooks (2026-09-13).
 *
 * Nothing is computed here: the rows come from `summarizeLedger` (`lib/utils/pensionSummary.ts`)
 * with the names already resolved, the reading, the aside and the footer are the narrative's,
 * and the component only formats a date and an amount. A contribution is a flow, never a gain,
 * so no figure wears a sign token.
 *
 * Elimina is a two-click confirm without a timer (`useArmedDelete`): a 3-second auto-disarm would
 * be a WCAG time limit, and the row unmounts on success, so the hook disarms BEFORE delegating.
 * The armed button reads «Conferma» and the ROW says the consequence in visible words
 * («eliminando, il conto verrà riaccreditato», in the hint cell — the 90px action column
 * cannot hold a sentence), the same words the button's accessible name carries: a sighted
 * reader used to get less than a screen reader at the destructive moment. The arm and the disarm are announced
 * through ONE live region for the whole tile (emptying a live region announces nothing, so the
 * disarm is a sentence too); one region per row made a keyboard reader hear «Eliminazione
 * annullata» on every Tab away from an armed button. In demo the buttons are disabled and the
 * aside says why in visible copy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import { NATURE_LABELS, type LedgerRow } from '@/lib/utils/pensionSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { GHOST_BUTTON_CLASS } from '@/components/pension/pensionStyles';

export interface VersamentiTileProps {
  /** The axis year — the eyebrow's scope and the «competenza» hint of a straddling row. */
  taxYear: number;
  /** `describeVersamenti(ledger)` — the count, the latest row, its source. */
  reading: Narrative;
  /** `describeVersamentiAside(ledger)` — «4 versamenti». */
  aside: string;
  /** `VERSAMENTI_FOOTER` — what deleting a row undoes, and where a January row lives. */
  footer: Narrative;
  /** The year's rows, newest first (`summarizeLedger(...).rows`). */
  rows: LedgerRow[];
  /** More than one fund on the account: the fund column (desktop) or line (below) is printed. */
  showFund: boolean;
  /** Called on the confirming click; the parent owns the mutation and the toast. */
  onDelete: (row: LedgerRow) => void;
  /** Demo mode: every delete is disabled and the aside says so. */
  isDemo: boolean;
  className?: string;
}

/** Rows shown before «Mostra tutti»: a year of monthly TFR + employer + voluntary is 36, most years are fewer. */
const VISIBLE_ROWS = 12;

/** The same query as Tailwind's `desktop:` (globals.css `--breakpoint-desktop`), never `lg:`. */
const DESKTOP_QUERY = '(min-width: 1440px)';

// The head and the cells share the same right padding: a right-aligned «Importo» header without
// it would end 16px past the amounts under it (border-collapse aligns edges, not text).
const HEAD_CLASS = cn(TILE_SUB_EYEBROW_CLASS, 'border-b border-border pb-2 pr-4 text-left align-bottom');
const CELL_CLASS = 'border-b border-border py-[9px] pr-4 text-[13px] align-middle';

function formatDay(date: Date): string {
  return date.toLocaleDateString('it-IT');
}

/** «Volontario» → «volontario» in a sentence; an acronym (TFR) keeps its case. */
function natureInSentence(row: LedgerRow): string {
  const label = NATURE_LABELS[row.nature];
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

interface HintOptions {
  /** Print the fund's name first (more than one fund on the account). */
  fund: boolean;
  /** Print «competenza {year}» for a straddling row — the phone row prints it beside the date instead. */
  competence: number | null;
  /** Append the free-text notes — the table has a column for them, the phone line does not. */
  notes: boolean;
}

/** The muted hints of a row, in the order the eye reads them: fund, source, recording date, competence, notes. */
function rowHints(row: LedgerRow, { fund, competence, notes }: HintOptions): string[] {
  const hints: string[] = [];
  if (fund) hints.push(row.fundName);
  if (row.sourceAccountName) hints.push(`dal ${row.sourceAccountName}`);
  if (row.recordedInLaterMonth) hints.push(`registrato il ${formatDay(row.recordedOn)}`);
  if (competence !== null && row.isStraddling) hints.push(`competenza ${competence}`);
  if (notes && row.notes) hints.push(row.notes);
  return hints;
}

/** What deleting THIS row undoes, in the words the armed button and its name both use. */
function deleteConsequence(row: LedgerRow): string | null {
  return row.nature === 'voluntary' ? 'il conto verrà riaccreditato' : null;
}

/**
 * What the armed delete will undo, printed in the row's hint cell in the destructive colour:
 * «eliminando, il conto verrà riaccreditato · registrato il 18/08/2026». Nothing for a row
 * whose delete only debits the fund back (TFR, employer): the footer already says that.
 */
function ArmedConsequence({ row, armed }: { row: LedgerRow; armed: boolean }) {
  const consequence = deleteConsequence(row);
  if (!armed || !consequence) return null;
  return <span className="text-destructive">eliminando, {consequence} · </span>;
}

interface DeleteButtonProps {
  row: LedgerRow;
  onDelete: (row: LedgerRow) => void;
  disabled: boolean;
  /** The tile's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
  /** The tile prints the consequence in the ROW while this button is armed (the 90px column cannot hold it). */
  onArmedChange: (rowId: string, armed: boolean) => void;
}

function DeleteButton({ row, onDelete, disabled, announce, onArmedChange }: DeleteButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, () => onDelete(row));
  // Each transition is announced once, after the render where the state flipped; the disarm
  // only when an arm preceded it (the first render is not a cancellation).
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce('Premi di nuovo per eliminare il versamento');
      onArmedChange(row.id, true);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
      onArmedChange(row.id, false);
    }
  }, [armed, announce, onArmedChange, row.id]);

  const subject = `versamento ${natureInSentence(row)} del ${formatDay(row.date)}`;
  const consequence = deleteConsequence(row);
  const label = armed ? `Conferma eliminazione del ${subject}${consequence ? `, ${consequence}` : ''}` : `Elimina ${subject}`;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      aria-pressed={armed}
      aria-label={label}
      className={cn(
        GHOST_BUTTON_CLASS,
        'h-11 w-11 shrink-0 whitespace-nowrap text-destructive hover:text-destructive desktop:h-8 desktop:w-8',
        armed && 'w-auto border border-destructive px-3 text-[12px] font-medium desktop:w-auto desktop:px-2',
      )}
    >
      {armed ? 'Conferma' : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}

export function VersamentiTile({ taxYear, reading, aside, footer, rows, showFund, onDelete, isDemo, className }: VersamentiTileProps) {
  // Session-only: the ledger opens on its first twelve rows and the reader unfolds the rest.
  const [showAll, setShowAll] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // The row whose delete is armed: its consequence is printed IN the row, beside the hints.
  const [armedRowId, setArmedRowId] = useState<string | null>(null);
  const handleArmedChange = useCallback((rowId: string, armed: boolean) => {
    setArmedRowId((current) => (armed ? rowId : current === rowId ? null : current));
  }, []);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const visibleRows = showAll ? rows : rows.slice(0, VISIBLE_ROWS);
  const canUnfold = rows.length > VISIBLE_ROWS;

  return (
    <Tile
      eyebrow={`Versamenti ${taxYear}`}
      ariaLabel={`Versamenti ${taxYear}`}
      aside={isDemo ? `${aside} · non modificabile in demo` : aside}
      reading={reading}
      className={className}
    >
      {rows.length > 0 && (
        <>
          {isDesktop ? (
            /* From desktop: the table, the last row without its border. */
            <div className="mt-3.5">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={cn(HEAD_CLASS, 'w-[110px]')}>Data</th>
                    <th scope="col" className={cn(HEAD_CLASS, 'w-[120px]')}>Natura</th>
                    {showFund && <th scope="col" className={HEAD_CLASS}>Fondo</th>}
                    <th scope="col" className={HEAD_CLASS}>Note</th>
                    <th scope="col" className={cn(HEAD_CLASS, 'w-[150px] text-right')}>Importo</th>
                    <th scope="col" className={cn(HEAD_CLASS, 'w-[90px] pr-0')}>
                      <span className="sr-only">Azioni</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>*]:border-b-0">
                  {visibleRows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className={cn(CELL_CLASS, 'text-left font-mono font-normal tabular-nums text-foreground')}>
                        {formatDay(row.date)}
                      </th>
                      <td className={cn(CELL_CLASS, 'text-foreground')}>{NATURE_LABELS[row.nature]}</td>
                      {showFund && <td className={cn(CELL_CLASS, 'text-foreground')}>{row.fundName}</td>}
                      <td className={cn(CELL_CLASS, 'text-[11px] text-muted-foreground')}>
                        <ArmedConsequence row={row} armed={armedRowId === row.id} />
                        {rowHints(row, { fund: false, competence: taxYear, notes: true }).join(' · ')}
                      </td>
                      <td className={cn(CELL_CLASS, 'text-right font-mono tabular-nums text-foreground')}>{cachedFormatCurrencyEUR(row.amount)}</td>
                      <td className={cn(CELL_CLASS, 'pr-0 text-right')}>
                        <DeleteButton row={row} onDelete={onDelete} disabled={isDemo} announce={setAnnouncement} onArmedChange={handleArmedChange} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Below desktop: flat rows, the hints on a second line, the delete a 44px target. */
            <ul className="mt-2.5 flex flex-col divide-y divide-border">
              {visibleRows.map((row) => {
                const hints = rowHints(row, { fund: showFund, competence: null, notes: false });
                return (
                  <li key={row.id} className="flex min-h-[44px] items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13px] text-foreground">{NATURE_LABELS[row.nature]}</span>
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatDay(row.date)}</span>
                        {row.isStraddling && <span className="text-[11px] text-muted-foreground">competenza {taxYear}</span>}
                      </div>
                      {/* The hints truncate; the consequence, while armed, is worth a second line. */}
                      {(hints.length > 0 || armedRowId === row.id) && (
                        <p className={cn('m-0 text-[11px] text-muted-foreground', armedRowId === row.id ? 'whitespace-normal' : 'truncate')}>
                          <ArmedConsequence row={row} armed={armedRowId === row.id} />
                          {hints.join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.amount)}</span>
                      <DeleteButton row={row} onDelete={onDelete} disabled={isDemo} announce={setAnnouncement} onArmedChange={handleArmedChange} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canUnfold && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              aria-expanded={showAll}
              className={cn(GHOST_BUTTON_CLASS, 'mt-2 h-11 w-full px-3 text-[12px] desktop:h-8 desktop:w-auto desktop:self-start desktop:px-2')}
            >
              {showAll ? 'Mostra meno' : `Mostra tutti (${rows.length})`}
            </button>
          )}

          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
        </>
      )}

      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
