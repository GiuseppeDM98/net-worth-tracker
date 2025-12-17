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

export function PDFSection({
  title,
  children,
  pageBreakBefore = false,
  style,
}: PDFSectionProps) {
  // Normalize style to array
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
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.divider} />
      </View>
      <View style={contentStyle}>
        {children}
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
