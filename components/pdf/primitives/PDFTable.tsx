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

export function PDFTable({
  headers,
  rows,
  columnWidths,
  alternatingRows = true,
  style,
}: PDFTableProps) {
  // Calculate equal widths if not provided
  const widths = columnWidths || headers.map(() => `${100 / headers.length}%`);

  // Normalize style to array
  const tableStyle = style
    ? Array.isArray(style)
      ? [styles.table, ...style]
      : [styles.table, style]
    : styles.table;

  return (
    <View style={tableStyle}>
      {/* Header row */}
      <View style={styles.headerRow}>
        {headers.map((header, i) => (
          <View key={i} style={[styles.headerCell, { width: widths[i] }]}>
            <Text style={styles.headerText}>{header}</Text>
          </View>
        ))}
      </View>

      {/* Data rows */}
      {rows.map((row, rowIdx) => {
        const rowStyle: Style[] = [styles.row];
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
