'use client';

/**
 * ASSEGNAZIONI — «quale strumento serve quale obiettivo?»: the quotas grouped by goal, each group
 * headed by the goal's dot, name, total and its «Aggiungi», and — beside them — the free shares,
 * closed by the «Non assegnato» residual so the tile visibly adds up to the portfolio (The
 * Narrative Honesty Rule). From `desktop:` two tables at the tile's cadence (sub-eyebrow
 * headers, 13px mono cells, 1px separators); below it the same rows as flat lists with 44px
 * targets.
 *
 * A quota is removed on one click: re-adding it is one dialog away, and the row names what it
 * removes. In demo the controls are disabled and the footer says so.
 */

import { Plus, X } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { AssignmentsView, GoalAssignmentGroup } from '@/lib/utils/goalsSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface AssegnazioniTileProps {
  reading: Narrative;
  aside: string;
  view: AssignmentsView;
  onAdd: (goalId: string) => void;
  onRemove: (goalId: string, assetId: string) => void;
  footer: { narrative: Narrative; tone: 'neutral' | 'warning' };
  isDemo: boolean;
  className?: string;
}

const money = (value: number) => cachedFormatCurrencyEUR(value, true);
const share = (value: number) => formatPercentage(Math.round(value * 10) / 10, Number.isInteger(Math.round(value * 10) / 10) ? 0 : 1);

const ADD_CLASS =
  'inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:h-6 desktop:border-0 desktop:px-1.5 desktop:text-muted-foreground desktop:hover:text-foreground';
const REMOVE_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:h-7 desktop:w-7';

function InstrumentName({ name, ticker }: { name: string; ticker: string | null }) {
  return (
    <span className="flex min-w-0 flex-col leading-[1.3]">
      <span className="truncate text-[13px] text-foreground">{name}</span>
      {ticker && <span className="truncate font-mono text-[11px] text-muted-foreground">{ticker}</span>}
    </span>
  );
}

function GroupHead({ group, onAdd, disabled }: { group: GoalAssignmentGroup; onAdd: () => void; disabled: boolean }) {
  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} aria-hidden="true" />
        <span className="truncate">{group.name}</span>
        <span className="font-mono font-normal tabular-nums text-muted-foreground">{money(group.total)}</span>
      </span>
      <button type="button" onClick={onAdd} disabled={disabled} className={ADD_CLASS} aria-label={`Aggiungi uno strumento a ${group.name}`}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        Aggiungi
      </button>
    </>
  );
}

