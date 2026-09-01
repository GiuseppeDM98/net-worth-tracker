'use client';

import { HelpCircle } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ContributiTileProps {
  reading: Narrative;
  /** Buys minus sells from the trade ledger in the period; null while the ledger is not migrated. */
  invested: { investedEur: number; divestedEur: number; netInvestedEur: number } | null;
  netCashFlow: number;
  totalContributions: number;
  totalWithdrawals: number;
  flowSource: 'portfolio' | 'cashflow' | 'mixed';
  totalIncome: number;
  totalExpenses: number;
  totalDividendIncome: number;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

function signedEuro(value: number): string {
  return `${value < 0 ? '−' : ''}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;
}

function Help({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Mostra definizione: ${label}`}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-w-[300px] text-[13px] leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * «Quanto hai messo dentro?» — two figures that measure two different things, side by side on
 * purpose: the ledger's buys minus sells and the cashflow's income minus spending. They are not
 * two versions of one number, and each carries its own definition behind the «?».
 */
export function ContributiTile({
  reading,
  invested,
  netCashFlow,
  totalContributions,
  totalWithdrawals,
  flowSource,
  totalIncome,
  totalExpenses,
  totalDividendIncome,
  className,
}: ContributiTileProps) {
  // Quando i flussi seguono la base (portfolioFlows.ts) il capitale investito NON viene piu' dal
  // registro operazioni ma dalla serie misurata — ed e' quello che il rendimento ha effettivamente
  // neutralizzato. Mostrare il registro mentre si misura con un'altra serie significherebbe
  // stampare un numero che nessuna formula ha usato. `mixed` conta come misurato: la parte dal
  // Cashflow e' un ripiego sui mesi senza breakdown, e la nota in fondo lo dice.
  const measuredFlow = flowSource === 'portfolio' || flowSource === 'mixed';
  const showInvested = measuredFlow || invested !== null;
  const cashflowNet = totalIncome - totalExpenses;

  return (
    <Tile eyebrow="Contributi" aside="nel periodo" reading={reading} className={className}>
      <div className={cn('mt-4 grid gap-4', showInvested ? 'grid-cols-1 tablet:grid-cols-2' : 'grid-cols-1')}>
        {measuredFlow ? (
          <div className="min-w-0">
            <p className={cn(TILE_SUB_EYEBROW_CLASS, 'flex items-center')}>
              Capitale investito
              <Help label="Capitale investito">
                Quanto denaro è entrato negli strumenti nel periodo, letto dalle variazioni di quantità mese per mese:
                una posizione che cresce è capitale entrato, una che cala è capitale uscito. È la stessa serie che il
                rendimento toglie dal calcolo, così un acquisto non viene mai letto come guadagno.
              </Help>
            </p>
            <p className={cn(KPI_VALUE_CLASS, 'mt-1.5 text-foreground')}>{signedEuro(netCashFlow)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              acquisti <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(totalContributions, true)}</span> · vendite{' '}
              <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(totalWithdrawals, true)}</span>
            </p>
          </div>
        ) : (
          invested && (
            <div className="min-w-0">
              <p className={cn(TILE_SUB_EYEBROW_CLASS, 'flex items-center')}>
                Capitale investito
                <Help label="Capitale investito">
                  Acquisti meno vendite registrati nel registro operazioni nel periodo, commissioni incluse. Misura quanto
                  denaro è andato sugli strumenti, non quanto ne hai messo da parte.
                </Help>
              </p>
              <p className={cn(KPI_VALUE_CLASS, 'mt-1.5 text-foreground')}>{signedEuro(invested.netInvestedEur)}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                acquisti <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(invested.investedEur, true)}</span> · vendite{' '}
                <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(invested.divestedEur, true)}</span>
              </p>
            </div>
          )
        )}
        <div className="min-w-0">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'flex items-center')}>
            Contributi netti
            <Help label="Contributi netti">
              Entrate esterne (stipendi, bonus) meno uscite registrate in Cashflow nel periodo, trasferimenti esclusi. I
              dividendi ({cachedFormatCurrencyEUR(totalDividendIncome, true)}) restano fuori: sono rendimento del portafoglio,
              non un contributo. Positivo = stai risparmiando.
            </Help>
          </p>
          <p className={cn(KPI_VALUE_CLASS, 'mt-1.5 text-foreground')}>{signedEuro(cashflowNet)}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            entrate <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(totalIncome, true)}</span> · uscite{' '}
            <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(totalExpenses, true)}</span>
          </p>
        </div>
      </div>
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        {flowSource === 'mixed'
          ? 'Due misure diverse di proposito: il capitale investito è il denaro entrato negli strumenti, il cashflow è quanto ne hai messo da parte. Per i mesi senza dettaglio per strumento il primo ricade sul secondo. I dividendi non sono contributi.'
          : measuredFlow
          ? 'Due misure diverse di proposito: il capitale investito è il denaro entrato negli strumenti, il cashflow è quanto ne hai messo da parte. I dividendi non sono contributi.'
          : invested
            ? 'Due misure diverse di proposito: il registro conta gli acquisti meno le vendite, il cashflow il risparmio. I dividendi non sono contributi.'
            : 'Il capitale investito arriva dal registro operazioni, non ancora attivo su questo account; i contributi vengono dal cashflow.'}
      </p>
    </Tile>
  );
}
