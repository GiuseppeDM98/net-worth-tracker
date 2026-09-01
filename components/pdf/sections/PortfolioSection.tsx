// components/pdf/sections/PortfolioSection.tsx
// Patrimonio: what the portfolio is worth, then every instrument in it.

import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import { PDFPage, PDFSection, PDFMetrics, PDFRankedRows, type PDFMetric, type PDFRankedRow } from '../primitives/PDFTile';
import type { PortfolioData, AssetRow } from '@/types/pdf';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { describePortfolioSection, PDF_SECTION_TITLES } from '@/lib/utils/pdfNarrative';

interface PortfolioSectionProps {
  data: PortfolioData;
  reportScope: string;
}

/**
 * The Patrimonio section, in the cadence of a tile: the answer in words, then the figures, then
 * the inventory.
 *
 * The order is the one thing that changed structurally. The section used to open on 25 rows of
 * table and close on the summary, which is the reading order of a ledger, not of a report: a
 * reader who stops after the first page should already know what the portfolio is worth.
 */

// Rows per inventory page. Chosen against the current row height (18pt min + 10pt padding) and
// the 507pt column: 24 rows plus the head and the page chrome fit an A4 without clipping.
const ASSETS_PER_PAGE = 24;

function paginateAssets(assets: AssetRow[]): AssetRow[][] {
  const pages: AssetRow[][] = [];
  for (let i = 0; i < assets.length; i += ASSETS_PER_PAGE) {
    pages.push(assets.slice(i, i + ASSETS_PER_PAGE));
  }
  return pages;
}

/** Truncates a name that would otherwise push a table column past its width. */
function truncate(str: string, maxLength: number): string {
  return str.length <= maxLength ? str : `${str.substring(0, maxLength - 1)}…`;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

export function PortfolioSection({ data, reportScope }: PortfolioSectionProps) {
  const title = PDF_SECTION_TITLES.portfolio;
  const footerNote = `${title} · ${reportScope}`;

  if (!data || data.assets.length === 0) {
    return (
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection eyebrow={title} ruled={false}>
          <PDFText variant="body">Nessuno strumento è registrato in portafoglio.</PDFText>
        </PDFSection>
      </PDFPage>
    );
  }

  const pages = paginateAssets(data.assets);
  const largest = data.assets[0]?.totalValue ?? 0;

  const metrics: PDFMetric[] = [
    { label: 'Totale', value: euro(data.totalValue), note: `${data.assets.length} strumenti` },
    {
      label: 'Liquido',
      value: euro(data.liquidValue),
      note: data.totalValue > 0 ? `${formatPercentageIt((data.liquidValue / data.totalValue) * 100, 1)} del totale` : undefined,
    },
    {
      label: 'Illiquido',
      value: euro(data.illiquidValue),
      note: data.totalValue > 0 ? `${formatPercentageIt((data.illiquidValue / data.totalValue) * 100, 1)} del totale` : undefined,
    },
    {
      label: 'Guadagno non realizzato',
      value: `${data.totalUnrealizedGains >= 0 ? '+' : '−'}${euro(Math.abs(data.totalUnrealizedGains))}`,
      note: `${data.totalUnrealizedGainsPercent >= 0 ? '+' : '−'}${formatPercentageIt(Math.abs(data.totalUnrealizedGainsPercent), 2)} sul capitale versato`,
      sign: data.totalUnrealizedGains >= 0 ? 'positive' : 'negative',
    },
    { label: 'TER medio ponderato', value: formatPercentageIt(data.weightedTER, 2), note: 'sui soli strumenti che ne hanno uno' },
    { label: 'Costo annuo stimato', value: euro(data.annualCost), note: 'TER × valore, a portafoglio fermo' },
  ];

  const topRows: PDFRankedRow[] = data.assets.slice(0, 8).map((asset) => ({
    label: asset.ticker || asset.name,
    caption: asset.ticker ? truncate(asset.name, 44) : undefined,
    amount: euro(asset.totalValue),
    trailing: formatPercentageIt(asset.weight, 1),
    fill: largest > 0 ? asset.totalValue / largest : 0,
  }));

  return (
    <>
      <PDFPage eyebrow="Net Worth Tracker" section={title} footerNote={footerNote}>
        <PDFSection eyebrow={title} scope={`${data.assets.length} strumenti`} reading={describePortfolioSection(data)} ruled={false}>
          <PDFMetrics items={metrics} />
        </PDFSection>

        <PDFSection eyebrow="Strumenti principali" scope={`primi ${topRows.length} di ${data.assets.length} per valore`}>
          <PDFRankedRows rows={topRows} />
        </PDFSection>
      </PDFPage>

      {/* The inventory: every instrument, in the order the portfolio is weighted */}
      {pages.map((page, pageIdx) => (
        <PDFPage
          key={pageIdx}
          eyebrow="Net Worth Tracker"
          section={title}
          footerNote={footerNote}
        >
          <PDFSection
            eyebrow="Elenco strumenti"
            scope={pages.length > 1 ? `pagina ${pageIdx + 1} di ${pages.length}` : `${data.assets.length} strumenti`}
            ruled={false}
          >
            <PDFTable
              headers={['Ticker', 'Nome', 'Classe', 'Quantità', 'Prezzo', 'Valore', 'Peso', 'G/P']}
              rows={page.map((asset) => [
                asset.ticker,
                truncate(asset.name, 24),
                getAssetClassShort(asset.assetClass),
                asset.quantity.toLocaleString('it-IT', { maximumFractionDigits: 2 }),
                cachedFormatCurrencyEUR(asset.currentPrice),
                euro(asset.totalValue),
                formatPercentageIt(asset.weight, 1),
                asset.unrealizedGainPercent !== undefined
                  ? `${asset.unrealizedGainPercent >= 0 ? '+' : '−'}${formatPercentageIt(Math.abs(asset.unrealizedGainPercent), 1)}`
                  : '—',
              ])}
              columnWidths={['10%', '24%', '12%', '11%', '12%', '13%', '8%', '10%']}
              alignRight={[3, 4, 5, 6, 7]}
            />
          </PDFSection>
        </PDFPage>
      ))}
    </>
  );
}

/** Short class names, so the column stays narrow enough to leave the numbers room. */
function getAssetClassShort(assetClass: string): string {
  const shorts: Record<string, string> = {
    equity: 'Azioni',
    bonds: 'Obblig.',
    crypto: 'Crypto',
    realestate: 'Immobili',
    cash: 'Liquidità',
    commodity: 'Materie',
    trendFollowing: 'Trend',
    carry: 'Carry',
  };
  return shorts[assetClass] ?? assetClass;
}
