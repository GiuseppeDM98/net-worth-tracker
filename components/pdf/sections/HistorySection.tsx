// components/pdf/sections/HistorySection.tsx
// Historical performance section with charts and YoY comparison

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import type { HistoryData, ChartImage } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

/**
 * Formats snapshot date from ISO format to abbreviated Italian month + year.
 *
 * Italian month abbreviations used:
 * Gen (Gennaio), Feb (Febbraio), Mar (Marzo), Apr (Aprile), Mag (Maggio), Giu (Giugno),
 * Lug (Luglio), Ago (Agosto), Set (Settembre), Ott (Ottobre), Nov (Novembre), Dic (Dicembre)
 *
 * @param dateStr - Date string in 'YYYY-MM' format (e.g., '2024-01')
 * @returns Formatted string like 'Gen 2024'
 */
function formatDate(dateStr: string): string {
  const [year, month] = dateStr.split('-');
  const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
                      'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

interface HistorySectionProps {
  data: HistoryData;
  chartImages: Map<string, ChartImage>;
}

/**
 * Historical performance section displaying net worth evolution and year-over-year comparison.
 *
 * Multi-page structure:
 * - Page 1: Net worth evolution table with overall growth metrics
 * - Page 2: Year-over-year comparison table (conditionally rendered if data available)
 *
 * Key metrics displayed:
 * - Total Growth: Percentage change from oldest to latest snapshot
 * - Total Growth Absolute: Currency value of growth
 * - Oldest Snapshot: Date and value of first recorded snapshot
 * - Latest Snapshot: Date and value of most recent snapshot
 *
 * Net worth evolution table columns:
 * - Data: Snapshot date (abbreviated Italian month + year)
 * - Patrimonio Totale: Total net worth (liquid + illiquid)
 * - Patrimonio Liquido: Liquid assets only
 * - Patrimonio Illiquido: Illiquid assets (real estate, etc.)
 *
 * YoY comparison table shows annual performance by calendar year, comparing
 * first and last snapshot of each year to calculate growth.
 *
 * @param data - Historical net worth data with evolution timeline and YoY comparison
 * @param chartImages - Pre-captured chart images (currently unused but reserved for future enhancements)
 */
export function HistorySection({ data, chartImages }: HistorySectionProps) {
  // Require minimum 2 snapshots to calculate meaningful growth metrics.
  // With only 1 snapshot, we can't show evolution, growth rates, or comparisons.
  if (!data || data.netWorthEvolution.length < 2) {
    return (
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Storico Patrimonio</Text>
          <View style={styles.divider} />
        </View>
        <View style={styles.content}>
          <PDFText variant="body" style={styles.noData}>
            Dati storici insufficienti (minimo 2 snapshot richiesti).
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

  // Convert netWorthEvolution data to table rows
  const netWorthRows = data.netWorthEvolution.map(point => [
    formatDate(point.date),
    formatCurrency(point.totalNetWorth),
    formatCurrency(point.liquidNetWorth),
    formatCurrency(point.illiquidNetWorth),
  ]);

  return (
    <>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Storico Patrimonio</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.content}>
          {/* Overall growth metrics */}
          {data.oldestSnapshot && data.latestSnapshot && (
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Crescita Totale</Text>
                <Text style={[
                  styles.metricValue,
                  (data.totalGrowth || 0) >= 0 ? styles.positive : styles.negative
                ]}>
                  {formatPercentage(data.totalGrowth || 0)}
                </Text>
                <Text style={styles.metricSubvalue}>
                  {formatCurrency(data.totalGrowthAbsolute || 0)}
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Primo Snapshot</Text>
                {/* Format as MM/YYYY (e.g., '01/2023').
                    padStart(2, '0') ensures single-digit months display as '01' not '1'. */}
                <Text style={styles.metricValue}>
                  {String(data.oldestSnapshot.month).padStart(2, '0')}/{data.oldestSnapshot.year}
                </Text>
                <Text style={styles.metricSubvalue}>
                  {formatCurrency(data.oldestSnapshot.totalNetWorth)}
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Ultimo Snapshot</Text>
                <Text style={styles.metricValue}>
                  {String(data.latestSnapshot.month).padStart(2, '0')}/{data.latestSnapshot.year}
                </Text>
                <Text style={styles.metricSubvalue}>
                  {formatCurrency(data.latestSnapshot.totalNetWorth)}
                </Text>
              </View>
            </View>
          )}

          {/* Net worth evolution table */}
          <View style={styles.section}>
            <PDFText variant="subheading">Evoluzione Patrimonio Netto</PDFText>
            <PDFTable
              headers={['Data', 'Patrimonio Totale', 'Patrimonio Liquido', 'Patrimonio Illiquido']}
              rows={netWorthRows}
              columnWidths={['15%', '28%', '28%', '29%']}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
            `Pagina ${pageNumber} di ${totalPages}`
          )} fixed />
        </View>
      </Page>

      {/* YoY Comparison page - Second page showing annual performance breakdown.
          Only renders if YoY data is available (requires snapshots spanning multiple calendar years). */}
      {data.yoyComparison.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>Storico Patrimonio - Confronto Annuale</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.content}>
            {/* Year-over-Year (YoY) comparison methodology (Teacher Comment):
                Compares portfolio value at beginning and end of each calendar year.
                For each year:
                - Start Value: Net worth from first snapshot of that year (Jan or earliest month)
                - End Value: Net worth from last snapshot of that year (Dec or latest month)
                - Growth: Absolute difference (End - Start)
                - Growth %: Percentage change ((End - Start) / Start × 100)

                Example: If 2023 started at €50,000 (Jan snapshot) and ended at €55,000 (Dec snapshot),
                growth would be €5,000 and growth % would be 10%.

                This differs from calendar-year returns (which use exact Jan 1 / Dec 31 values)
                because it uses actual snapshot dates, which might be mid-month. */}
            <PDFText variant="subheading">Confronto Year-over-Year</PDFText>
            <PDFTable
              headers={['Anno', 'Valore Iniziale', 'Valore Finale', 'Crescita', '% Crescita']}
              rows={data.yoyComparison.map(yoy => [
                String(yoy.year),
                formatCurrency(yoy.startValue),
                formatCurrency(yoy.endValue),
                formatCurrency(yoy.growth),
                formatPercentage(yoy.growthPercent),
              ])}
              columnWidths={['12%', '22%', '22%', '22%', '22%']}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
              `Pagina ${pageNumber} di ${totalPages}`
            )} fixed />
          </View>
        </Page>
      )}
    </>
  );
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
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  metricCard: {
    width: '31%',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderTopWidth: 3,
    borderTopColor: '#3B82F6',
  },
  metricLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
    marginBottom: 2,
  },
  metricSubvalue: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#6B7280',
  },
  positive: {
    color: '#10B981',
  },
  negative: {
    color: '#EF4444',
  },
  section: {
    marginBottom: 25,
  },
  chartPlaceholder: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 20,
    padding: 40,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
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
