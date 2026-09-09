'use client';

/**
 * REDDITO PASSIVO — «quanto potrei prelevare oggi?»: the annual allowance at the SWR as the
 * tile's figure, then the same money per month and per day, the years of expenses the net worth
 * covers (with the liquid and illiquid split inline) and the current withdrawal rate against the
 * safe one — the one row on the page that earns a sign colour, because spending more than the
 * SWR of the net worth IS a loss-shaped fact, where a projection year is not.
 *
 * The old companion card carried the same rows; what changed is the cadence (eyebrow, reading,
 * figure, flat rows) and the source: every number is `summarizePassiveIncome(metrics)`.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { PassiveIncome } from '@/lib/utils/fireSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { SettledCurrencyValue } from '@/components/fire-simulations/SettledValue';

interface RedditoPassivoTileProps {
  reading: Narrative;
  income: PassiveIncome;
  className?: string;
}

function Row({ label, caption, value, valueClass }: { label: string; caption?: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        {caption && <span className="block text-[11px] leading-[1.4] text-muted-foreground/70">{caption}</span>}
      </span>
      <span className={cn('shrink-0 text-right font-mono text-[14px] tabular-nums text-foreground', valueClass)}>{value}</span>
    </div>
  );
}

const oneDecimal = (value: number) => value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatRate(value: number): string {
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}

export function RedditoPassivoTile({ reading, income, className }: RedditoPassivoTileProps) {
  const split = [
    income.liquidYears > 0 ? `${oneDecimal(income.liquidYears)} liquidi` : null,
    income.illiquidYears > 0 ? `${oneDecimal(income.illiquidYears)} illiquidi` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Tile eyebrow="Reddito passivo" aside={`oggi, al ${formatRate(income.swr)}`} reading={reading} ariaLabel="Reddito passivo sostenibile" className={className}>
      <div className="mt-3 flex items-baseline gap-2">
        <SettledCurrencyValue value={income.annual} compact className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground" />
        <span className="text-[11px] text-muted-foreground">all&apos;anno</span>
      </div>

      <div className="mt-2.5 flex flex-col divide-y divide-border">
        <Row label="Al mese" value={cachedFormatCurrencyEUR(income.monthly, true)} />
        <Row label="Al giorno" value={formatCurrency(income.daily)} />
        <Row
          label="Anni di spesa coperti"
          value={
            income.yearsOfExpenses > 0 ? (
              <>
                {oneDecimal(income.yearsOfExpenses)}
                {split.length > 0 && <span className="text-[11px] text-muted-foreground"> · {split.join(' · ')}</span>}
              </>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Prelievo attuale"
          caption={`spese ÷ patrimonio, contro un SWR del ${formatRate(income.swr)}`}
          value={income.currentWR > 0 ? formatPercentage(income.currentWR, 1) : '—'}
          valueClass={income.overSwr ? 'text-destructive' : undefined}
        />
      </div>
    </Tile>
  );
}
