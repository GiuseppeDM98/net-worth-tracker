// components/pdf/sections/FireSection.tsx
// FIRE metrics section

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import type { FireData } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

interface FireSectionProps {
  data: FireData;
}

export function FireSection({ data }: FireSectionProps) {
  if (!data) {
    return (
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>FIRE Calculator</Text>
          <View style={styles.divider} />
        </View>
        <View style={styles.content}>
          <PDFText variant="body" style={styles.noData}>
            Dati FIRE non disponibili.
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

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>FIRE Calculator</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.content}>
        {/* FIRE Number */}
        <View style={styles.fireNumberCard}>
          <Text style={styles.fireNumberLabel}>FIRE Number</Text>
          <Text style={styles.fireNumber}>{formatCurrency(data.fireNumber)}</Text>
          <Text style={styles.fireNumberSubtext}>
            {(100 / data.safeWithdrawalRate).toFixed(data.safeWithdrawalRate === 4 ? 0 : 2)}x spese annuali ({formatCurrency(data.annualExpenses)})
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            Progresso verso Financial Independence
          </Text>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill,
              { width: `${Math.min(data.progressToFI, 100)}%` }
            ]} />
          </View>
          <Text style={styles.progressText}>
            {formatPercentage(data.progressToFI)}
          </Text>
        </View>

        {/* Key metrics grid */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Patrimonio Attuale</Text>
            <Text style={styles.metricValue}>{formatCurrency(data.currentNetWorth)}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Spese Annuali</Text>
            <Text style={styles.metricValue}>{formatCurrency(data.annualExpenses)}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Entrate Annuali</Text>
            <Text style={styles.metricValue}>{formatCurrency(data.annualIncome)}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Safe Withdrawal Rate</Text>
            <Text style={styles.metricValue}>{data.safeWithdrawalRate}%</Text>
          </View>
        </View>

        {/* Allowances */}
        <View style={styles.allowancesSection}>
          <PDFText variant="subheading">Indennità Sostenibile</PDFText>
          <View style={styles.allowancesGrid}>
            <View style={styles.allowanceCard}>
              <Text style={styles.allowanceLabel}>Annuale</Text>
              <Text style={styles.allowanceValue}>{formatCurrency(data.monthlyAllowance * 12)}</Text>
            </View>

            <View style={styles.allowanceCard}>
              <Text style={styles.allowanceLabel}>Mensile</Text>
              <Text style={styles.allowanceValue}>{formatCurrency(data.monthlyAllowance)}</Text>
            </View>

            <View style={styles.allowanceCard}>
              <Text style={styles.allowanceLabel}>Giornaliera</Text>
              <Text style={styles.allowanceValue}>{formatCurrency(data.dailyAllowance)}</Text>
            </View>
          </View>
        </View>

        {/* Additional metrics */}
        <View style={styles.additionalMetrics}>
          <View style={styles.additionalMetricRow}>
            <Text style={styles.additionalLabel}>Anni di Spese Coperte:</Text>
            <Text style={styles.additionalValue}>
              {data.yearsOfExpensesCovered.toFixed(1)} anni
            </Text>
          </View>

          {data.currentWithdrawalRate !== undefined && (
            <View style={styles.additionalMetricRow}>
              <Text style={styles.additionalLabel}>Withdrawal Rate Attuale:</Text>
              <Text style={
                data.currentWithdrawalRate > data.safeWithdrawalRate
                  ? [styles.additionalValue, styles.warning]
                  : styles.additionalValue
              }>
                {formatPercentage(data.currentWithdrawalRate)}
              </Text>
            </View>
          )}
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Trinity Study & Safe Withdrawal Rate</Text>
          <Text style={styles.infoText}>
            Il FIRE Number è calcolato come {(100 / data.safeWithdrawalRate).toFixed(2)}x le tue spese annuali,
            basato sul Trinity Study con un Safe Withdrawal Rate del {data.safeWithdrawalRate}%.
            {data.safeWithdrawalRate === 4 && ' Il tasso del 4% dimostra una probabilità di successo del 95%+ su un portafoglio 50/50 azionario/obbligazionario per 30 anni di pensionamento.'}
          </Text>
        </View>
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
  fireNumberCard: {
    padding: 20,
    backgroundColor: '#DBEAFE',
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 25,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  fireNumberLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1E40AF',
    marginBottom: 8,
  },
  fireNumber: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#1E40AF',
    marginBottom: 4,
  },
  fireNumberSubtext: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#3B82F6',
  },
  progressSection: {
    marginBottom: 25,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 24,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  progressText: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#10B981',
    textAlign: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 25,
  },
  metricCard: {
    width: '48%',
    marginRight: '2%',
    marginBottom: 10,
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
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
  allowancesSection: {
    marginBottom: 25,
  },
  allowancesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  allowanceCard: {
    width: '31%',
    padding: 12,
    backgroundColor: '#D1FAE5',
    borderRadius: 4,
    alignItems: 'center',
  },
  allowanceLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#065F46',
    marginBottom: 4,
  },
  allowanceValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#065F46',
  },
  additionalMetrics: {
    marginBottom: 20,
  },
  additionalMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  additionalLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#6B7280',
  },
  additionalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
  warning: {
    color: '#EF4444',
  },
  infoBox: {
    padding: 15,
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  infoTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#92400E',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#78350F',
    lineHeight: 1.4,
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
