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
  selectedYear?: number;
  selectedMonth?: number;
}

/**
 * Derives report type label from time filter and user-selected period.
 *
 * Uses selectedYear/selectedMonth when provided (custom period export),
 * falls back to current date for backwards compatibility.
 *
 * Capitalization logic:
 * Italian month names from toLocaleString() are lowercase ("gennaio", "febbraio").
 * We capitalize the first letter for professional appearance in title context.
 *
 * @returns Formatted report type string
 * - Monthly: "Report Mensile - Gennaio 2024"
 * - Yearly: "Report Annuale - 2024"
 * - Total: "Report Totale"
 */
function getReportTypeLabel(
  timeFilter?: TimeFilter,
  selectedYear?: number,
  selectedMonth?: number
): string {
  const now = new Date();
  const year = selectedYear ?? now.getFullYear();

  switch (timeFilter) {
    case 'monthly': {
      // Build a Date from the selected month to get Italian locale name
      const monthIndex = (selectedMonth ?? (now.getMonth() + 1)) - 1;
      const monthName = new Date(2024, monthIndex).toLocaleString('it-IT', { month: 'long' });
      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      return `Report Mensile - ${capitalizedMonth} ${year}`;
    }
    case 'yearly':
      return `Report Annuale - ${year}`;
    case 'total':
    default:
      return 'Report Totale';
  }
}

/**
 * Professional cover page (title page) for PDF reports.
 *
 * Layout:
 * - Centered design with large title
 * - Report type badge (monthly/yearly/total) with conditional coloring
 * - User name as subtitle
 * - Generation date
 * - Disclaimer text
 *
 * Always rendered first in PDFDocument, not optional.
 *
 * @param generatedAt - Report generation timestamp
 * @param userName - User's display name
 * @param timeFilter - Report period (total/yearly/monthly)
 */
export function CoverSection({ generatedAt, userName, timeFilter, selectedYear, selectedMonth }: CoverSectionProps) {
  const formattedDate = format(generatedAt, 'dd/MM/yyyy', { locale: it });

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>Portfolio Report</Text>

        {/* Report Type Badge */}
        {timeFilter && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{getReportTypeLabel(timeFilter, selectedYear, selectedMonth)}</Text>
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
