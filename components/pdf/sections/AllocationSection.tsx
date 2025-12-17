// components/pdf/sections/AllocationSection.tsx
// Asset allocation section with current vs target comparison

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFText } from '../primitives/PDFText';
import { PDFTable } from '../primitives/PDFTable';
import type { AllocationData, ChartImage } from '@/types/pdf';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

interface AllocationSectionProps {
  data: AllocationData;
  chartImage?: ChartImage;
}

export function AllocationSection({ data, chartImage }: AllocationSectionProps) {
  if (!data || data.byAssetClass.length === 0) {
    return (
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Asset Allocation</Text>
          <View style={styles.divider} />
        </View>
        <View style={styles.content}>
          <PDFText variant="body" style={styles.noData}>
            Nessuna allocazione disponibile.
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
        <Text style={styles.title}>Asset Allocation</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.content}>
        {/* Allocation table */}
        <View style={styles.section}>
          <PDFText variant="subheading">Allocazione per Asset Class</PDFText>
          <PDFTable
            headers={[
              'Asset Class',
              'Valore Corrente',
              '% Corrente',
              data.hasTargets ? '% Target' : '',
              data.hasTargets ? 'Differenza' : '',
            ].filter(h => h !== '')}
            rows={data.byAssetClass.map(item => {
              const row: (string | number)[] = [
                item.displayName,
                formatCurrency(item.currentValue),
                formatPercentage(item.currentPercent),
              ];

              if (data.hasTargets) {
                row.push(
                  item.targetPercent !== undefined ? formatPercentage(item.targetPercent) : '-',
                  item.difference !== undefined ? formatCurrency(item.difference) : '-'
                );
              }

              return row;
            })}
            columnWidths={data.hasTargets
              ? ['25%', '25%', '15%', '15%', '20%']
              : ['35%', '35%', '30%']
            }
          />

          {!data.hasTargets && (
            <PDFText variant="caption" style={styles.note}>
              * Target allocation non configurato
            </PDFText>
          )}
        </View>

        {/* Rebalancing actions */}
        {data.rebalancingNeeded && data.rebalancingActions.length > 0 && (
          <View style={styles.section}>
            <PDFText variant="subheading">Azioni di Rebalancing Consigliate</PDFText>
            <PDFText variant="caption" style={styles.caption}>
              (Soglia di intervento: ±€100)
            </PDFText>

            <View style={styles.actionsContainer}>
              {data.rebalancingActions.map((action, idx) => (
                <View key={idx} style={styles.actionCard}>
                  <View style={[
                    styles.actionBadge,
                    action.action === 'buy' ? styles.buyBadge : styles.sellBadge
                  ]}>
                    <Text style={styles.actionBadgeText}>
                      {action.action === 'buy' ? 'COMPRA' : 'VENDI'}
                    </Text>
                  </View>
                  <View style={styles.actionDetails}>
                    <Text style={styles.actionAssetClass}>{action.assetClass}</Text>
                    <Text style={styles.actionAmount}>{formatCurrency(action.amount)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {!data.rebalancingNeeded && data.hasTargets && (
          <View style={styles.section}>
            <View style={styles.successCard}>
              <Text style={styles.successText}>
                ✓ Portfolio bilanciato - Nessuna azione di rebalancing necessaria
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
  section: {
    marginBottom: 25,
  },
  note: {
    marginTop: 8,
    color: '#F59E0B',
  },
  caption: {
    marginBottom: 10,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  actionCard: {
    width: '48%',
    marginRight: '2%',
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    marginRight: 10,
  },
  buyBadge: {
    backgroundColor: '#10B981',
  },
  sellBadge: {
    backgroundColor: '#EF4444',
  },
  actionBadgeText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  actionDetails: {
    flex: 1,
  },
  actionAssetClass: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 2,
  },
  actionAmount: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#000000',
  },
  successCard: {
    padding: 15,
    backgroundColor: '#D1FAE5',
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  successText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#065F46',
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
