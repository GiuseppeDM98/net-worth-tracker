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

export function SummarySection({ data }: SummarySectionProps) {
  const formattedDate = format(data.generatedAt, 'dd/MM/yyyy HH:mm', { locale: it });

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Riepilogo</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.content}>
        {/* Key metrics summary */}
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
            <Text style={[
              styles.metricValue,
              data.incomeToExpenseRatio >= 1.2 ? styles.positive :
              data.incomeToExpenseRatio >= 0.8 ? styles.warning : styles.negative
            ]}>
              {data.incomeToExpenseRatio.toFixed(2)}x
            </Text>
          </View>
        </View>

        {/* Metadata */}
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

        {/* Data completeness */}
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
          <Text style={styles.disclaimerTitle}>📋 Disclaimer</Text>
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
