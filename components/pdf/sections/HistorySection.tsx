// components/pdf/sections/HistorySection.tsx
// Storico: how the net worth got here, month by month and year by year.

import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import { PDFPage, PDFSection, PDFMetrics, PDFNote, type PDFMetric } from '../primitives/PDFTile';
import type { HistoryData } from '@/types/pdf';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { describeHistorySection, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';

interface HistorySectionProps {
  data: HistoryData;
  reportScope: string;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

const SHORT_MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** 'YYYY-MM' → 'ago 2026'. The snapshot key is a month, so the label is one too. */
function formatMonth(date: string): string {
  const [year, month] = date.split('-');
  const index = Number(month) - 1;
  return `${SHORT_MONTHS[index] ?? month} ${year}`;
}

const signedEuro = (value: number) => `${value >= 0 ? '+' : '−'}${euro(Math.abs(value))}`;
const signedPct = (value: number) => `${value >= 0 ? '+' : '−'}${formatPercentageIt(Math.abs(value), 1)}`;

/**
 * The Storico section.
 *
 * Two pages when there is a multi-year history: the evolution month by month, then the year over
 * year. The second page exists only when `yoyComparison` has rows — a report covering one
 * calendar year has nothing to compare, and an empty table saying so is worse than no page.
 */
export function HistorySection({ data, reportScope }: HistorySectionProps) {
  const title = PDF_SECTION_TITLES.history;
  const footerNote = `${title} · ${reportScope}`;

  // Two snapshots are the minimum for a growth figure: one point is a position, not a history.
  if (!data || data.netWorthEvolution.length < 2) {
    return (
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection eyebrow={title} reading={describeHistorySection(data)} ruled={false}>
          <PDFText variant="caption">Servono almeno due snapshot per misurare una variazione.</PDFText>
        </PDFSection>
      </PDFPage>
    );
  }

  const metrics: PDFMetric[] = [];
  if (data.totalGrowth !== undefined && data.totalGrowthAbsolute !== undefined) {
    metrics.push({
      label: 'Crescita del periodo',
      value: signedPct(data.totalGrowth),
      note: signedEuro(data.totalGrowthAbsolute),
      sign: data.totalGrowth >= 0 ? 'positive' : 'negative',
    });
  }
  if (data.oldestSnapshot) {
    metrics.push({
      label: 'Primo snapshot',
      value: `${String(data.oldestSnapshot.month).padStart(2, '0')}/${data.oldestSnapshot.year}`,
      note: euro(data.oldestSnapshot.totalNetWorth),
    });
  }
  if (data.latestSnapshot) {
    metrics.push({
      label: 'Ultimo snapshot',
      value: `${String(data.latestSnapshot.month).padStart(2, '0')}/${data.latestSnapshot.year}`,
      note: euro(data.latestSnapshot.totalNetWorth),
    });
  }

  return (
    <>
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection
          eyebrow={title}
          scope={`${data.netWorthEvolution.length} snapshot`}
          reading={describeHistorySection(data)}
          ruled={false}
        >
          {metrics.length > 0 ? <PDFMetrics items={metrics} /> : null}
        </PDFSection>

        <PDFSection eyebrow="Evoluzione mensile" scope="valori di fine mese">
          <PDFTable
            headers={['Mese', 'Totale', 'Liquido', 'Illiquido']}
            rows={data.netWorthEvolution.map((point) => [
              formatMonth(point.date),
              euro(point.totalNetWorth),
              euro(point.liquidNetWorth),
              euro(point.illiquidNetWorth),
            ])}
            columnWidths={['22%', '26%', '26%', '26%']}
            alignRight={[1, 2, 3]}
          />
        </PDFSection>
      </PDFPage>

      {data.yoyComparison.length > 0 && (
        <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
          <PDFSection
            eyebrow="Anno per anno"
            scope={`${data.yoyComparison.length} anni`}
            ruled={false}
          >
            <PDFTable
              headers={['Anno', 'Inizio', 'Fine', 'Variazione', '%']}
              rows={data.yoyComparison.map((yoy) => [
                String(yoy.year),
                euro(yoy.startValue),
                euro(yoy.endValue),
                signedEuro(yoy.growth),
                signedPct(yoy.growthPercent),
              ])}
              columnWidths={['14%', '22%', '22%', '22%', '20%']}
              alignRight={[1, 2, 3, 4]}
            />
            <PDFNote>
              Ogni riga confronta il PRIMO e l’ULTIMO snapshot registrato in quell’anno, non il 1° gennaio e il 31
              dicembre: se il primo snapshot dell’anno è di marzo, la variazione copre marzo–dicembre e non dodici mesi.
            </PDFNote>
          </PDFSection>
        </PDFPage>
      )}
    </>
  );
}
