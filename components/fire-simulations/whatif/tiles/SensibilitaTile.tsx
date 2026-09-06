'use client';

/**
 * SENSIBILITÀ — «quanto conta un'abitudine?»: the years to FIRE in the base scenario when the
 * annual expenses (rows) and the annual savings (columns) move around the plan of today — the
 * matrix `calculateFIRESensitivityMatrix` already computed, at the tile's cadence: eyebrow,
 * the scope in the aside with the reference-expenses input beside it, a reading line that names
 * the baseline cell and its two neighbours, then the cells.
 *
 * The matrix runs on the plan of TODAY, not on the event (The Off-Axis Tile Rule: a tile
 * measured on another basis names it — the aside says «piano di oggi», the footer says why).
 * The cell tints are the sign tokens at 15%: sooner than today is a gain, later a loss, and the
 * baseline cell is outlined rather than filled — being where you are is not a sign. The old
 * section tinted with chart slots, which say nothing about better or worse on a themed palette.
 *
 * Below `desktop:` the matrix has no rows and columns: each expense level is a block with its
 * savings cells in a two-column grid, labelled explicitly (AGENTS.md § Hierarchy, Density and Disclosure —
 * a cardified mobile view needs its own reading note).
 */

import type { FIRESensitivityCell, FIRESensitivityMatrix } from '@/lib/services/fireService';
import type { Narrative } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface SensibilitaTileProps {
  /** `describeSensitivity(reading)`. */
  reading: Narrative;
  aside: string;
  /** The local reference-expenses override, as typed; empty = the actual expenses. */
  baselineInput: string;
  onBaselineInputChange: (value: string) => void;
  /** The actual annual expenses, shown as the input's placeholder. */
  actualAnnualExpenses: number;
  matrix: FIRESensitivityMatrix | null;
  footer: Narrative;
  className?: string;
}

const compact = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);

const CELL_CLASS: Record<FIRESensitivityCell['relationToBaseline'], string> = {
  baseline: 'border-foreground',
  better: 'border-transparent bg-positive/15',
  worse: 'border-transparent bg-destructive/15',
  neutral: 'border-transparent',
};

function cellText(cell: FIRESensitivityCell): string {
  if (cell.yearsToFIRE === null) return '50+ anni';
  return `${cell.yearsToFIRE} ${cell.yearsToFIRE === 1 ? 'anno' : 'anni'}`;
}

export function SensibilitaTile({ reading, aside, baselineInput, onBaselineInputChange, actualAnnualExpenses, matrix, footer, className }: SensibilitaTileProps) {
  const control = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{aside}</span>
      <label htmlFor="whatIfSensitivityBaselineExpenses" className="flex items-center gap-2">
        <Input
          id="whatIfSensitivityBaselineExpenses"
          type="number"
          step="100"
          min="0"
          inputMode="numeric"
          value={baselineInput}
          onChange={(e) => onBaselineInputChange(e.target.value)}
          placeholder={actualAnnualExpenses > 0 ? String(Math.round(actualAnnualExpenses)) : 'Es. 25000'}
          className="h-11 w-[124px] font-mono text-[12px] tabular-nums desktop:h-7 desktop:text-[11px]"
        />
        <span>spese di riferimento</span>
      </label>
    </span>
  );

  return (
    <Tile eyebrow="Sensibilità" aside={control} reading={reading} ariaLabel="Sensibilità degli anni al FIRE" className={className}>
      {matrix ? (
        <>
          {/* Desktop: the full matrix as a table, headers with scope. */}
          <div className="mt-3.5 hidden overflow-x-auto desktop:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[180px] pb-2 pr-2 text-left font-semibold')}>
                    Spese annue ↓ · risparmio annuo →
                  </th>
                  {matrix.columns.map((column) => (
                    <th key={column.label} scope="col" className="px-2 pb-2 text-center">
                      <span className={cn(TILE_SUB_EYEBROW_CLASS, 'block', column.isBaseline && 'text-foreground')}>{column.label}</span>
                      <span className="block font-mono text-[11px] font-normal tabular-nums text-muted-foreground">{compact(column.annualSavings)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <th scope="row" className="py-2 pr-2 text-left font-normal">
                      <span className={cn('block text-[13px] text-foreground', row.multiplier === 1 && 'font-semibold')}>{row.label}</span>
                      <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{compact(row.annualExpenses)}</span>
                    </th>
                    {row.cells.map((cell, index) => (
                      <td key={`${row.label}-${matrix.columns[index].label}`} className="px-2 py-1.5">
                        <span className={cn('block rounded-md border px-2 py-2 text-center font-mono text-[13px] font-semibold tabular-nums text-foreground', CELL_CLASS[cell.relationToBaseline])}>
                          {cellText(cell)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet: one block per expense level, the savings cells in two columns. */}
          <ul className="mt-3.5 flex flex-col divide-y divide-border desktop:hidden" aria-label="Anni al FIRE per livello di spesa">
            {matrix.rows.map((row) => (
              <li key={row.label} className="py-3 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn('text-[13px] text-foreground', row.multiplier === 1 && 'font-semibold')}>Spese {row.label === 'Base' ? 'di oggi' : row.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{compact(row.annualExpenses)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {row.cells.map((cell, index) => (
                    <div key={`${row.label}-${matrix.columns[index].label}`} className={cn('flex flex-col gap-0.5 rounded-md border px-2.5 py-2', CELL_CLASS[cell.relationToBaseline])}>
                      <span className={TILE_SUB_EYEBROW_CLASS}>Risparmio {matrix.columns[index].label === 'Base' ? 'di oggi' : matrix.columns[index].label}</span>
                      <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">{cellText(cell)}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3.5 text-[13px] text-muted-foreground">Servono un patrimonio FIRE e spese annue maggiori di zero per calcolare la matrice.</p>
      )}

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
