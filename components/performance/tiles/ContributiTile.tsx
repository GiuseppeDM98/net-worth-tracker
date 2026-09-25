'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CapitalEnteredChannel, CapitalEnteredSummary } from '@/lib/utils/performanceSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';

interface ContributiTileProps {
  reading: Narrative;
  /** The capital the return formulas neutralised, channel by channel (`summarizeCapitalEntered`). */
  capital: CapitalEnteredSummary;
  /** Months measured in the period, for the coverage of each channel. */
  numberOfMonths: number;
  /** Real buys and sells from the trade ledger in the period, opening positions excluded; null while the ledger is not migrated. */
  invested: { investedEur: number; divestedEur: number; netInvestedEur: number } | null;
  netCashFlow: number;
  totalIncome: number;
  totalExpenses: number;
  totalDividendIncome: number;
  /** The part of the pension channel that is the funds' own entry into the base. */
  pensionEntryFlow: number;
  /** The part of the pension channel that only restores a transfer from an account inside the base: not outside money. */
  pensionInternalFlow: number;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

const euro = (value: number) => cachedFormatCurrencyEUR(Math.abs(value), true);

/** A flow is signed and never sign-coloured: capital coming in is not a gain, capital leaving is not a loss. */
function signedEuro(value: number): string {
  return `${Math.round(value) < 0 ? '−' : ''}${euro(value)}`;
}

function months(count: number): string {
  return `${count} ${count === 1 ? 'mese' : 'mesi'}`;
}

/** One line of the tile: a name, the fact that qualifies it underneath, the amount on the right. */
function Row({ label, caption, amount, muted }: { label: string; caption?: React.ReactNode; amount: number; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={cn('text-[13px] leading-[1.35]', muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</p>
        {caption && <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>}
      </div>
      <p className={cn('shrink-0 font-mono text-[13px] font-semibold tabular-nums', muted ? 'text-muted-foreground' : 'text-foreground')}>{signedEuro(amount)}</p>
    </div>
  );
}

const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono tabular-nums">{children}</span>;

/**
 * «Quanto capitale è entrato nella base?» — ONE answer (2026-09-20): the figure every return
 * formula neutralises, then the channels that add up to it. Until then the tile opened on four
 * figures with a «?» each — the ledger's buys minus sells (which counted the migration's opening
 * positions as purchases: «Hai investito 134.988 €» against 49.089 € of real buys), the cashflow's
 * savings, the pension channel and, last, the one the formulas read. The ledger and the cashflow
 * are still here, under «Per confronto», because a reader who knows those two numbers from
 * Patrimonio and Cashflow must be able to find them and see they are a different measure.
 */
export function ContributiTile({
  reading,
  capital,
  numberOfMonths,
  invested,
  netCashFlow,
  totalIncome,
  totalExpenses,
  totalDividendIncome,
  pensionEntryFlow,
  pensionInternalFlow,
  className,
}: ContributiTileProps) {
  // When every month rode the cashflow the savings ARE a channel above: not a second time below.
  const cashflowIsAChannel = capital.channels.some((channel) => channel.key === 'cashflow' && channel.months >= numberOfMonths);
  const showComparison = invested !== null || !cashflowIsAChannel;

  const channelRow = (channel: CapitalEnteredChannel) => {
    if (channel.key === 'measured') {
      return (
        <Row
          key={channel.key}
          label="Sugli strumenti"
          caption={<>registro e quantità · <Mono>{channel.months}</Mono> {channel.months === 1 ? 'mese' : 'mesi'} su <Mono>{numberOfMonths}</Mono></>}
          amount={channel.amount}
        />
      );
    }
    if (channel.key === 'cashflow') {
      return (
        <Row
          key={channel.key}
          label="Risparmio del cashflow"
          caption={channel.months >= numberOfMonths ? 'entrate meno uscite' : <>nei <Mono>{months(channel.months)}</Mono> senza dettaglio per strumento</>}
          amount={channel.amount}
        />
      );
    }
    const hasEntry = Math.round(pensionEntryFlow) > 0;
    const hasInternal = Math.round(pensionInternalFlow) !== 0;
    // Money that went to funds OUTSIDE the base left it: the row says where, the sign says which way.
    const leftTheBase = channel.amount < 0 && !hasEntry && !hasInternal;
    return (
      <Row
        key={channel.key}
        label="Fondi pensione"
        caption={
          leftTheBase ? (
            'dai conti verso fondi fuori dalla base'
          ) : hasEntry || hasInternal ? (
            <>
              {hasEntry && <>di cui ingresso nella base <Mono>{euro(pensionEntryFlow)}</Mono></>}
              {hasEntry && hasInternal && ' · '}
              {hasInternal && <>spostati da un conto già nella base <Mono>{euro(pensionInternalFlow)}</Mono></>}
            </>
          ) : (
            'TFR, datoriale e busta paga'
          )
        }
        amount={channel.amount}
      />
    );
  };

  return (
    <Tile eyebrow="Contributi" aside="nel periodo" reading={reading} className={className}>
      <p className={cn(KPI_VALUE_CLASS, 'mt-4 text-foreground')}>{signedEuro(capital.total)}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">entrati nella base misurata</p>

      {capital.channels.length > 1 && <div className="mt-3 flex flex-col divide-y divide-border">{capital.channels.map(channelRow)}</div>}

      {showComparison && (
        <>
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-4')}>Per confronto</p>
          <div className="mt-1 flex flex-col divide-y divide-border">
            {invested && (
              <Row
                muted
                label="Registro operazioni"
                caption={<>acquisti <Mono>{euro(invested.investedEur)}</Mono> · vendite <Mono>{euro(invested.divestedEur)}</Mono></>}
                amount={invested.netInvestedEur}
              />
            )}
            {!cashflowIsAChannel && (
              <Row
                muted
                label="Risparmio del cashflow"
                caption={<>entrate <Mono>{euro(totalIncome)}</Mono> · uscite <Mono>{euro(totalExpenses)}</Mono></>}
                amount={netCashFlow}
              />
            )}
          </div>
        </>
      )}

      {/* No summary: «entrati nella base misurata» under the figure already says what it is, and a
          three-column tile has no room for a sentence and the trigger on ONE line. */}
      <TileMethodNote subject="Contributi">
        <span className="block">
          TWR, ROI, CAGR e IRR tolgono dal risultato il denaro entrato o uscito dalla base misurata: è la cifra in alto, e le righe sotto sono i canali che la compongono.
        </span>
        <span className="block">
          Sugli strumenti: dal registro operazioni dove lo strumento è coperto, dalle variazioni di quantità degli snapshot altrove; un conto dentro la base conta il suo saldo. Nei mesi senza dettaglio per strumento vale il risparmio del cashflow.
        </span>
        <span className="block">
          Fondi pensione: TFR, datoriale e busta paga entrati da fuori, e l&apos;ingresso del fondo nella base nel mese da cui i suoi versamenti sono tracciati. Non è risparmio.
        </span>
        <span className="block">
          Per confronto, due misure diverse: il registro conta acquisti meno vendite, commissioni incluse e posizioni d&apos;apertura escluse{invested ? '' : ' (non ancora attivo su questo account)'}; il cashflow conta entrate meno uscite, trasferimenti esclusi. I dividendi (<Mono>{euro(totalDividendIncome)}</Mono>) sono rendimento, non un contributo.
        </span>
      </TileMethodNote>
    </Tile>
  );
}
