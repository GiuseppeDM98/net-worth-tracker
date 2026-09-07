'use client';

import { HelpCircle } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { FlowSource } from '@/types/performance';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ContributiTileProps {
  reading: Narrative;
  /** Buys minus sells from the trade ledger in the period; null while the ledger is not migrated. */
  invested: { investedEur: number; divestedEur: number; netInvestedEur: number } | null;
  netCashFlow: number;
  totalIncome: number;
  totalExpenses: number;
  totalDividendIncome: number;
  /** The pension channel of the period (0 when empty): its block appears only when it carries money. */
  pensionFlow: number;
  pensionEntryFlow: number;
  /** The part of `pensionFlow` that only restores a transfer from an account inside the base: not outside money. */
  pensionInternalFlow: number;
  /** The measured boundary flows: what the formulas neutralised when the base is a subset. Block shown when `flowSource !== 'cashflow'`. */
  portfolioFlow: number;
  flowSource: FlowSource;
  measuredFlowMonths: number;
  numberOfMonths: number;
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
 * two versions of one number, and each carries its own definition behind the «?». When the base
 * is a subset a third block says what the return formulas actually neutralised — the capital
 * measured on the base's boundary (registro and quantities) — because it is neither of the two.
 */
export function ContributiTile({
  reading,
  invested,
  netCashFlow,
  totalIncome,
  totalExpenses,
  totalDividendIncome,
  pensionFlow,
  pensionEntryFlow,
  pensionInternalFlow,
  portfolioFlow,
  flowSource,
  measuredFlowMonths,
  numberOfMonths,
  className,
}: ContributiTileProps) {
  const hasPensionFlow = Math.round(pensionFlow) !== 0;
  const hasMeasuredFlow = flowSource !== 'cashflow' && measuredFlowMonths > 0;
  return (
    <Tile eyebrow="Contributi" aside="nel periodo" reading={reading} className={className}>
      <div className={cn('mt-4 grid gap-4', invested ? 'grid-cols-1 tablet:grid-cols-2' : 'grid-cols-1')}>
        {invested && (
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
          <p className={cn(KPI_VALUE_CLASS, 'mt-1.5 text-foreground')}>{signedEuro(netCashFlow)}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            entrate <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(totalIncome, true)}</span> · uscite{' '}
            <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(totalExpenses, true)}</span>
          </p>
        </div>
        {/* The pension channel: capital that crossed the base's boundary through the funds. Kept out of
            «Contributi netti» on purpose — the funds' entry into the base is not money set aside. */}
        {hasPensionFlow && (
          <div className={cn('min-w-0', invested && 'tablet:col-span-2')}>
            <p className={cn(TILE_SUB_EYEBROW_CLASS, 'flex items-center')}>
              Fondi pensione
              <Help label="Fondi pensione">
                Capitale che ha attraversato il confine della base attraverso i fondi pensione: TFR, datoriale e busta paga
                entrati da fuori, l&apos;ingresso del fondo nella base nel mese da cui i suoi versamenti sono tracciati, o un
                volontario uscito da un conto verso un fondo fuori dalla base. Conta nel ROI, nel CAGR e nel TWR come ogni
                altro flusso, ma non è risparmio: resta fuori dai contributi netti.
              </Help>
            </p>
            <p className={cn(KPI_VALUE_CLASS, 'mt-1.5 text-foreground')}>{signedEuro(pensionFlow)}</p>
            {(Math.round(pensionEntryFlow) > 0 || Math.round(pensionInternalFlow) !== 0) && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {Math.round(pensionEntryFlow) > 0 && (
                  <>
                    di cui ingresso nella base <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(pensionEntryFlow, true)}</span>
                  </>
                )}
                {Math.round(pensionEntryFlow) > 0 && Math.round(pensionInternalFlow) !== 0 && ' · '}
                {Math.round(pensionInternalFlow) !== 0 && (
                  <>
                    spostati da un conto nella base <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(Math.abs(pensionInternalFlow), true)}</span>
                  </>
                )}
              </p>
            )}
          </div>
        )}
        {/* The measured boundary flows: with a subset base this is what every return formula neutralised
            in the measured months, from the ledger and the quantities — not the cashflow's savings. */}
        {hasMeasuredFlow && (
          <div className={cn('min-w-0', invested && 'tablet:col-span-2')}>
            <p className={cn(TILE_SUB_EYEBROW_CLASS, 'flex items-center')}>
              Capitale entrato nella base
              <Help label="Capitale entrato nella base">
                Il denaro che ha attraversato il confine della base misurata, misurato sugli strumenti dentro di essa: dal
                registro operazioni dove lo strumento è coperto, dalle variazioni di quantità degli snapshot altrove (un
                conto dentro la base conta il suo saldo). È il flusso che TWR, ROI, CAGR e IRR neutralizzano nei mesi
                misurati; nei mesi senza dettaglio per strumento vale il risparmio del cashflow.
              </Help>
            </p>
            <p className={cn(KPI_VALUE_CLASS, 'mt-1.5 text-foreground')}>{signedEuro(portfolioFlow)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              misurato in <span className="font-mono tabular-nums">{measuredFlowMonths}</span> {measuredFlowMonths === 1 ? 'mese' : 'mesi'} su{' '}
              <span className="font-mono tabular-nums">{numberOfMonths}</span>
              {flowSource === 'mixed' && ' · negli altri vale il risparmio del cashflow'}
            </p>
          </div>
        )}
      </div>
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        {invested
          ? 'Due misure diverse di proposito: il registro conta gli acquisti meno le vendite, il cashflow il risparmio. I dividendi non sono contributi.'
          : 'Il capitale investito arriva dal registro operazioni, non ancora attivo su questo account; i contributi vengono dal cashflow.'}
        {hasMeasuredFlow && ' Le formule di rendimento neutralizzano il capitale entrato nella base, non il risparmio.'}
      </p>
    </Tile>
  );
}
