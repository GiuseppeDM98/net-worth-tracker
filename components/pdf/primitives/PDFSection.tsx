// components/pdf/primitives/PDFSection.tsx
// Container component for PDF sections with title and divider

import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

interface PDFSectionProps {
  title: string;
  children: React.ReactNode;
  pageBreakBefore?: boolean;
  style?: Style | Style[];
}

/**
 * Container component that provides consistent page layout for all PDF sections.
 *
 * Each section is rendered as an A4 page with:
 * - 40px padding on all sides (balance between content density and readability)
 * - Header: Section title (blue, 18px bold) with matching blue divider
 * - Content area: Flexible space for section-specific content
 * - Footer: Automatic page numbering ("Pagina X di Y") that appears on all pages
 *
 * Page layout strategy:
 * - Fixed header at top (title + divider)
 * - Content area uses flexGrow to fill available space between header and footer
 * - Fixed footer at bottom (absolute positioning at 30px from bottom)
 *
 * This approach ensures consistent spacing across all PDF sections and prevents
 * content from overlapping with the footer.
 *
 * @param title - Section title displayed in the header
 * @param children - Section-specific content (charts, tables, text, etc.)
 * @param pageBreakBefore - Force a page break before this section (default: false)
 * @param style - Optional style override(s) for the content area only
 *
 * @example
 * <PDFSection title="Portfolio Overview">
 *   <PDFText>Your portfolio summary...</PDFText>
 *   <PDFTable headers={...} rows={...} />
 * </PDFSection>
 */
export function PDFSection({
  title,
  children,
  pageBreakBefore = false,
  style,
}: PDFSectionProps) {
  // Style normalization pattern: Same as other primitives for consistency.
  const contentStyle = style
    ? Array.isArray(style)
      ? [styles.content, ...style]
      : [styles.content, style]
    : styles.content;

  return (
    <Page
      size="A4"
      style={styles.page}
      break={pageBreakBefore}
    >
      {/* Section header with title and blue divider */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.divider} />
      </View>

      {/* Main content area - uses flexGrow to fill available space */}
      <View style={contentStyle}>
        {children}
      </View>

      {/* Fixed footer with automatic page numbering.
          Positioned absolutely at bottom to prevent overlap with dynamic content.
          The 'fixed' prop ensures it appears on every page of multi-page sections. */}
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
