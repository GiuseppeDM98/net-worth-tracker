'use client';

/**
 * PIANO — «cosa faccio con i prossimi soldi?»: the three answers a portfolio's life asks for —
 * Ribilancia (no net flow), Versa (accumulation), Preleva (decumulation) — as ONE tile whose
 * aside switches between them. They are answers to the same question, so they are one tile
 * and not three; and the switch is the tile's aside, not a page-level tab, because the page's
 * verdict is pinned to the Versa answer at this tile's amount whatever mode is showing — a
 * control that changed the verdict would be the page's axis, and this page has none.
 *
 * The tile computes nothing and writes no copy: `view` is `buildPlanView()`'s, the reading is
 * `describePlan()`'s, the footer `describePlanFooter()`'s. The amount is page state (the
 * verdict reads it), so the field only echoes it. Every empty state — no moves, no amount, an
 * amount above the tradable total — is the reading's sentence, and the body draws rows only
 * when there are rows: a «Tutto in linea» card under a «Tutto in linea» reading would say it
 * twice. The rows are flat (`divide-y`) inside the tile, never a box inside the card.
 *
 * A drift is neither a gain nor a loss, so no figure here wears the sign tokens: the amounts
 * take the action colours (COMPRA/VENDI, from `useActionColors()`, resolved once here and
 * passed down), and a contribution stays in the foreground colour — adding money is not a
 * signal. A VENDI capped by frozen wealth prints what you CAN sell, never the raw gap: the gap
 * stays visible in the caption, but the euro figure has to be an order you can actually fill.
 */

import { useId } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { AllocationAction, RebalanceMove } from '@/lib/utils/allocationUtils';
import { MIN_VISIBLE_AMOUNT, type PlanMode, type PlanView } from '@/lib/utils/allocazioneSummary';
import { formatLeverage } from '@/lib/utils/allocazioneNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { Input } from '@/components/ui/input';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AsideToggle, type AsideToggleOption } from '@/components/ui/aside-toggle';
import { ActionChip } from '@/components/allocation/ActionChip';
import { InstrumentTradeList } from '@/components/allocation/InstrumentTradeList';
import { PlanRow } from '@/components/allocation/PlanRow';

interface PianoTileProps {
  mode: PlanMode;
  onModeChange: (mode: PlanMode) => void;
  /** The Versa/Preleva amount as typed; shared with the verdict, so the page owns it. */
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  /** `describePlan(view, band)` */
  reading: Narrative;
  /** `buildPlanView(mode, amount, inputs)` */
  view: PlanView;
  /** `describePlanFooter(mode, leveraged)` */
  footer: string;
}

const MODE_OPTIONS: ReadonlyArray<AsideToggleOption<PlanMode>> = [
  { value: 'rebalance', label: 'Ribilancia' },
  { value: 'contribute', label: 'Versa' },
  { value: 'withdraw', label: 'Preleva' },
];

const MINUS = '−';

// ─── Ribilancia ───────────────────────────────────────────────────────────────

/**
 * One class-level move: chip + class on the left with the drift as «58,3% → 55,0%», the
 * signed euro figure on the right. A move that the frozen slice reduces to nothing has no
 * amount to print, so its right side says why instead of «−0 €».
 */
