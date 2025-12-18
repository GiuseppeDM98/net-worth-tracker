// components/pdf/sections/CoverSection.tsx
// PDF cover page with logo, title, and metadata

import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { TimeFilter } from '@/types/pdf';

interface CoverSectionProps {
  generatedAt: Date;
  userName: string;
  timeFilter?: TimeFilter;
}

function getReportTypeLabel(timeFilter?: TimeFilter): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.toLocaleString('it-IT', { month: 'long' });
  const capitalizedMonth = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);

  switch (timeFilter) {
    case 'monthly':
      return `Report Mensile - ${capitalizedMonth} ${currentYear}`;
    case 'yearly':
      return `Report Annuale - ${currentYear}`;
    case 'total':
    default:
      return 'Report Totale';
  }
}

export function CoverSection({ generatedAt, userName, timeFilter }: CoverSectionProps) {
  const formattedDate = format(generatedAt, 'dd/MM/yyyy', { locale: it });

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>Portfolio Report</Text>

        {/* Report Type Badge */}
        {timeFilter && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{getReportTypeLabel(timeFilter)}</Text>
          </View>
        )}

        {/* Subtitle */}
        <Text style={styles.subtitle}>{userName}</Text>

        {/* Date */}
        <Text style={styles.date}>Generato il {formattedDate}</Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Documento generato automaticamente dal Portfolio Tracker.
          </Text>
          <Text style={styles.disclaimerText}>
            I dati riflettono lo stato del portfolio alla data di generazione.
          </Text>
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 36,
    fontFamily: 'Helvetica-Bold',
    color: '#3B82F6',
    marginBottom: 20,
    textAlign: 'center',
  },
  badge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 20,
    fontFamily: 'Helvetica',
    color: '#374151',
    marginBottom: 30,
    textAlign: 'center',
  },
  date: {
    fontSize: 14,
    fontFamily: 'Helvetica',
    color: '#6B7280',
    marginBottom: 40,
  },
  divider: {
    width: '60%',
    height: 2,
    backgroundColor: '#3B82F6',
    marginBottom: 40,
  },
  disclaimer: {
    marginTop: 60,
    paddingHorizontal: 60,
  },
  disclaimerText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Oblique',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 6,
  },
});
