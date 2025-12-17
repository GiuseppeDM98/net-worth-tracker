// components/pdf/primitives/PDFText.tsx
// Reusable text component with pre-configured variants for PDF

import { Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

type TextVariant = 'heading' | 'subheading' | 'body' | 'caption' | 'bold';

interface PDFTextProps {
  variant?: TextVariant;
  children: React.ReactNode;
  style?: Style | Style[];
}

export function PDFText({ variant = 'body', children, style }: PDFTextProps) {
  // Normalize style to array
  const textStyle = style
    ? Array.isArray(style)
      ? [styles[variant], ...style]
      : [styles[variant], style]
    : styles[variant];

  return (
    <Text style={textStyle}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
    color: '#000000',
  },
  subheading: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    color: '#374151',
  },
  body: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    marginBottom: 4,
    color: '#000000',
  },
  caption: {
    fontSize: 8,
    fontFamily: 'Helvetica-Oblique',
    color: '#666666',
    marginBottom: 2,
  },
  bold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    color: '#000000',
  },
});
