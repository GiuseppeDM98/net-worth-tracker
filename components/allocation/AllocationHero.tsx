/**
 * AllocationHero — the page's one-glance verdict (A1 + A2).
 *
 * Trade Republic asymmetric bento. Left (dominant): total allocated wealth — the anchor
 * every percentage is relative to — now sitting above the AllocationCompositionBar, so the
 * SHAPE of the portfolio is visible before any breakdown row. Right (companion): the
 * BalanceScoreGauge (band-INDEPENDENT "how close to target") above the band-DEPENDENT
 * verdict (in linea, or N classes off target with the single worst drift surfaced).
 *
 * The split is deliberate: the gauge measures absolute distance from target and never moves
 * with the rebalance band; the verdict below it is exactly what the band reclassifies. Both
 * read at a glance, before the user reaches the plan.
 *
 * The count-up is isolated in the `HeroValue` leaf so each animation frame re-renders only
 * that span, never the verdict or the rest of the tree (DESIGN.md count-up isolation rule).
 */
'use client';

import { ChevronDown } from 'lucide-react';
import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import {
  type AllocatableHolding,
  type BalanceSummary,
  type BalanceScore,
} from '@/lib/utils/allocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ActionChip } from './ActionChip';
import { AllocationCompositionBar } from './AllocationCompositionBar';
import { BalanceScoreGauge } from './BalanceScoreGauge';
import type { AllocationData } from '@/types/assets';

interface AllocationHeroProps {
  /** Market total of the investable base — "Patrimonio investito". The single hero number when
   *  there is no leverage (market === notional then). */
  marketValue: number;
  /** Notional exposure total — "Esposizione nozionale". Shown as the second number under leverage,
   *  and it is the denominator the composition bar widths are relative to. */
  notionalValue: number;
  /** Current leverage (notional / market). 1 when unleveraged. */
  leverageRatio: number;
  /** Whether to show the dual-number, leverage-aware hero. */
  hasLeveragedExposure: boolean;
  /** Target leverage (Σtarget / 100), for the chip's "corrente · target" when they differ. */
  targetLeverageRatio: number;
  byAssetClass: Record<string, AllocationData>;
  summary: BalanceSummary;
  balance: BalanceScore;
  assetClassCount: number;
  /** Role `excluded` — outside the total above. Empty hides the caption. */
  excludedHoldings: AllocatableHolding[];
  /** Role `frozen` — INSIDE the total above, but untouchable by the plans. Empty hides the caption. */
  frozenHoldings: AllocatableHolding[];
}

