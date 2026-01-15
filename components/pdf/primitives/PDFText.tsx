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

/**
 * Reusable text component for PDF documents with pre-configured typography variants.
 *
 * Provides consistent styling across all PDF sections and supports custom style overrides
 * via the style prop which will be merged with the variant's base styles.
 *
 * Variant usage guide:
 * - heading: Section titles (18px, bold, black)
 * - subheading: Subsection titles (14px, bold, gray)
 * - body: Regular paragraph text (10px, regular, black) [default]
 * - caption: Small annotations and footnotes (8px, italic, light gray)
 * - bold: Emphasized inline text (10px, bold, black)
 *
 * Note: @react-pdf/renderer only supports Helvetica font family variants:
 * Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique.
 * Custom fonts require additional font registration.
 *
 * @param variant - Typography variant to use (defaults to 'body')
 * @param children - Text content to render
 * @param style - Optional style override(s) merged with variant base styles
 *
 * @example
 * <PDFText variant="heading">Portfolio Summary</PDFText>
 * <PDFText variant="body" style={{ color: '#3B82F6' }}>Blue text</PDFText>
 */
export function PDFText({ variant = 'body', children, style }: PDFTextProps) {
  // Style normalization pattern: Convert single style object or array to unified array format.
  // This allows the component to accept both style={{...}} and style={[{...}, {...}]}
  // while always merging with the variant's base styles as the foundation.
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
