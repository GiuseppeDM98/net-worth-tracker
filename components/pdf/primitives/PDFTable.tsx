// components/pdf/primitives/PDFTable.tsx
// The one table shape of the report: a hairline under the head, one rule per row.

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { PRINT_COLORS, PDF_FONTS } from '@/lib/constants/printTokens';
import { PDF_RAMP } from './PDFTile';
import { pdfSafeText } from '@/lib/utils/pdfNarrative';

interface PDFTableProps {
  headers: string[];
  rows: (string | number)[][];
  columnWidths?: string[];        // Default: equal width
  /** Indices of the columns whose text is right-aligned — every numeric column. */
  alignRight?: number[];
  style?: Style | Style[];
}

/**
 * One table shape for every section: an uppercase eyebrow-sized head over a single hairline,
 * then rows separated by the lighter in-tile rule. There is no zebra fill and no accent border —
 * a table that needs a striped background to be readable has too many columns, and the blue
 * head rule it used to carry was the report's largest breach of the Zero-Chroma Rule.
 *
 * Numeric columns must be right-aligned by the caller through `alignRight`: without a monospace
 * face, the column is the only thing that keeps figures in line.
 *
 * Column width format: Array of percentage strings like ['30%', '40%', '30%'] that sum to 100%.
 * If not provided, columns are auto-sized equally (e.g., 3 columns = ['33.33%', '33.33%', '33.33%']).
 *
 * @param headers - Column header labels displayed in bold uppercase
 * @param rows - 2D array of cell data (strings or numbers)
 * @param columnWidths - Optional array of percentage strings for custom column widths
 * @param alignRight - Indices of the numeric columns, which must be right-aligned
 * @param style - Optional style override(s) merged with base table styles
 *
 * @example
 * <PDFTable
 *   headers={['Asset', 'Value', 'Allocation']}
 *   rows={[['Stocks', '€50,000', '70%'], ['Bonds', '€21,429', '30%']]}
 *   columnWidths={['40%', '30%', '30%']}
 *   alignRight={[1, 2]}
 * />
 */
export function PDFTable({
  headers,
  rows,
  columnWidths,
  alignRight = [],
  style,
}: PDFTableProps) {
  // Calculate equal widths if not provided.
  // Algorithm: Distribute 100% equally across all columns.
  // Example: 3 columns → ['33.333333333333336%', '33.333333333333336%', '33.333333333333336%']
  const widths = columnWidths || headers.map(() => `${100 / headers.length}%`);

  // Style normalization pattern: Same as PDFText for consistency.
  // Converts single style or array to unified format, merging with base table styles.
  const tableStyle = style
    ? Array.isArray(style)
      ? [styles.table, ...style]
      : [styles.table, style]
    : styles.table;

  return (
    <View style={tableStyle}>
      {/* Head: the eyebrow, over the one hairline that separates it from the rows */}
      <View style={styles.headerRow}>
        {headers.map((header, i) => (
          <View key={i} style={[styles.headerCell, { width: widths[i] }]}>
            <Text style={[styles.headerText, alignRight.includes(i) ? { textAlign: 'right' } : {}]}>{pdfSafeText(header)}</Text>
          </View>
        ))}
      </View>

      {/* Rows, on the lighter in-tile rule; the last one carries none */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={[styles.row, rowIdx === rows.length - 1 ? { borderBottomWidth: 0 } : {}]}>
          {row.map((cell, cellIdx) => (
            <View key={cellIdx} style={[styles.cell, { width: widths[cellIdx] }]}>
              <Text style={[styles.cellText, alignRight.includes(cellIdx) ? { textAlign: 'right' } : {}]}>{pdfSafeText(String(cell))}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: PRINT_COLORS.border,
    paddingBottom: 6,
  },
  headerCell: {
    justifyContent: 'flex-end',
    paddingHorizontal: 3,
  },
  headerText: {
    fontSize: PDF_RAMP.tableHead,
    fontFamily: PDF_FONTS.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PRINT_COLORS.mutedForeground,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: PRINT_COLORS.rowRule,
    paddingVertical: 5,
    minHeight: 18,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cellText: {
    fontSize: PDF_RAMP.tableCell,
    fontFamily: PDF_FONTS.regular,
    color: PRINT_COLORS.foreground,
  },
});