/** Leverage formatted the Italian way, e.g. 1.5 → "1,50×". */
function formatLeverage(ratio: number): string {
  return `${ratio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

/** Leaf so the rAF count-up re-renders only this span. */
function HeroValue({ value }: { value: number }) {
  const animated = useCountUp(value, { duration: 620, once: true });
  // useCountUp returns null on the first frame before the rAF loop seeds a value.
  return <>{cachedFormatCurrencyEUR(animated ?? value)}</>;
}

function formatSignedPp(pp: number): string {
  const sign = pp > 0 ? '+' : pp < 0 ? '−' : '';
  return `${sign}${Math.abs(pp).toFixed(1)} p.p.`;
}

/**
 * A tappable caption that opens the list of holdings behind it. Used for both non-tradable roles —
 * they read alike but mean opposite things about the number above, so each passes its own copy.
 */
function HoldingsCaption({
  label,
  holdings,
  explanation,
}: {
  label: string;
  holdings: AllocatableHolding[];
  explanation: string;
}) {
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0);
  if (holdings.length === 0 || total <= 0) return null;

  return (
    <Popover>
      <PopoverTrigger className="group mt-1 flex items-center gap-1 self-start rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          {label}: {cachedFormatCurrencyEUR(total)} ({holdings.length} asset)
        </span>
        <ChevronDown
          className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <div className="divide-y divide-border/50">
          {[...holdings]
            .sort((a, b) => b.value - a.value)
            .map((holding) => (
              <div
                key={holding.id}
                className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
              >
                <span className="truncate text-xs text-foreground" title={holding.label}>
                  {holding.label}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {cachedFormatCurrencyEUR(holding.value)}
                </span>
              </div>
            ))}
        </div>
        <p className="border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {explanation}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function AllocationHero({
  marketValue,
  notionalValue,
  leverageRatio,
  hasLeveragedExposure,
  targetLeverageRatio,
  byAssetClass,
  summary,
  balance,
  assetClassCount,
  excludedHoldings,
  frozenHoldings,
}: AllocationHeroProps) {
  const { isBalanced, offTargetCount, largestGap } = summary;
  const actionColors = useActionColors();
  const leverageDiffersFromTarget = Math.abs(leverageRatio - targetLeverageRatio) > 0.01;

  return (
    <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
      {/* Dominant: total allocated wealth + portfolio shape. Without leverage, ONE number (market
          == notional). With leverage, TWO paired numbers — investito (market) vs esposizione
          (notional) — stacked on mobile (grid-cols-1) to avoid the ~390px overlap, side-by-side
          from tablet up, with the leverage chip between them. */}
      <div className="flex flex-col rounded-2xl border border-border bg-card p-[22px]">
        {hasLeveragedExposure ? (
          <>
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <div className="flex flex-col">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Patrimonio investito
                </p>
                <p className="mt-2 font-mono text-[34px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[40px]">
                  <HeroValue value={marketValue} />
                </p>
              </div>
              <div className="flex flex-col tablet:border-l tablet:border-border/60 tablet:pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Esposizione nozionale
                </p>
                <p className="mt-2 font-mono text-[34px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[40px]">
                  <HeroValue value={notionalValue} />
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
                Leva {formatLeverage(leverageRatio)}
              </span>
              {leverageDiffersFromTarget && (
                <span className="text-[11px] text-muted-foreground">
                  target {formatLeverage(targetLeverageRatio)}
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {assetClassCount} {assetClassCount === 1 ? 'classe' : 'classi'}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Patrimonio allocato
            </p>
            <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[54px]">
              <HeroValue value={marketValue} />
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {assetClassCount} {assetClassCount === 1 ? 'classe di asset' : 'classi di asset'} · valori correnti
            </p>
          </>
        )}

        {/* Two captions, two OPPOSITE relationships to the number above — hence two lines, not one.
            Frozen wealth is INSIDE the total (it just cannot be moved); excluded wealth is OUTSIDE
            it (and is the whole reason this total differs from the Panoramica net worth). Merging
            them into a single "non ribilanciabili" figure would be the easy, wrong thing. Both are
            clickable, because "which ones?" is the immediate next question. */}
        <HoldingsCaption
          label="Non negoziabili"
          holdings={frozenHoldings}
          explanation="Asset che contano nella tua allocazione — sono soldi investiti in azioni e obbligazioni a tutti gli effetti — ma che non puoi muovere: un fondo pensione vincolato, private equity. Sono INCLUSI nel totale qui sopra e nelle percentuali, così vedi il rischio vero; i piani non li toccano e raggiungono il target muovendo gli altri asset. Il ruolo si imposta sul singolo asset in Patrimonio."
        />
        <HoldingsCaption
          label="Esclusi dall'allocazione"
          holdings={excludedHoldings}
          explanation="Asset che non fanno parte del portafoglio investito — la casa in cui vivi. Restano nel tuo patrimonio (Panoramica, Storico, FIRE) ma sono FUORI dal totale qui sopra e da ogni calcolo di questa pagina: è per questo che il totale è più basso del patrimonio netto. Il ruolo si imposta sul singolo asset in Patrimonio."
        />

        <div className="mt-auto pt-5">
          <AllocationCompositionBar
            byAssetClass={byAssetClass}
            totalValue={notionalValue}
            marketValue={marketValue}
            hasLeveragedExposure={hasLeveragedExposure}
          />
        </div>
      </div>

      {/* Companion: balance score (band-independent) + verdict (band-dependent) */}
      <div className="flex h-full flex-col justify-center gap-4 rounded-2xl border border-border bg-card p-5">
        <BalanceScoreGauge balance={balance} />

        <div className="border-t border-border/60 pt-4">
          {isBalanced ? (
            <>
              <p className="text-sm font-semibold leading-none" style={{ color: actionColors.OK }}>
                In linea
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Tutte le classi sono entro la soglia di ribilanciamento.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
                  {offTargetCount}
                </span>
                <span className="text-sm text-muted-foreground">
                  {offTargetCount === 1 ? 'classe fuori target' : 'classi fuori target'}
                </span>
              </p>
              {largestGap && (
                <div className="mt-3 flex items-center gap-2">
                  <ActionChip action={largestGap.action} color={actionColors[largestGap.action]} />
                  <span className="truncate text-xs text-muted-foreground" title={largestGap.label}>
                    {largestGap.label}
                  </span>
                  <span
                    className="ml-auto font-mono text-xs font-medium tabular-nums"
                    style={{ color: actionColors[largestGap.action] }}
                  >
                    {formatSignedPp(largestGap.difference)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
