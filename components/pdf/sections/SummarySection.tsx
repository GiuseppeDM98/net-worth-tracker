// components/pdf/sections/SummarySection.tsx
// Summary section with key metrics overview

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import type { SummaryData } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface SummarySectionProps {
  data: SummaryData;
}

/**
 * Summary section providing a one-page overview of all key portfolio metrics.
 *
 * Purpose: Final section of PDF report that aggregates critical data from all other sections,
 * allowing readers to quickly grasp portfolio health without reading the entire document.
 *
 * Layout structure:
 * 1. Key Metrics Grid (9 metrics in 3-column layout):
 *    - Patrimonio Totale Netto: Total net worth (primary metric, blue highlight)
 *    - Patrimonio Liquido: Liquid assets only
 *    - Numero Assets: Total asset count
 *    - Asset Class Principale: Largest allocation by asset class
 *    - TER Medio Ponderato: Weighted average expense ratio
 *    - G/P Non Realizzato: Unrealized gains/losses (green if positive, red if negative)
 *    - Score Allocazione: Portfolio balance score 0-100 (color-coded by threshold)
 *    - Progresso FIRE: Progress toward Financial Independence goal
 *    - Ratio Entrate/Uscite: Income-to-expense ratio (financial health indicator)
 *
 * 2. Metadata Section:
 *    - Generation timestamp
 *    - Number and list of included sections
 *
 * 3. Data Completeness:
 *    - Historical snapshots count
 *    - Assets count
 *    - Cashflow transactions count
 *
 * 4. Disclaimer:
 *    - Legal notice about data accuracy and non-advisory nature
 *
 * Color coding for metrics:
 * - Blue: Primary metric (Total Net Worth)
 * - Green: Positive/healthy values (good allocation score ≥80, income ratio ≥1.2, positive gains)
 * - Yellow/Warning: Medium values (allocation score 60-79, income ratio 0.8-1.2)
 * - Red/Negative: Poor values (allocation score <60, income ratio <0.8, negative gains)
 *
 * @param data - Summary data aggregated from all portfolio sections
 */
