// components/pdf/sections/PortfolioSection.tsx
// Portfolio assets section with pagination for large portfolios

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import type { PortfolioData, AssetRow } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

interface PortfolioSectionProps {
  data: PortfolioData;
}

const ASSETS_PER_PAGE = 25;

/**
 * Paginate assets array into chunks
 */
function paginateAssets(assets: AssetRow[]): AssetRow[][] {
  const pages: AssetRow[][] = [];
  for (let i = 0; i < assets.length; i += ASSETS_PER_PAGE) {
    pages.push(assets.slice(i, i + ASSETS_PER_PAGE));
  }
  return pages;
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function PortfolioSection({ data }: PortfolioSectionProps) {
  if (!data || data.assets.length === 0) {
    return (
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio Assets</Text>
          <View style={styles.divider} />
        </View>
        <View style={styles.content}>
          <PDFText variant="body" style={styles.noData}>
            Nessun asset presente nel portfolio.
          </PDFText>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
            `Pagina ${pageNumber} di ${totalPages}`
          )} fixed />
        </View>
      </Page>
    );
  }

  const pages = paginateAssets(data.assets);
  const totalPages = pages.length + 1; // +1 for summary page

  return (
    <>
      {/* Asset detail pages */}
      {pages.map((page, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Portfolio Assets {pages.length > 1 && `(Pagina ${pageIdx + 1}/${pages.length})`}
            </Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.content}>
            <PDFTable
              headers={['Ticker', 'Nome', 'Classe', 'Quantità', 'Prezzo', 'Valore', 'Peso', 'G/P']}
              rows={page.map(asset => [
                asset.ticker,
                truncate(asset.name, 25),
                getAssetClassShort(asset.assetClass),
                asset.quantity.toFixed(2),
                formatCurrency(asset.currentPrice),
                formatCurrency(asset.totalValue),
                formatPercentage(asset.weight),
                asset.unrealizedGain !== undefined
                  ? formatCurrency(asset.unrealizedGain)
                  : '-',
              ])}
              columnWidths={['10%', '23%', '12%', '10%', '11%', '13%', '9%', '12%']}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
              `Pagina ${pageNumber} di ${totalPages}`
            )} fixed />
          </View>
        </Page>
      ))}

      {/* Summary page */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio - Riepilogo</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.content}>
          {/* Summary metrics */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Patrimonio Totale</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.totalValue)}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Patrimonio Liquido</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.liquidValue)}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Patrimonio Illiquido</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.illiquidValue)}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Numero Assets</Text>
              <Text style={styles.summaryValue}>{data.assets.length}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>TER Medio Ponderato</Text>
              <Text style={styles.summaryValue}>{formatPercentage(data.weightedTER)}</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Costi Annuali Stimati</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency((data.totalValue * data.weightedTER) / 100)}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>G/P Non Realizzato</Text>
              <Text style={[
                styles.summaryValue,
                data.totalUnrealizedGains >= 0 ? styles.positive : styles.negative
              ]}>
                {formatCurrency(data.totalUnrealizedGains)}
              </Text>
              <Text style={styles.summarySubvalue}>
                {formatPercentage(data.totalUnrealizedGainsPercent)}
              </Text>
            </View>
          </View>

          {/* Top 10 holdings */}
          <View style={styles.section}>
            <PDFText variant="subheading">Top 10 Holdings per Valore</PDFText>
            <PDFTable
              headers={['#', 'Ticker', 'Nome', 'Valore', 'Peso']}
              rows={data.assets.slice(0, 10).map((asset, idx) => [
                String(idx + 1),
                asset.ticker,
                truncate(asset.name, 30),
                formatCurrency(asset.totalValue),
                formatPercentage(asset.weight),
              ])}
              columnWidths={['8%', '15%', '42%', '20%', '15%']}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
            `Pagina ${pageNumber} di ${totalPages}`
          )} fixed />
        </View>
      </Page>
    </>
  );
}

function getAssetClassShort(assetClass: string): string {
  const shorts: Record<string, string> = {
    equity: 'Azion.',
    bonds: 'Obblig.',
    crypto: 'Crypto',
    realestate: 'Immob.',
    commodity: 'Materie P.',
    cash: 'Liquid.',
  };
  return shorts[assetClass] || assetClass;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#3B82F6',
    marginBottom: 8,
  },
  divider: {
    height: 2,
    backgroundColor: '#3B82F6',
    width: '100%',
  },
  content: {
    flexGrow: 1,
  },
  noData: {
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 40,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 30,
  },
  summaryCard: {
    width: '48%',
    marginBottom: 15,
    marginRight: '2%',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
  summarySubvalue: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    marginTop: 2,
  },
  positive: {
    color: '#10B981',
  },
  negative: {
    color: '#EF4444',
  },
  section: {
    marginTop: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#6B7280',
  },
});
