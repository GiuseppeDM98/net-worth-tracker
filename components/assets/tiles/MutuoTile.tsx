'use client';

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { describeMortgage, describeMortgageScope, describeMortgageYearScope, loanNoun, payoffKpiValue } from '@/lib/utils/patrimonioNarrative';
import { MORTGAGE_RING_COLORS, mortgageRingSegments, mortgageYearPaid, type MortgageSummary } from '@/lib/utils/mortgageSummary';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS, type TileCollapse } from '@/components/ui/tile';
import { RingChart } from '@/components/ui/ring-chart';
import { TileMethodNote } from '@/components/ui/tile-method-note';

interface MutuoTileProps {
  summary: MortgageSummary;
  /** Several loans with linked instalments: the aside names which one this tile is. */
  showPropertyName: boolean;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow, in words (The Closed-Row Rule). */
  asideWhenClosed?: string;
  className?: string;
}

/** `swatch`: the ring's arc colour before the label, when the figure is a part of the ring. */
function Kpi({ label, value, caption, swatch }: { label: string; value: string; caption?: string; swatch?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={cn(TILE_SUB_EYEBROW_CLASS, swatch && 'flex items-center gap-1.5')}>
        {swatch && <span className="h-2 w-2 shrink-0 self-center rounded-[2px]" style={{ background: swatch }} aria-hidden="true" />}
        {label}
      </p>
      <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">{value}</p>
      {caption && <p className="text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>}
    </div>
  );
}

/**
 * «Quanto mi costa il mutuo?» — Patrimonio's tile for a loan whose instalments are linked to it
 * (lib/utils/mortgageRepayment.ts; one per property until 2026-10-10). The eyebrow says «Mutuo»
 * for a loan that finances a property and «Prestito» for one that finances nothing; the aside
 * names the loan (and its property). The reading says what this year's settled instalments paid
 * in interest and repaid in principal, and where the plan ends; the four figures are the debt,
 * the year's interest and principal, and the projected end. From the second measured year a
 * «Per anno» table lists every year, a partial one captioned («da settembre», «finora»). Every
 * number comes from `summarizeMortgage`, every sentence from `patrimonioNarrative`.
 *
 * Interest is neither a gain nor a loss of the portfolio but a cost already counted in Cashflow,
 * so no figure here takes a sign colour (AGENTS.md → sign tokens mean gain and loss).
 */
export function MutuoTile({ summary, showPropertyName, collapse, asideWhenClosed, className }: MutuoTileProps) {
  const payoff = summary.payoff;
  const payoffValue = payoffKpiValue(payoff);
  const payoffCaption =
    payoff?.kind === 'date'
      ? `${payoff.months === 1 ? '1 rata' : `${payoff.months} rate`} al ritmo di oggi`
      : payoff?.kind === 'never'
        ? 'la rata copre appena gli interessi'
        : undefined;

  const eyebrow = summary.kind === 'mortgage' ? 'Mutuo' : 'Prestito';
  // A mortgage is named by its property, a personal loan by its own name.
  const aside = summary.propertyName ?? summary.loanName;
  const ring = mortgageRingSegments(summary);

  return (
    <Tile
      eyebrow={eyebrow}
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      ariaLabel={showPropertyName ? `${eyebrow} · ${aside}` : eyebrow}
      aside={showPropertyName ? aside : undefined}
      reading={describeMortgage(summary)}
      className={className}
    >
      {/* Four KPIs across from 560px of the GRID's width (a container of its own), from 680px beside the ring:
          there the grid is the tile less the ring, and at 768 (~584px) four six-figure KPIs of ~152px touched
          (the tour of 2026-11-15; 4 × 152 + 3 × 24 = 680); in the 360px index of a tablet in landscape the tile is a phone's width
          at a 1024px viewport (2026-10-16). The ring (The Ring Rule, 2026-11-12) is the year's settled
          instalments, interest and principal, its two KPIs led by their arcs' swatches. */}
      <div className="@container mt-3.5">
        <div className="flex flex-col items-center gap-4 @[560px]:flex-row @[560px]:items-start">
          {ring && (
            <RingChart
              segments={ring}
              centerValue={mortgageYearPaid(summary)}
              centerLabel="pagati"
              ariaLabel={`Rate pagate nel ${summary.year}`}
              size={96}
            />
          )}
          <div className="@container w-full min-w-0 @[560px]:flex-1">
            <div className={cn('grid grid-cols-2 gap-x-6 gap-y-4', ring ? '@[680px]:grid-cols-4' : '@[560px]:grid-cols-4')}>
              <Kpi label="Debito residuo" value={cachedFormatCurrencyEUR(summary.debt)} />
              <Kpi
                label={`Interessi ${summary.year}`}
                value={cachedFormatCurrencyEUR(summary.yearInterest)}
                caption={summary.totalInterest > summary.yearInterest ? `${cachedFormatCurrencyEUR(summary.totalInterest)} dal collegamento` : undefined}
                swatch={ring ? MORTGAGE_RING_COLORS.interest : undefined}
              />
              <Kpi
                label={`Capitale ${summary.year}`}
                value={cachedFormatCurrencyEUR(summary.yearPrincipal)}
                swatch={ring ? MORTGAGE_RING_COLORS.principal : undefined}
              />
              <Kpi label="Fine prevista" value={payoffValue} caption={payoffCaption} />
            </div>
          </div>
        </div>
      </div>
      {/* One year is already the KPIs above: the list earns its place from the second one. */}
      {summary.byYear.length >= 2 && (
        <div className="mt-4">
          <p className={TILE_SUB_EYEBROW_CLASS}>Per anno</p>
          {/* Capped from tablet up: four columns across a 1400px tile put a year 1000px from its figures. */}
          <table className="mt-1.5 w-full text-[13px] tablet:max-w-[560px]">
            <caption className="sr-only">Interessi e capitale pagati con le rate del mutuo, anno per anno</caption>
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th scope="col" className="py-1 text-left font-normal">Anno</th>
                <th scope="col" className="py-1 text-right font-normal">Interessi</th>
                <th scope="col" className="py-1 text-right font-normal">Capitale</th>
                <th scope="col" className="py-1 pl-3 text-right font-normal">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.byYear.map((entry) => {
                const scope = describeMortgageYearScope(entry, summary.year);
                return (
                  <tr key={entry.year}>
                    <th scope="row" className="py-[7px] text-left font-normal">
                      <span className="font-mono tabular-nums text-foreground">{entry.year}</span>
                      {scope && <span className="ml-1.5 text-[11px] text-muted-foreground">{scope}</span>}
                    </th>
                    <td className="py-[7px] text-right font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(entry.interest)}</td>
                    <td className="py-[7px] text-right font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(entry.principal)}</td>
                    <td className="py-[7px] pl-3 text-right font-mono tabular-nums text-muted-foreground">{entry.instalments}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <TileMethodNote summary={describeMortgageScope(summary)} subject={eyebrow} className="mt-4">
        <span>
          Ogni rata collegata al {loanNoun(summary.kind)}, nel suo giorno, divide l&apos;importo in interessi (debito del giorno ×
          TAN / 12) e capitale (il resto), e solo il capitale riduce il debito. Un&apos;estinzione anticipata va tutta in
          capitale. Qui si sommano le rate già pagate dell&apos;anno.
        </span>
        <span>
          Le rate pagate prima del collegamento non sono misurate e non vengono ricostruite. Spese, penali o assicurazioni
          prelevate con la rata vanno nella sua commissione, o finirebbero nel capitale.
        </span>
        <span>
          La fine prevista applica l&apos;ammortamento alla francese al debito di oggi, al TAN e all&apos;ultima rata
          collegata: cambia se cambiano il tasso o la rata.
        </span>
      </TileMethodNote>
    </Tile>
  );
}