export function SummarySection({ data }: SummarySectionProps) {
  const formattedDate = format(data.generatedAt, 'dd/MM/yyyy HH:mm', { locale: it });

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Riepilogo</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.content}>
        {/* Key metrics summary - 9 metrics in 3-column grid layout.
            Grid uses flexWrap to create rows automatically. Each card is 31.33% wide
            with 2% right margin, creating 3 columns per row (31.33% × 3 + 2% × 3 ≈ 100%). */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Patrimonio Totale Netto</Text>
            <Text style={[styles.metricValue, styles.primary]}>
              {formatCurrency(data.totalNetWorth)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Patrimonio Liquido</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(data.liquidNetWorth)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Numero Assets</Text>
            <Text style={styles.metricValue}>{data.assetCount}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Asset Class Principale</Text>
            <Text style={styles.metricValue}>{data.topAssetClass}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>TER Medio Ponderato</Text>
            <Text style={styles.metricValue}>
              {formatPercentage(data.weightedTER)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>G/P Non Realizzato</Text>
            <Text style={[
              styles.metricValue,
              data.unrealizedGains >= 0 ? styles.positive : styles.negative
            ]}>
              {formatCurrency(data.unrealizedGains)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Score Allocazione</Text>
            {/* Allocation score thresholds (Why Comment):
                - ≥80 (Green): Well-balanced portfolio, allocation within ±2% of targets for most asset classes
                - 60-79 (Yellow): Some deviation from targets, may need minor rebalancing soon
                - <60 (Red): Significant deviation from targets, rebalancing recommended

                Score calculation: 100 - (sum of absolute percentage point deviations from target).
                Example: If stocks are 3% over target and bonds are 3% under, score = 100 - (3+3) = 94.
                Lower score indicates more misalignment with target allocation. */}
            <Text style={[
              styles.metricValue,
              data.allocationScore >= 80 ? styles.positive :
              data.allocationScore >= 60 ? styles.warning : styles.negative
            ]}>
              {data.allocationScore.toFixed(0)}/100
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Progresso FIRE</Text>
            <Text style={styles.metricValue}>
              {formatPercentage(data.fireProgress)}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ratio Entrate/Uscite</Text>
            {/* Income-to-expense ratio thresholds (Why Comment):
                Mirrors thresholds from CashflowSection for consistency.
                - ≥1.2 (Green): Excellent financial health - saving 20%+ of income
                - 0.8-1.2 (Yellow): Balanced - roughly breaking even
                - <0.8 (Red): Warning - spending exceeds income by 25%+

                Calculation: Total Income / Total Expenses.
                Example: €3,000 income / €2,500 expenses = 1.2x (healthy, 20% savings rate). */}
            <Text style={[
              styles.metricValue,
              data.incomeToExpenseRatio >= 1.2 ? styles.positive :
              data.incomeToExpenseRatio >= 0.8 ? styles.warning : styles.negative
            ]}>
              {data.incomeToExpenseRatio.toFixed(2)}x
            </Text>
          </View>
        </View>

        {/* Metadata - Report generation information and section inclusion details.
            Lists which sections the user selected for export (Portfolio, Allocation, etc.)
            to provide context about report scope and completeness. */}
        <View style={styles.metadataSection}>
          <PDFText variant="subheading">Metadata Report</PDFText>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Data Generazione:</Text>
            <Text style={styles.metadataValue}>{formattedDate}</Text>
          </View>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Sezioni Incluse:</Text>
            <Text style={styles.metadataValue}>{data.sectionsIncluded.length}</Text>
          </View>

          <View style={styles.sectionsIncluded}>
            {data.sectionsIncluded.map((section, idx) => (
              <Text key={idx} style={styles.sectionItem}>• {section}</Text>
            ))}
          </View>
        </View>

        {/* Data completeness - Quantifies how much historical and current data is available.
            Helps readers understand report reliability and whether there's enough data
            for meaningful analysis:
            - Snapshots Storici: Number of monthly snapshots captured (more = better historical trends)
            - Assets: Total number of holdings (portfolio diversification indicator)
            - Movimenti Cassa: Total cashflow transactions tracked (income + expense entries) */}
        <View style={styles.completenessSection}>
          <PDFText variant="subheading">Completezza Dati</PDFText>

          <View style={styles.completenessGrid}>
            <View style={styles.completenessCard}>
              <Text style={styles.completenessValue}>
                {data.dataCompleteness.snapshotCount}
              </Text>
              <Text style={styles.completenessLabel}>Snapshots Storici</Text>
            </View>

            <View style={styles.completenessCard}>
              <Text style={styles.completenessValue}>
                {data.dataCompleteness.assetCount}
              </Text>
              <Text style={styles.completenessLabel}>Assets</Text>
            </View>

            <View style={styles.completenessCard}>
              <Text style={styles.completenessValue}>
                {data.dataCompleteness.expenseCount}
              </Text>
              <Text style={styles.completenessLabel}>Movimenti Cassa</Text>
            </View>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>Disclaimer</Text>
          <Text style={styles.disclaimerText}>
            I dati riflettono lo stato del portfolio alla data di generazione del report.
            Le valutazioni sono basate sui prezzi correnti degli asset e potrebbero variare.
            Questo documento è generato automaticamente e non costituisce consulenza finanziaria.
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 25,
  },
  metricCard: {
    width: '31.33%',
    marginRight: '2%',
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderTopWidth: 2,
    borderTopColor: '#3B82F6',
  },
  metricLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
  primary: {
    color: '#3B82F6',
  },
  positive: {
    color: '#10B981',
  },
  warning: {
    color: '#F59E0B',
  },
  negative: {
    color: '#EF4444',
  },
  metadataSection: {
    marginBottom: 25,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metadataLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#6B7280',
  },
  metadataValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
  sectionsIncluded: {
    marginTop: 8,
    paddingLeft: 10,
  },
  sectionItem: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#374151',
    marginBottom: 3,
  },
  completenessSection: {
    marginBottom: 25,
  },
  completenessGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  completenessCard: {
    width: '31%',
    padding: 12,
    backgroundColor: '#DBEAFE',
    borderRadius: 4,
    alignItems: 'center',
  },
  completenessValue: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#1E40AF',
    marginBottom: 4,
  },
  completenessLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#3B82F6',
    textAlign: 'center',
  },
  disclaimer: {
    padding: 15,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  disclaimerTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 6,
  },
  disclaimerText: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#6B7280',
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
