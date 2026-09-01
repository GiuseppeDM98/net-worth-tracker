// components/pdf/sections/PerformanceSection.tsx
// Rendimenti: how the portfolio performed, and against how much risk.

import { PDFPage, PDFSection, PDFMetrics, PDFNote, type PDFMetric } from '../primitives/PDFTile';
import type { PerformanceData } from '@/types/pdf';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { describePerformanceSection, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';

interface PerformanceSectionProps {
  data: PerformanceData;
  reportScope: string;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

/**
 * A percentage that may be unknown.
 *
 * `null` is not zero: a metric the window cannot support prints «N/D», never «0,00%». The
 * distinction matters most on drawdown, where a zero would read as "never fell".
 */
function pct(value: number | null | undefined, decimals = 2): string {
  return value === null || value === undefined ? 'N/D' : `${formatPercentageIt(value, decimals)}`;
}

function signedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/D';
  return `${value >= 0 ? '+' : '−'}${formatPercentageIt(Math.abs(value), 2)}`;
}

function sign(value: number | null | undefined): PDFMetric['sign'] {
  if (value === null || value === undefined) return undefined;
  return value >= 0 ? 'positive' : 'negative';
}

/** A duration in months, as years and months. */
function months(count: number | null): string {
  if (count === null) return 'N/D';
  const years = Math.floor(count / 12);
  const rest = count % 12;
  if (years === 0) return `${rest} ${rest === 1 ? 'mese' : 'mesi'}`;
  if (rest === 0) return `${years} ${years === 1 ? 'anno' : 'anni'}`;
  return `${years}a ${rest}m`;
}

/**
 * The Rendimenti section: three blocks — return, risk, context — and a fourth when the
 * portfolio pays dividends.
 *
 * Each block keeps its one-line definition, because these are the report's most technical
 * figures and a reader who cannot tell TWR from IRR cannot use either. The definitions sit
 * under the block as a note rather than under each figure: six subtitles in a grid is noise,
 * one sentence per block is a reading.
 */
export function PerformanceSection({ data, reportScope }: PerformanceSectionProps) {
  const title = PDF_SECTION_TITLES.performance;
  const footerNote = `${title} · ${reportScope}`;
  const { metrics, periodLabel } = data;

  const hasDividendData =
    metrics.yocGross !== null ||
    metrics.yocNet !== null ||
    metrics.currentYield !== null ||
    metrics.currentYieldNet !== null;

  const returnMetrics: PDFMetric[] = [
    { label: 'Time-weighted return', value: signedPct(metrics.timeWeightedReturn), sign: sign(metrics.timeWeightedReturn), note: 'la metrica raccomandata' },
    { label: 'CAGR', value: signedPct(metrics.cagr), sign: sign(metrics.cagr), note: 'crescita annualizzata' },
    { label: 'ROI totale', value: signedPct(metrics.roi), sign: sign(metrics.roi), note: 'sul capitale versato' },
    { label: 'Money-weighted (IRR)', value: signedPct(metrics.moneyWeightedReturn), sign: sign(metrics.moneyWeightedReturn), note: 'tiene conto di quando hai versato' },
  ];

  const riskMetrics: PDFMetric[] = [
    { label: 'Volatilità', value: pct(metrics.volatility), note: 'deviazione standard annualizzata' },
    { label: 'Sharpe ratio', value: metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2).replace('.', ',') : 'N/D', note: 'rendimento per unità di rischio' },
    { label: 'Massimo drawdown', value: pct(metrics.maxDrawdown), sign: metrics.maxDrawdown === null ? undefined : 'negative', note: metrics.maxDrawdownDate ? `minimo a ${metrics.maxDrawdownDate}` : undefined },
    { label: 'Durata del drawdown', value: months(metrics.drawdownDuration), note: metrics.drawdownPeriod ?? undefined },
    { label: 'Tempo di recupero', value: months(metrics.recoveryTime), note: metrics.recoveryPeriod ?? undefined },
    { label: 'Durata del periodo', value: months(metrics.numberOfMonths), note: 'finestra analizzata' },
  ];

  const contextMetrics: PDFMetric[] = [
    {
      label: 'Contributi netti',
      value: euro(metrics.netCashFlow),
      sign: sign(metrics.netCashFlow),
      note: `entrate ${euro(metrics.totalIncome)} · uscite ${euro(metrics.totalExpenses)}`,
    },
    { label: 'Dividendi incassati', value: euro(metrics.totalDividendIncome), note: 'lordi, nel periodo' },
  ];

  const dividendMetrics: PDFMetric[] = [
    { label: 'YOC lordo', value: pct(metrics.yocGross), note: 'sul costo di carico' },
    { label: 'YOC netto', value: pct(metrics.yocNet), note: 'al netto delle imposte' },
    { label: 'Current yield lordo', value: pct(metrics.currentYield), note: 'sul valore di mercato' },
    { label: 'Current yield netto', value: pct(metrics.currentYieldNet), note: 'al netto delle imposte' },
  ];

  return (
    <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
      <PDFSection eyebrow={title} scope={periodLabel} reading={describePerformanceSection(data)} ruled={false}>
        <PDFMetrics items={returnMetrics} perRow={2} />
        <PDFNote>
          Il time-weighted return misura il portafoglio ignorando quando hai versato: è il numero da confrontare con un
          indice. Il money-weighted (IRR) misura il tuo risultato, versamenti compresi.
        </PDFNote>
      </PDFSection>

      <PDFSection eyebrow="Rischio" scope="quanto è oscillato per arrivarci">
        <PDFMetrics items={riskMetrics} />
      </PDFSection>

      <PDFSection eyebrow="Contesto" scope="quanto ci hai messo dentro">
        <PDFMetrics items={contextMetrics} perRow={2} />
      </PDFSection>

      {hasDividendData ? (
        <PDFSection eyebrow="Dividendi" scope="rendimenti annualizzati">
          <PDFMetrics items={dividendMetrics} perRow={4} />
          <PDFNote>
            Lo yield on cost si misura sul prezzo che hai pagato, il current yield sul valore di oggi: il primo cresce
            con gli anni, il secondo dice quanto rende comprare adesso.
          </PDFNote>
        </PDFSection>
      ) : null}
    </PDFPage>
  );
}
