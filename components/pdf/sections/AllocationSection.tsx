// components/pdf/sections/AllocationSection.tsx
// Allocazione: where the portfolio sits against its plan, and what would close the gap.

import { PDFText } from '../primitives/PDFText';
import { PDFPage, PDFSection, PDFRankedRows, PDFNote, type PDFRankedRow } from '../primitives/PDFTile';
import type { AllocationData } from '@/types/pdf';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { describeAllocationSection, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';
import { printChartHexForAssetClass } from '@/lib/constants/printTokens';

interface AllocationSectionProps {
  data: AllocationData;
  reportScope: string;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

/**
 * The Allocazione section.
 *
 * Two shapes, one page. With a plan, each class is a row carrying its current share, its target
 * and the euro gap between them — the same anatomy as Allocazione's «Per classe» tile, where
 * the gap is signed with the OPERATION rather than with the arithmetic: `+` means there is too
 * much, `−` that something is missing. Without a plan there is no gap to sign, and the reading
 * says so instead of comparing the portfolio to nothing.
 *
 * The class colours are `printChartHexForAssetClass`, derived from `ASSET_CLASS_CHART_INDEX`:
 * the printed bars and the app's charts cannot disagree about what colour Crypto is.
 */
export function AllocationSection({ data, reportScope }: AllocationSectionProps) {
  const title = PDF_SECTION_TITLES.allocation;
  const footerNote = `${title} · ${reportScope}`;

  if (!data || data.byAssetClass.length === 0) {
    return (
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection eyebrow={title} ruled={false}>
          <PDFText variant="body">Nessuna allocazione è disponibile per questo periodo.</PDFText>
        </PDFSection>
      </PDFPage>
    );
  }

  const largest = Math.max(...data.byAssetClass.map((entry) => entry.currentValue), 0);

  const rows: PDFRankedRow[] = data.byAssetClass.map((entry) => {
    const target =
      data.hasTargets && entry.targetPercent !== undefined
        ? `obiettivo ${formatPercentageIt(entry.targetPercent, 1)}`
        : undefined;
    // The gap is stated as an operation, not as a subtraction: "+2.400 €" reads as "you hold
    // 2.400 € too much of this", which is the sentence the reader can act on.
    const gap =
      data.hasTargets && entry.difference !== undefined && Math.abs(entry.difference) >= 1
        ? `${entry.difference >= 0 ? '+' : '−'}${euro(Math.abs(entry.difference))}`
        : undefined;

    return {
      label: entry.displayName,
      caption: target,
      amount: euro(entry.currentValue),
      trailing: gap ?? formatPercentageIt(entry.currentPercent, 1),
      trailingSign: gap ? (entry.difference! >= 0 ? 'negative' : 'positive') : undefined,
      fill: largest > 0 ? entry.currentValue / largest : 0,
      fillHex: printChartHexForAssetClass(entry.assetClass),
    };
  });

  const actionRows: PDFRankedRow[] = data.rebalancingActions.map((action) => ({
    label: action.action === 'buy' ? `Comprare ${action.assetClass}` : `Vendere ${action.assetClass}`,
    amount: euro(action.amount),
    trailing: action.action === 'buy' ? 'in ingresso' : 'in uscita',
  }));

  return (
    <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
      <PDFSection
        eyebrow={title}
        scope={`${data.byAssetClass.length} classi`}
        reading={describeAllocationSection(data)}
        ruled={false}
      >
        <PDFRankedRows rows={rows} />
        {data.hasTargets ? (
          <PDFNote>
            La colonna a destra è lo scarto in euro dal bersaglio, firmato con l’operazione che lo chiude: «+» significa
            che ne hai troppo, «−» che ne manca. Le classi entro un euro dal bersaglio riportano la quota corrente.
          </PDFNote>
        ) : (
          <PDFNote>
            Nessun obiettivo di allocazione è configurato: le quote qui sopra sono quelle correnti e non c’è uno scarto
            da misurare.
          </PDFNote>
        )}
      </PDFSection>

      {data.rebalancingNeeded && actionRows.length > 0 ? (
        <PDFSection
          eyebrow="Per tornare in banda"
          scope={`${actionRows.length} operazioni · soglia ±2%`}
        >
          <PDFRankedRows rows={actionRows} />
          <PDFNote>
            Sotto i due punti percentuali nessuna operazione è proposta: il costo di eseguirla supera lo scarto che
            correggerebbe.
          </PDFNote>
        </PDFSection>
      ) : null}
    </PDFPage>
  );
}
