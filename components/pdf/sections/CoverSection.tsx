// components/pdf/sections/CoverSection.tsx
// Page 1: the report's verdict.

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { PRINT_COLORS, PDF_FONTS } from '@/lib/constants/printTokens';
import { PDF_RAMP, PDF_PAGE_MARGIN, PDFVerdict } from '../primitives/PDFTile';
import { reportScopeLabel, type PageVerdictModel } from '@/lib/utils/pdfNarrative';
import type { TimeFilter } from '@/types/pdf';

interface CoverSectionProps {
  generatedAt: Date;
  userName: string;
  verdict: PageVerdictModel;
  sectionTitles: string[];
  timeFilter?: TimeFilter;
  selectedYear?: number;
  selectedMonth?: number;
}

/**
 * The cover page.
 *
 * It used to be a frontispiece: a 36pt blue "Portfolio Report", a pill badge, a 2pt blue rule
 * and a disclaimer — a whole page that told the reader nothing the file name did not. It is now
 * the report's verdict, in the same shape every page of the app opens with: eyebrow, one
 * rule-generated sentence, the facts under it, and the logistics at the foot where they belong.
 *
 * The words come from `buildReportVerdict`; this component chooses no copy of its own.
 */
export function CoverSection({
  generatedAt,
  userName,
  verdict,
  sectionTitles,
  timeFilter,
  selectedYear,
  selectedMonth,
}: CoverSectionProps) {
  const formattedDate = format(generatedAt, 'dd/MM/yyyy · HH:mm', { locale: it });

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>Net Worth Tracker</Text>
        <Text style={styles.eyebrow}>{reportScopeLabel(timeFilter, selectedYear, selectedMonth, generatedAt)}</Text>
      </View>

      {/* The verdict sits on the optical centre, not the geometric one: the block below it is
          heavier than the strip above, so a true centre reads as low. */}
      <View style={styles.middle}>
        <View style={styles.verdictColumn}>
          <PDFVerdict verdict={verdict} />
        </View>
      </View>

      <View>
        <View style={styles.rule} />
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Intestatario</Text>
            <Text style={styles.metaValue}>{userName}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Generato il</Text>
            <Text style={styles.metaValue}>{formattedDate}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Sezioni</Text>
            <Text style={styles.metaValue}>{sectionTitles.length} di 7</Text>
          </View>
        </View>
        <Text style={styles.note}>
          {sectionTitles.join(' · ')}. I dati riflettono lo stato alla data di generazione; le valutazioni sono ai
          prezzi correnti e possono variare. Documento generato automaticamente: non costituisce consulenza finanziaria.
        </Text>
      </View>

      <View style={styles.footer} fixed>
        <View style={styles.rule} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Net Worth Tracker</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingTop: PDF_PAGE_MARGIN,
    paddingBottom: PDF_PAGE_MARGIN + 22,
    paddingHorizontal: PDF_PAGE_MARGIN,
    backgroundColor: PRINT_COLORS.background,
    fontFamily: PDF_FONTS.regular,
    color: PRINT_COLORS.foreground,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: {
    fontSize: PDF_RAMP.eyebrow,
    fontFamily: PDF_FONTS.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: PRINT_COLORS.mutedForeground,
  },
  middle: { flexGrow: 1, justifyContent: 'center', paddingBottom: 60 },
  verdictColumn: { maxWidth: 400 },
  rule: { height: 1, backgroundColor: PRINT_COLORS.border },
  metaRow: { flexDirection: 'row', marginTop: 12 },
  metaCell: { flexGrow: 1, flexBasis: 0, paddingRight: 12 },
  metaLabel: {
    fontSize: PDF_RAMP.metricLabel,
    fontFamily: PDF_FONTS.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PRINT_COLORS.mutedForeground,
  },
  metaValue: { fontSize: PDF_RAMP.reading, marginTop: 5 },
  note: { fontSize: PDF_RAMP.caption, lineHeight: 1.6, color: PRINT_COLORS.mutedForeground, marginTop: 16 },
  footer: { position: 'absolute', left: PDF_PAGE_MARGIN, right: PDF_PAGE_MARGIN, bottom: 26 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7 },
  footerText: { fontSize: PDF_RAMP.footer, color: PRINT_COLORS.mutedForeground },
});
