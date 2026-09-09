// components/pdf/sections/FireSection.tsx
// FIRE: the target, the distance to it, and what it would pay out.

import { PDFText } from '../primitives/PDFText';
import { PDFPage, PDFSection, PDFMetrics, PDFHero, PDFNote, type PDFMetric } from '../primitives/PDFTile';
import type { FireData } from '@/types/pdf';
import { cachedFormatCurrencyEUR, formatPercentageIt, formatNumberIt } from '@/lib/utils/formatters';
import { describeFireSection, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';

interface FireSectionProps {
  data: FireData;
  reportScope: string;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

/**
 * The FIRE section.
 *
 * The FIRE number is the page's one dominant figure, so it is the hero and everything else is
 * subordinate to it — the Trade Republic hierarchy, on paper. The Trinity Study note stays: the
 * multiple is a modelling assumption, not a fact about the reader's money, and a report that
 * prints a target without saying what it rests on invites it to be read as a promise.
 */
export function FireSection({ data, reportScope }: FireSectionProps) {
  const title = PDF_SECTION_TITLES.fire;
  const footerNote = `${title} · ${reportScope}`;

  if (!data || data.fireNumber <= 0) {
    return (
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection eyebrow={title} reading={describeFireSection(data)} ruled={false}>
          <PDFText variant="caption">
            Il numero FIRE poggia sulla spesa annuale: senza spese registrate non c’è un traguardo da calcolare.
          </PDFText>
        </PDFSection>
      </PDFPage>
    );
  }

  const remaining = Math.max(0, data.fireNumber - data.currentNetWorth);
  const multiple = 100 / data.safeWithdrawalRate;

  const position: PDFMetric[] = [
    { label: 'Patrimonio attuale', value: euro(data.currentNetWorth), note: `${formatPercentageIt(data.progressToFI, 1)} del traguardo` },
    {
      label: remaining > 0 ? 'Ancora da accumulare' : 'Oltre il traguardo',
      value: euro(remaining > 0 ? remaining : data.currentNetWorth - data.fireNumber),
      sign: remaining > 0 ? undefined : 'positive',
    },
    { label: 'Anni di spese coperti', value: `${formatNumberIt(data.yearsOfExpensesCovered, 1)}`, note: 'al ritmo di spesa attuale' },
  ];

  const basis: PDFMetric[] = [
    { label: 'Spese annuali', value: euro(data.annualExpenses), note: 'la base del calcolo' },
    { label: 'Entrate annuali', value: euro(data.annualIncome) },
    {
      label: 'Tasso di prelievo sicuro',
      value: formatPercentageIt(data.safeWithdrawalRate, 1),
      note: `il traguardo è ${formatNumberIt(multiple, 1)}× le spese`,
    },
  ];

  const allowance: PDFMetric[] = [
    { label: 'Annuale', value: euro(data.fireNumber * (data.safeWithdrawalRate / 100)) },
    { label: 'Mensile', value: euro(data.monthlyAllowance) },
    { label: 'Giornaliera', value: euro(data.dailyAllowance) },
  ];

  // Only meaningful once there is a portfolio to withdraw from, and worth flagging only when it
  // exceeds the safe rate — below it, the number says nothing the progress figure does not.
  const overWithdrawing =
    data.currentWithdrawalRate !== undefined && data.currentWithdrawalRate > data.safeWithdrawalRate;

  return (
    <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
      <PDFSection
        eyebrow={title}
        scope={`prelievo al ${formatPercentageIt(data.safeWithdrawalRate, 1)}`}
        reading={describeFireSection(data)}
        ruled={false}
      >
        <PDFHero value={euro(data.fireNumber)} />
        <PDFMetrics items={position} />
      </PDFSection>

      <PDFSection eyebrow="Su cosa poggia" scope="gli ingressi del calcolo">
        <PDFMetrics items={basis} />
        {overWithdrawing ? (
          <PDFNote>
            Il tuo tasso di prelievo attuale è {formatPercentageIt(data.currentWithdrawalRate!, 1)}, sopra il{' '}
            {formatPercentageIt(data.safeWithdrawalRate, 1)} su cui è costruito il traguardo.
          </PDFNote>
        ) : null}
      </PDFSection>

      <PDFSection eyebrow="Quanto pagherebbe" scope="a traguardo raggiunto">
        <PDFMetrics items={allowance} />
        <PDFNote>
          Il numero FIRE è {formatNumberIt(multiple, 1)}× le spese annuali, secondo il Trinity Study a un tasso di
          prelievo del {formatPercentageIt(data.safeWithdrawalRate, 1)}.
          {data.safeWithdrawalRate === 4
            ? ' Al 4% lo studio misura una probabilità di successo superiore al 95% su un portafoglio 50/50 per trent’anni di prelievi.'
            : ''}{' '}
          È un modello storico su mercati statunitensi, non una garanzia.
        </PDFNote>
      </PDFSection>
    </PDFPage>
  );
}
