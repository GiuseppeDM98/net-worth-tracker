// components/pdf/primitives/PDFTable.tsx
// Generic table component with alternating row colors

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

interface PDFTableProps {
  headers: string[];
  rows: (string | number)[][];
  columnWidths?: string[];        // Default: equal width
  alternatingRows?: boolean;      // Default: true
  style?: Style | Style[];
}

/**
 * Generic table component for PDF documents with flexible column widths and optional alternating row colors.
 *
 * Provides consistent table styling across all PDF sections with a header row (bold, gray background,
 * blue bottom border) and data rows with subtle borders and optional alternating backgrounds for readability.
 *
 * Column width format: Array of percentage strings like ['30%', '40%', '30%'] that sum to 100%.
 * If not provided, columns are auto-sized equally (e.g., 3 columns = ['33.33%', '33.33%', '33.33%']).
 *
 * @param headers - Column header labels displayed in bold uppercase
 * @param rows - 2D array of cell data (strings or numbers)
 * @param columnWidths - Optional array of percentage strings for custom column widths
 * @param alternatingRows - Enable alternating row background colors (default: true)
 * @param style - Optional style override(s) merged with base table styles
 *
 * @example
 * <PDFTable
 *   headers={['Asset', 'Value', 'Allocation']}
 *   rows={[['Stocks', '€50,000', '70%'], ['Bonds', '€21,429', '30%']]}
 *   columnWidths={['40%', '30%', '30%']}
 * />
 */
export function PDFTable({
  headers,
  rows,
  columnWidths,
  alternatingRows = true,
  style,
}: PDFTableProps) {
  // Calculate equal widths if not provided.
  // Algorithm: Distribute 100% equally across all columns.
  // Example: 3 columns → ['33.333333333333336%', '33.333333333333336%', '33.333333333333336%']
  const widths = columnWidths || headers.map(() => `${100 / headers.length}%`);

  // Style normalization pattern: Same as PDFText/PDFChart for consistency.
  // Converts single style or array to unified format, merging with base table styles.
  const tableStyle = style
    ? Array.isArray(style)
      ? [styles.table, ...style]
      : [styles.table, style]
    : styles.table;

  return (
    <View style={tableStyle}>
      {/* Header row with bold text and blue accent */}
      <View style={styles.headerRow}>
        {headers.map((header, i) => (
          <View key={i} style={[styles.headerCell, { width: widths[i] }]}>
            <Text style={styles.headerText}>{header}</Text>
          </View>
        ))}
      </View>

      {/* Data rows with optional alternating background */}
      {rows.map((row, rowIdx) => {
        const rowStyle: Style[] = [styles.row];
        // Apply light gray background to odd-indexed rows (2nd, 4th, 6th, etc.)
        // for improved readability in long tables.
        if (alternatingRows && rowIdx % 2 === 1) {
          rowStyle.push(styles.alternateRow);
        }

        return (
          <View
            key={rowIdx}
            style={rowStyle}
          >
          {row.map((cell, cellIdx) => (
            <View key={cellIdx} style={[styles.cell, { width: widths[cellIdx] }]}>
              <Text style={styles.cellText}>{cell}</Text>
            </View>
          ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 2,
    borderBottomColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  headerCell: {
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 24,
  },
  alternateRow: {
    backgroundColor: '#F9FAFB',
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cellText: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#000000',
  },
});
