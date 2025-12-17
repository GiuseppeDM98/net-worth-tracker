// components/pdf/sections/HistorySection.tsx
// Historical performance section with charts and YoY comparison

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import type { HistoryData, ChartImage } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

// Helper function to format date from 'YYYY-MM' to 'Gen 2024'
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

export function HistorySection({ data, chartImages }: HistorySectionProps) {
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

      {/* YoY Comparison page */}
      {data.yoyComparison.length > 0 && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>Storico Patrimonio - Confronto Annuale</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.content}>
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
