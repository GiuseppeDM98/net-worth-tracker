// components/pdf/sections/CashflowSection.tsx
// Cashflow: what came in, what went out, and over exactly which months.

import { PDFText } from '../primitives/PDFText';
import { PDFPage, PDFSection, PDFMetrics, PDFRankedRows, PDFNote, type PDFMetric, type PDFRankedRow } from '../primitives/PDFTile';
import type { CashflowData } from '@/types/pdf';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { describeCashflowSection, cashflowScopeLine, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';

interface CashflowSectionProps {
  data: CashflowData;
  reportScope: string;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

const SHORT_MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** 'YYYY-MM' → 'ago 2026'. */
function formatMonth(key: string): string {
  const [year, month] = key.split('-');
  return `${SHORT_MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/**
 * The Cashflow section.
 *
 * The one section of the report whose window is not what its title suggests: a Totale export
 * floors the expenses at `cashflowHistoryStartYear`, while Storico, Rendimenti and FIRE stay
 * unbounded. That asymmetry is deliberate — what sits below the floor is bulk-imported noise —
 * but it has to be SAID, or the reader concludes their first years had no spending. The scope
 * line says it, on every page of the section.
 */
export function CashflowSection({ data, reportScope }: CashflowSectionProps) {
  const title = PDF_SECTION_TITLES.cashflow;
  const footerNote = `${title} · ${reportScope}`;
  const scope = cashflowScopeLine(data.windowMonths.map(formatMonth), data.historyFloorYear, data.numberOfMonthsTracked);

  if (!data || (data.totalIncome === 0 && data.totalExpenses === 0)) {
    return (
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection eyebrow={title} scope={scope} reading={describeCashflowSection(data)} ruled={false}>
          <PDFText variant="caption">Nessun movimento è registrato in questa finestra.</PDFText>
        </PDFSection>
      </PDFPage>
    );
  }

  const savingsRate = data.totalIncome > 0 ? (data.netCashflow / data.totalIncome) * 100 : null;

  const metrics: PDFMetric[] = [
    {
      label: 'Entrate',
      value: euro(data.totalIncome),
      note: data.numberOfMonthsTracked > 0 ? `${euro(data.totalIncome / data.numberOfMonthsTracked)} al mese in media` : undefined,
      sign: 'positive',
    },
    {
      label: 'Uscite',
      value: `−${euro(data.totalExpenses)}`,
      note: data.numberOfMonthsTracked > 0 ? `${euro(data.totalExpenses / data.numberOfMonthsTracked)} al mese in media` : undefined,
      sign: 'negative',
    },
    {
      label: 'Risparmio netto',
      value: euro(data.netCashflow),
      // The savings rate is a share of INCOME, and without income there is nothing to share.
      note: savingsRate === null ? undefined : `${formatPercentageIt(savingsRate, 1)} di quanto è entrato`,
      sign: data.netCashflow >= 0 ? 'positive' : 'negative',
    },
  ];

  const largest = data.byCategory[0]?.amount ?? 0;
  const categoryRows: PDFRankedRow[] = data.byCategory.map((category) => ({
    label: category.categoryName,
    caption: `${category.transactionCount} ${category.transactionCount === 1 ? 'movimento' : 'movimenti'}`,
    amount: euro(category.amount),
    trailing: formatPercentageIt(category.percent, 1),
    fill: largest > 0 ? category.amount / largest : 0,
  }));

  // The listed categories are the top five by spend, so their shares stop short of 100%.
  // Naming the residual is what keeps the list from reading as the whole of it.
  const listedTotal = data.byCategory.reduce((sum, category) => sum + category.amount, 0);
  const residual = data.totalExpenses - listedTotal;
  if (residual > 0.005) {
    categoryRows.push({
      label: 'Altre categorie',
      amount: euro(residual),
      trailing: formatPercentageIt((residual / data.totalExpenses) * 100, 1),
      residual: true,
    });
  }

  return (
    <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
      <PDFSection eyebrow={title} scope={scope} reading={describeCashflowSection(data)} ruled={false}>
        <PDFMetrics items={metrics} />
        {data.historyFloorYear !== null ? (
          <PDFNote>
            Il report Totale parte da {data.historyFloorYear}, l’anno da cui il tuo storico di cashflow è considerato
            attendibile: le registrazioni precedenti non entrano in questa sezione. Patrimonio, Storico, Rendimenti e
            FIRE non hanno questo pavimento.
          </PDFNote>
        ) : null}
      </PDFSection>

      {categoryRows.length > 0 ? (
        <PDFSection eyebrow="Spese per categoria" scope={`prime ${data.byCategory.length} per importo`}>
          <PDFRankedRows rows={categoryRows} />
        </PDFSection>
      ) : null}
    </PDFPage>
  );
}
