'use client';

import type { AssistantMonthContextBundle } from '@/types/assistant';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { signTextClass } from '@/lib/utils/metricColors';
import { describeAssistantCashflow } from '@/lib/utils/assistantNarrative';
import { Tile } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

interface CashflowContestoTileProps {
  cashflow: AssistantMonthContextBundle['cashflow'];
  /** The period the rows belong to, as the tile's aside («Luglio 2026»). */
  periodLabel: string;
}

/** A flat `divide-y` row: label left, mono value right — no box per row inside the tile. */
function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[13px] font-semibold tabular-nums text-foreground', className)}>{value}</span>
    </div>
  );
}

const MINUS = '−';

/**
 * The period's cashflow, the numbers the assistant's savings clause rests on: income,
 * dividends (only when there were any), spending and the net flow. A cost is printed
 * unsigned and uncoloured (the sign tokens mean gain and loss); the net flow is the one
 * signed figure.
 */
export function CashflowContestoTile({ cashflow, periodLabel }: CashflowContestoTileProps) {
  const net = cashflow.netCashFlow;
  const netText = `${net < 0 ? MINUS : net > 0 ? '+' : ''}${cachedFormatCurrencyEUR(Math.abs(net), true)}`;

  return (
    <Tile eyebrow="Cashflow" aside={periodLabel} reading={describeAssistantCashflow(cashflow)}>
      <div className="mt-3 divide-y divide-border">
        <Row label="Entrate" value={cachedFormatCurrencyEUR(cashflow.totalIncome, true)} />
        {cashflow.totalDividends > 0 && <Row label="Dividendi" value={cachedFormatCurrencyEUR(cashflow.totalDividends, true)} />}
        <Row label="Uscite" value={cachedFormatCurrencyEUR(Math.abs(cashflow.totalExpenses), true)} />
        <Row label="Flusso netto" value={netText} className={net !== 0 ? signTextClass(net) : undefined} />
      </div>
    </Tile>
  );
}