export function AssegnazioniTile({ reading, aside, view, onAdd, onRemove, footer, isDemo, className }: AssegnazioniTileProps) {
  const removeLabel = (asset: string, goal: string) => `Rimuovi ${asset} da ${goal}`;

  return (
    <Tile eyebrow="Assegnazioni" aside={aside} reading={reading} ariaLabel="Assegnazioni" className={className}>
      {/* Desktop: two tables side by side — the quotas by goal, the free shares. */}
      <div className="mt-3.5 hidden grid-cols-2 gap-x-8 gap-y-3 desktop:grid">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>Strumento</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Quota</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Assegnato</th>
              <th scope="col" className="w-8 pb-2"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          {view.groups.map((group) => (
            <tbody key={group.goalId}>
              <tr className="border-t border-border">
                <th scope="rowgroup" colSpan={3} className="pb-1.5 pt-3 text-left font-normal">
                  <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: group.color }} aria-hidden="true" />
                    <span className="truncate">{group.name}</span>
                    <span className="font-mono font-normal tabular-nums text-muted-foreground">{money(group.total)}</span>
                  </span>
                </th>
                <td className="pb-1.5 pt-3 text-right">
                  <button type="button" onClick={() => onAdd(group.goalId)} disabled={isDemo} className={ADD_CLASS} aria-label={`Aggiungi uno strumento a ${group.name}`}>
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Aggiungi
                  </button>
                </td>
              </tr>
              {group.rows.length === 0 ? (
                <tr className="border-t border-border">
                  <td colSpan={4} className="py-2 text-[12px] italic text-muted-foreground">Nessuna quota assegnata a questo obiettivo.</td>
                </tr>
              ) : (
                group.rows.map((row) => (
                  <tr key={row.assetId} className="border-t border-border">
                    <th scope="row" className="py-2 text-left font-normal">
                      <InstrumentName name={row.name} ticker={row.ticker} />
                    </th>
                    <td className="py-2 text-right font-mono tabular-nums text-foreground">{share(row.percentage)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-foreground">{money(row.value)}</td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => onRemove(group.goalId, row.assetId)} disabled={isDemo} className={REMOVE_CLASS} aria-label={removeLabel(row.name, group.name)}>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          ))}
        </table>

        <table className="w-full self-start text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>Quota libera</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Libero</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Valore</th>
            </tr>
          </thead>
          <tbody>
            {view.free.map((row) => (
              <tr key={row.assetId} className="border-t border-border">
                <th scope="row" className="py-2 text-left font-normal">
                  <InstrumentName name={row.name} ticker={row.ticker} />
                </th>
                <td className="py-2 text-right font-mono tabular-nums text-foreground">{share(row.freePct)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-foreground">{money(row.freeValue)}</td>
              </tr>
            ))}
            <tr className="border-t border-border">
              <th scope="row" className="py-2 text-left font-normal text-muted-foreground">Non assegnato</th>
              <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{view.freeShare !== null ? share(view.freeShare) : '—'}</td>
              <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{money(view.freeTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Below desktop: flat lists, one per goal, closed by the free shares. */}
      <div className="mt-2 flex flex-col desktop:hidden">
        {view.groups.map((group) => (
          <div key={group.goalId} className="border-t border-border first:border-t-0">
            <div className="flex items-center justify-between gap-2 pb-1 pt-3">
              <GroupHead group={group} onAdd={() => onAdd(group.goalId)} disabled={isDemo} />
            </div>
            {group.rows.length === 0 ? (
              <p className="pb-3 text-[12px] italic text-muted-foreground">Nessuna quota assegnata a questo obiettivo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {group.rows.map((row) => (
                  <li key={row.assetId} className="flex min-h-11 items-center gap-2.5 py-1">
                    <InstrumentName name={row.name} ticker={row.ticker} />
                    <span className="ml-auto flex shrink-0 flex-col items-end font-mono text-[13px] tabular-nums leading-[1.3] text-foreground">
                      <span>{money(row.value)}</span>
                      <span className="text-[11px] text-muted-foreground">{share(row.percentage)}</span>
                    </span>
                    <button type="button" onClick={() => onRemove(group.goalId, row.assetId)} disabled={isDemo} className={REMOVE_CLASS} aria-label={removeLabel(row.name, group.name)}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="border-t border-border pb-1 pt-3">
          <p className={TILE_SUB_EYEBROW_CLASS}>
            Quota libera · <span className="font-mono tabular-nums">{money(view.freeTotal)}</span>
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {view.free.map((row) => (
            <li key={row.assetId} className="flex min-h-9 items-center gap-2.5 py-1.5">
              <InstrumentName name={row.name} ticker={row.ticker} />
              <span className="ml-auto flex shrink-0 flex-col items-end font-mono text-[13px] tabular-nums leading-[1.3] text-foreground">
                <span>{money(row.freeValue)}</span>
                <span className="text-[11px] text-muted-foreground">{share(row.freePct)} libero</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <NarrativeText
        segments={isDemo ? [...footer.narrative, { text: ' In demo le quote non si modificano.' }] : footer.narrative}
        className={cn('mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45]', footer.tone === 'warning' ? 'text-warning-foreground' : 'text-muted-foreground')}
        figureClassName="font-medium"
      />
    </Tile>
  );
}
