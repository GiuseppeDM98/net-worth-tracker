// components/pdf/primitives/PDFText.tsx
// Reusable text component with pre-configured variants for PDF

import { Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { PRINT_COLORS, PDF_FONTS } from '@/lib/constants/printTokens';
import { PDF_RAMP } from './PDFTile';

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
 * Variant usage guide (sizes in POINTS, from PDF_RAMP):
 * - heading: a block title inside a page (13pt bold)
 * - subheading: the eyebrow above a block (7pt bold, uppercase, muted) — the app's one eyebrow
 * - body: reading copy (9.5pt) [default]
 * - caption: a note or a source line (7.5pt muted)
 * - bold: an emphasised run inside body copy
 *
 * Note: @react-pdf/renderer only supports the standard PDF families without registering font
 * files — see `PDF_FONTS` in lib/constants/printTokens.ts, which owns that decision and the
 * reason for it. Sizes come from `PDF_RAMP`, colours from `PRINT_COLORS`: no literal here.
 *
 * @param variant - Typography variant to use (defaults to 'body')
 * @param children - Text content to render
 * @param style - Optional style override(s) merged with variant base styles
 *
 * @example
 * <PDFText variant="heading">Riepilogo</PDFText>
 * <PDFText variant="caption">Fonte: snapshot di fine mese</PDFText>
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
    fontSize: 13,
    fontFamily: PDF_FONTS.bold,
    marginBottom: 8,
    color: PRINT_COLORS.foreground,
  },
  subheading: {
    fontSize: PDF_RAMP.eyebrow,
    fontFamily: PDF_FONTS.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 6,
    color: PRINT_COLORS.mutedForeground,
  },
  body: {
    fontSize: PDF_RAMP.reading,
    fontFamily: PDF_FONTS.regular,
    lineHeight: 1.5,
    marginBottom: 4,
    color: PRINT_COLORS.foreground,
  },
  caption: {
    fontSize: PDF_RAMP.caption,
    fontFamily: PDF_FONTS.regular,
    color: PRINT_COLORS.mutedForeground,
    marginBottom: 2,
  },
  bold: {
    fontSize: PDF_RAMP.reading,
    fontFamily: PDF_FONTS.bold,
    marginBottom: 4,
    color: PRINT_COLORS.foreground,
  },
});
