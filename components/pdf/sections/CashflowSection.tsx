// components/pdf/sections/CashflowSection.tsx
// Cashflow section with income/expense stats

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import type { CashflowData } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

interface CashflowSectionProps {
  data: CashflowData;
}

export function CashflowSection({ data }: CashflowSectionProps) {
  if (!data || (data.totalIncome === 0 && data.totalExpenses === 0)) {
    return (
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Entrate e Uscite</Text>
          <View style={styles.divider} />
        </View>
        <View style={styles.content}>
          <PDFText variant="body" style={styles.noData}>
            Nessun movimento di cassa registrato.
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

  // Determine financial health based on ratio
  const getHealthIndicator = (ratio: number) => {
    if (ratio >= 1.2) return { label: 'Ottima salute finanziaria', color: '#10B981' };
    if (ratio >= 0.8) return { label: 'Equilibrio', color: '#F59E0B' };
    return { label: 'Attenzione: uscite eccessive', color: '#EF4444' };
  };

  const health = getHealthIndicator(data.incomeToExpenseRatio);

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Entrate e Uscite</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.content}>
        {/* Summary metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Totale Entrate</Text>
            <Text style={[styles.metricValue, styles.income]}>
              {formatCurrency(data.totalIncome)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Totale Uscite</Text>
            <Text style={[styles.metricValue, styles.expense]}>
              {formatCurrency(data.totalExpenses)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Netto</Text>
            <Text style={[
              styles.metricValue,
              data.netCashflow >= 0 ? styles.income : styles.expense
            ]}>
              {formatCurrency(data.netCashflow)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ratio Entrate/Uscite</Text>
            <Text style={[styles.metricValue, { color: health.color }]}>
              {data.incomeToExpenseRatio.toFixed(2)}x
            </Text>
          </View>
        </View>

        {/* Financial health indicator */}
        <View style={[styles.healthCard, { borderLeftColor: health.color }]}>
          <Text style={[styles.healthText, { color: health.color }]}>
            {health.label}
          </Text>
        </View>

        {/* Top categories */}
        {data.byCategory.length > 0 && (
          <View style={styles.section}>
            <PDFText variant="subheading">Top 5 Categorie di Spesa</PDFText>
            <PDFTable
              headers={['Categoria', 'Importo', '% del Totale', 'Transazioni']}
              rows={data.byCategory.map(cat => [
                cat.categoryName,
                formatCurrency(cat.amount),
                formatPercentage(cat.percent),
                String(cat.transactionCount),
              ])}
              columnWidths={['35%', '25%', '20%', '20%']}
            />
          </View>
        )}

        {/* Savings rate info */}
        {data.netCashflow > 0 && (
          <View style={styles.section}>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Tasso di Risparmio</Text>
              <Text style={styles.infoValue}>
                {formatPercentage((data.netCashflow / data.totalIncome) * 100)}
              </Text>
              <Text style={styles.infoSubtext}>
                Risparmi {formatCurrency(data.netCashflow)} al mese
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (
          `Pagina ${pageNumber} di ${totalPages}`
        )} fixed />
      </View>
    </Page>
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  metricCard: {
    width: '48%',
    marginRight: '2%',
    marginBottom: 15,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
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
  },
  income: {
    color: '#10B981',
  },
  expense: {
    color: '#EF4444',
  },
  healthCard: {
    padding: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderLeftWidth: 4,
    marginBottom: 25,
  },
  healthText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  section: {
    marginTop: 20,
  },
  infoCard: {
    padding: 15,
    backgroundColor: '#DBEAFE',
    borderRadius: 4,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1E40AF',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#1E40AF',
    marginBottom: 4,
  },
  infoSubtext: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#3B82F6',
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
