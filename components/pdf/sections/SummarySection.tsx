// components/pdf/sections/SummarySection.tsx
// Riepilogo: the nine figures of the seven sections, and what the report rests on.

import { PDFPage, PDFSection, PDFMetrics, PDFNote, type PDFMetric } from '../primitives/PDFTile';
import type { SummaryData } from '@/types/pdf';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cachedFormatCurrencyEUR, formatPercentageIt, formatNumberIt } from '@/lib/utils/formatters';
import { describeSummarySection, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';

interface SummarySectionProps {
  data: SummaryData;
  reportScope: string;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

/**
 * The closing page.
 *
 * Nine figures, three by three, each one a section's own verdict rather than a repetition of
 * its rows: a reader who reads only this page should be able to say how the portfolio stands.
 * It closes the report the way the cover opens it — with a generated sentence — so the two
 * pages a reader is most likely to look at both answer rather than list.
 */
export function SummarySection({ data, reportScope }: SummarySectionProps) {
  const title = PDF_SECTION_TITLES.summary;
  const footerNote = `${title} · ${reportScope}`;

  /**
   * The allocation score is `100 − Σ|scarto in punti|`, so it falls as the portfolio drifts.
   * The thresholds are the ones the app applies: at or above 80 the plan is met, between 60
   * and 80 it needs a look, below 60 it needs an intervention.
   */
  const allocationSign = data.allocationScore >= 80 ? 'positive' : data.allocationScore >= 60 ? 'warning' : 'negative';

  /**
   * Income over expenses: at 1,2× a fifth of what comes in is saved, under 0,8× the household
   * is spending a quarter more than it earns. Same thresholds as the Cashflow section, so the
   * two pages cannot colour the same number differently.
   */
  const ratioSign =
    data.incomeToExpenseRatio >= 1.2 ? 'positive' : data.incomeToExpenseRatio >= 0.8 ? 'warning' : 'negative';

  const metrics: PDFMetric[] = [
    { label: 'Patrimonio netto', value: euro(data.totalNetWorth), note: `${data.assetCount} strumenti` },
    {
      label: 'Patrimonio liquido',
      value: euro(data.liquidNetWorth),
      note:
        data.totalNetWorth > 0
          ? `${formatPercentageIt((data.liquidNetWorth / data.totalNetWorth) * 100, 1)} liquidabile in pochi giorni`
          : undefined,
    },
    { label: 'Classe principale', value: data.topAssetClass },

    {
      label: 'Guadagno non realizzato',
      value: `${data.unrealizedGains >= 0 ? '+' : '−'}${euro(Math.abs(data.unrealizedGains))}`,
      sign: data.unrealizedGains >= 0 ? 'positive' : 'negative',
    },
    { label: 'TER medio ponderato', value: formatPercentageIt(data.weightedTER, 2), note: 'sui soli strumenti che ne hanno uno' },
    {
      label: 'Distanza dal piano',
      value: `${Math.round(data.allocationScore)} / 100`,
      sign: allocationSign,
      note: '100 meno la somma degli scarti in punti',
    },

    { label: 'Progresso FIRE', value: formatPercentageIt(data.fireProgress, 1) },
    {
      label: 'Entrate su uscite',
      value: `${formatNumberIt(data.incomeToExpenseRatio, 2)}×`,
      sign: ratioSign,
      note: 'sulla finestra del Cashflow',
    },
    { label: 'Sezioni incluse', value: `${data.sectionsIncluded.length} di 7` },
  ];

  const completeness: PDFMetric[] = [
    { label: 'Snapshot mensili', value: `${data.dataCompleteness.snapshotCount}` },
    { label: 'Strumenti', value: `${data.dataCompleteness.assetCount}` },
    { label: 'Movimenti di cassa', value: `${data.dataCompleteness.expenseCount}` },
  ];

  return (
    <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
      <PDFSection
        eyebrow={title}
        scope={`generato il ${format(data.generatedAt, 'dd/MM/yyyy · HH:mm', { locale: it })}`}
        reading={describeSummarySection(data)}
        ruled={false}
      >
        <PDFMetrics items={metrics} />
      </PDFSection>

      <PDFSection eyebrow="Su quanti dati poggia" scope="alla data di generazione">
        <PDFMetrics items={completeness} />
        <PDFNote>{data.sectionsIncluded.join(' · ')}</PDFNote>
      </PDFSection>

      <PDFSection eyebrow="Avvertenza">
        <PDFNote>
          I dati riflettono lo stato del portafoglio alla data di generazione; le valutazioni sono ai prezzi correnti e
          possono variare. Questo documento è generato automaticamente e non costituisce consulenza finanziaria.
        </PDFNote>
      </PDFSection>
    </PDFPage>
  );
}