function MoveRow({ move, actionColors }: { move: RebalanceMove; actionColors: Record<AllocationAction, string> }) {
  const isBuy = move.action === 'COMPRA';
  const isUntradable = move.limitedByFrozen && move.amount < MIN_VISIBLE_AMOUNT;
  const drift = `${formatPercentage(move.currentPercentage, 1)} → ${formatPercentage(move.targetPercentage, 1)}`;
  const caption = move.limitedByFrozen && !isUntradable ? `${drift} · max vendibile · gap ${cachedFormatCurrencyEUR(move.requestedAmount, true)}` : drift;

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ActionChip action={move.action} color={actionColors[move.action]} />
          <span className="truncate text-[13px] font-medium text-foreground" title={move.label}>
            {move.label}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{caption}</p>
      </div>
      <div className="shrink-0 text-right">
        {isUntradable ? (
          <p className="text-[13px] text-muted-foreground">Non negoziabile</p>
        ) : (
          <p className="font-mono text-[18px] font-semibold tabular-nums leading-none" style={{ color: actionColors[move.action] }}>
            {isBuy ? '+' : MINUS}
            {cachedFormatCurrencyEUR(move.amount, true)}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {isUntradable ? 'tutto in asset non negoziabili' : isBuy ? 'da aggiungere' : 'da ridurre'}
        </p>
      </div>
    </li>
  );
}

function RebalanceBody({ view, actionColors }: { view: Extract<PlanView, { mode: 'rebalance' }>; actionColors: Record<AllocationAction, string> }) {
  if (view.trades) {
    if (view.trades.length === 0) return null;
    return (
      <div className="mt-3">
        <InstrumentTradeList trades={view.trades} actionColors={actionColors} ariaLabel="Operazioni del ribilanciamento" />
        {/* The resulting leverage belongs to the trades: with none, it is the current one and the
            Bilanciamento tile already prints it. */}
        {view.resultingLeverageRatio !== null && (
          <p className="mt-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            Leva risultante {formatLeverage(view.resultingLeverageRatio)}
          </p>
        )}
      </div>
    );
  }
  if (view.moves.length === 0) return null;
  return (
    <ul className="mt-3 divide-y divide-border" aria-label="Operazioni del ribilanciamento">
      {view.moves.map((move) => (
        <MoveRow key={move.assetClass} move={move} actionColors={actionColors} />
      ))}
    </ul>
  );
}

// ─── Versa · Preleva ──────────────────────────────────────────────────────────

type FlowView = Extract<PlanView, { mode: 'contribute' | 'withdraw' }>;

function FlowBody({
  view,
  amountInput,
  onAmountInputChange,
  actionColors,
}: {
  view: FlowView;
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  actionColors: Record<AllocationAction, string>;
}) {
  const inputId = useId();
  const isContribute = view.mode === 'contribute';
  // Additions are neutral, not a signal — no action colour, unlike a sell.
  const color = isContribute ? 'var(--foreground)' : actionColors.VENDI;
  const listLabel = isContribute ? 'Ripartizione del versamento' : 'Ripartizione del prelievo';

  return (
    <>
      <div className="mt-3">
        <label htmlFor={inputId} className={`${TILE_SUB_EYEBROW_CLASS} block`}>
          {isContribute ? 'Quanto vuoi investire?' : 'Quanto vuoi prelevare?'}
          {/* The € prefix is decorative; the unit must still reach a screen reader. */}
          <span className="sr-only"> in euro</span>
        </label>
        <div className="relative mt-1.5 max-w-[200px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-muted-foreground" aria-hidden="true">
            €
          </span>
          <Input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            step={100}
            placeholder="1000"
            value={amountInput}
            onChange={(event) => onAmountInputChange(event.target.value)}
            className="h-11 pl-7 font-mono tabular-nums desktop:h-9"
          />
        </div>
      </div>

      {view.trades ? (
        view.trades.length > 0 && (
          <div className="mt-3">
            <InstrumentTradeList trades={view.trades} actionColors={actionColors} ariaLabel={listLabel} />
          </div>
        )
      ) : (
        view.nodes.length > 0 && (
          <ul className="mt-3 divide-y divide-border" aria-label={listLabel}>
            {view.nodes.map((node) => (
              <li key={node.key} className="py-2.5">
                <PlanRow node={node} depth={0} color={color} direction={view.mode} />
              </li>
            ))}
          </ul>
        )
      )}
    </>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

export function PianoTile({ mode, onModeChange, amountInput, onAmountInputChange, reading, view, footer }: PianoTileProps) {
  const actionColors = useActionColors();

  return (
    <Tile
      eyebrow="Piano"
      aside={<AsideToggle options={MODE_OPTIONS} value={mode} onChange={onModeChange} ariaLabel="Tipo di piano" />}
      reading={reading}
    >
      {/* The body follows the view, not the toggle: the two agree by construction, and the
          view's mode is what narrows the union. A Ribilancia with nothing to do draws no body at
          all — the reading already said «Tutto in linea» — so the footer sits right under it. */}
      {view.mode === 'rebalance' ? (
        (view.trades ? view.trades.length > 0 : view.moves.length > 0) && (
          <div className="mb-3.5">
            <RebalanceBody view={view} actionColors={actionColors} />
          </div>
        )
      ) : (
        <div className="mb-3.5">
          <FlowBody view={view} amountInput={amountInput} onAmountInputChange={onAmountInputChange} actionColors={actionColors} />
        </div>
      )}

      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.5] text-muted-foreground">{footer}</p>
    </Tile>
  );
}
