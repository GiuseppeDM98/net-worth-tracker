// components/pdf/sections/PerformanceSection.tsx
// Performance section displaying portfolio metrics organized in 4 categories

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import type { PerformanceData } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

interface PerformanceSectionProps {
  data: PerformanceData;
}

/**
 * Performance section displaying all 15 performance metrics in 4 categories.
 *
 * Categories:
 * - 📈 Rendimento (Return Metrics): ROI, CAGR, TWR, IRR
 * - ⚠️ Rischio (Risk Metrics): Volatilità, Sharpe, Max Drawdown, Durata Drawdown, Recovery Time
 * - 📊 Contesto (Context Metrics): Contributi Netti, Durata
 * - 💰 Dividendi (Dividend Metrics - conditional): YOC Gross/Net, Current Yield Gross/Net
 *
 * Layout: 2-column grid for metrics within each category for space efficiency
 *
 * @param data - Performance metrics and period label
 */
export function PerformanceSection({ data }: PerformanceSectionProps) {
  const { metrics, periodLabel } = data;

  /**
   * Format month duration as "Xa Ym" (e.g., 27 months → "2a 3m")
   */
  const formatMonths = (months: number | null): string => {
    if (months === null) return 'N/D';
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    if (years === 0) {
      return `${remainingMonths}m`;
    } else if (remainingMonths === 0) {
      return `${years}a`;
    } else {
      return `${years}a ${remainingMonths}m`;
    }
  };

  /**
   * Determine if dividend section should be displayed.
   * Only show if at least one dividend metric has data.
   */
  const hasDividendData =
    metrics.yocGross !== null ||
    metrics.yocNet !== null ||
    metrics.currentYield !== null ||
    metrics.currentYieldNet !== null;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Performance Portafoglio - {periodLabel}</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.content}>
        {/* Category 1: Return Metrics */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>Metriche di Rendimento</Text>
          <Text style={styles.categoryDescription}>
            Misurano quanto il tuo portafoglio è cresciuto
          </Text>

          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>ROI Totale</Text>
              <Text style={[styles.metricValue, getValueColor(metrics.roi)]}>
                {metrics.roi !== null ? formatPercentage(metrics.roi) : 'N/D'}
              </Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>CAGR</Text>
              <Text style={[styles.metricValue, getValueColor(metrics.cagr)]}>
                {metrics.cagr !== null ? formatPercentage(metrics.cagr) : 'N/D'}
              </Text>
              <Text style={styles.metricSubtitle}>Tasso di crescita annualizzato</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Time-Weighted Return</Text>
              <Text style={[styles.metricValue, getValueColor(metrics.timeWeightedReturn)]}>
                {metrics.timeWeightedReturn !== null ? formatPercentage(metrics.timeWeightedReturn) : 'N/D'}
              </Text>
              <Text style={styles.metricSubtitle}>Metrica raccomandata</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Money-Weighted Return (IRR)</Text>
              <Text style={[styles.metricValue, getValueColor(metrics.moneyWeightedReturn)]}>
                {metrics.moneyWeightedReturn !== null ? formatPercentage(metrics.moneyWeightedReturn) : 'N/D'}
              </Text>
              <Text style={styles.metricSubtitle}>Considera timing decisioni</Text>
            </View>
          </View>
        </View>

        {/* Category 2: Risk Metrics */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>Metriche di Rischio</Text>
          <Text style={styles.categoryDescription}>
            Valutano la volatilità e i drawdown del portafoglio
          </Text>

          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Volatilità</Text>
              <Text style={[styles.metricValue, styles.neutral]}>
                {metrics.volatility !== null ? formatPercentage(metrics.volatility) : 'N/D'}
              </Text>
              <Text style={styles.metricSubtitle}>Deviazione standard annualizzata</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Sharpe Ratio</Text>
              <Text style={[styles.metricValue, styles.neutral]}>
                {metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : 'N/D'}
              </Text>
              <Text style={styles.metricSubtitle}>Rendimento per unità di rischio</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Max Drawdown</Text>
              <Text style={[styles.metricValue, styles.negative]}>
                {metrics.maxDrawdown !== null ? formatPercentage(metrics.maxDrawdown) : 'N/D'}
              </Text>
              {metrics.maxDrawdownDate && (
                <Text style={styles.metricSubtitle}>Trough: {metrics.maxDrawdownDate}</Text>
              )}
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Durata Drawdown</Text>
              <Text style={[styles.metricValue, styles.neutral]}>
                {formatMonths(metrics.drawdownDuration)}
              </Text>
              {metrics.drawdownPeriod && (
                <Text style={styles.metricSubtitle}>{metrics.drawdownPeriod}</Text>
              )}
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Recovery Time</Text>
              <Text style={[styles.metricValue, styles.neutral]}>
                {formatMonths(metrics.recoveryTime)}
              </Text>
              {metrics.recoveryPeriod && (
                <Text style={styles.metricSubtitle}>{metrics.recoveryPeriod}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Category 3: Context Metrics */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>Metriche di Contesto</Text>
          <Text style={styles.categoryDescription}>
            Informazioni sul periodo e sui contributi
          </Text>

          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Contributi Netti</Text>
              <Text style={[styles.metricValue, getValueColor(metrics.netCashFlow)]}>
                {formatCurrency(metrics.netCashFlow)}
              </Text>
              <Text style={styles.metricSubtitle}>
                Entrate: {formatCurrency(metrics.totalIncome)} | Dividendi: {formatCurrency(metrics.totalDividendIncome)}
              </Text>
              <Text style={styles.metricSubtitle}>
                Uscite: {formatCurrency(metrics.totalExpenses)}
              </Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Durata</Text>
              <Text style={[styles.metricValue, styles.neutral]}>
                {formatMonths(metrics.numberOfMonths)}
              </Text>
              <Text style={styles.metricSubtitle}>Periodo analizzato</Text>
            </View>
          </View>
        </View>

        {/* Category 4: Dividend Metrics (conditional) */}
        {hasDividendData && (
          <View style={styles.categorySection}>
            <Text style={styles.categoryTitle}>Metriche Dividendi</Text>
            <Text style={styles.categoryDescription}>
              Rendimento da dividendi (annualizzato)
            </Text>

            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>YOC Lordo</Text>
                <Text style={[styles.metricValue, getValueColor(metrics.yocGross)]}>
                  {metrics.yocGross !== null ? formatPercentage(metrics.yocGross) : 'N/D'}
                </Text>
                <Text style={styles.metricSubtitle}>
                  Yield on Cost (base costo)
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>YOC Netto</Text>
                <Text style={[styles.metricValue, getValueColor(metrics.yocNet)]}>
                  {metrics.yocNet !== null ? formatPercentage(metrics.yocNet) : 'N/D'}
                </Text>
                <Text style={styles.metricSubtitle}>
                  Yield on Cost al netto imposte
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Current Yield Lordo</Text>
                <Text style={[styles.metricValue, getValueColor(metrics.currentYield)]}>
                  {metrics.currentYield !== null ? formatPercentage(metrics.currentYield) : 'N/D'}
                </Text>
                <Text style={styles.metricSubtitle}>
                  Yield su valore mercato
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Current Yield Netto</Text>
                <Text style={[styles.metricValue, getValueColor(metrics.currentYieldNet)]}>
                  {metrics.currentYieldNet !== null ? formatPercentage(metrics.currentYieldNet) : 'N/D'}
                </Text>
                <Text style={styles.metricSubtitle}>
                  Yield al netto imposte
                </Text>
              </View>
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

/**
 * Helper: Determine text color based on value (green for positive, red for negative)
 */
function getValueColor(value: number | null): { color: string } {
  if (value === null) return styles.neutral;
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return styles.neutral;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  divider: {
    height: 2,
    backgroundColor: '#3B82F6',
    marginBottom: 4,
  },
  content: {
    flex: 1,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderLeft: '3px solid #E5E7EB',
  },
  metricLabel: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  metricSubtitle: {
    fontSize: 8,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  positive: {
    color: '#10B981',
  },
  negative: {
    color: '#EF4444',
  },
  neutral: {
    color: '#1F2937',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    borderTop: '1px solid #E5E7EB',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 9,
    color: '#6B7280',
  },
});
