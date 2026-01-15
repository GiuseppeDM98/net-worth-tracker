// components/pdf/primitives/PDFChart.tsx
// Wrapper component for rendering chart images in PDF

import { View, Image, Text, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { ChartImage } from '@/types/pdf';

interface PDFChartProps {
  image: ChartImage;
  caption?: string;
  maxWidth?: number;    // Default: 500
  maxHeight?: number;   // Default: 300
  style?: Style | Style[];
}

/**
 * Wrapper component for rendering pre-captured chart images in PDF documents.
 *
 * Why pre-captured images instead of live charts?
 * @react-pdf/renderer doesn't support HTML canvas or SVG rendering (used by Recharts).
 * Instead, we capture charts as base64 PNG images on the client side before PDF generation
 * using html-to-image library, then embed the static images in the PDF.
 *
 * Aspect ratio preservation algorithm:
 * 1. Start with image's natural dimensions
 * 2. Scale width down to fit maxWidth constraint (default: 500px)
 * 3. Calculate height from scaled width to preserve aspect ratio
 * 4. If resulting height exceeds maxHeight (default: 300px), recalculate from height instead
 * 5. This ensures images fit within bounds without distortion
 *
 * Recommended image specifications:
 * - Resolution: 2x device pixel ratio (DPR) for crisp rendering (e.g., 1000x600 for 500x300 display)
 * - Format: PNG with transparency support
 * - Compression: Base64 data URLs (handled by html-to-image)
 *
 * @param image - Chart image object with dataUrl (base64 PNG), width, and height
 * @param caption - Optional caption text displayed below the chart
 * @param maxWidth - Maximum width constraint in pixels (default: 500)
 * @param maxHeight - Maximum height constraint in pixels (default: 300)
 * @param style - Optional style override(s) for the container
 *
 * @example
 * <PDFChart
 *   image={{ dataUrl: 'data:image/png;base64,...', width: 1000, height: 600 }}
 *   caption="Monthly Returns Heatmap"
 * />
 */
export function PDFChart({
  image,
  caption,
  maxWidth = 500,
  maxHeight = 300,
  style,
}: PDFChartProps) {
  // Aspect ratio preservation: Scale to fit within maxWidth x maxHeight bounds
  // without distortion by maintaining the original width/height ratio.
  const aspectRatio = image.width / image.height;
  let width = Math.min(image.width, maxWidth);
  let height = width / aspectRatio;

  // If height constraint violated, recalculate from height instead of width.
  // This handles both wide and tall images correctly.
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  // Style normalization pattern: Same as other primitives for consistency.
  const viewStyle = style
    ? Array.isArray(style)
      ? [styles.chartContainer, ...style]
      : [styles.chartContainer, style]
    : styles.chartContainer;

  return (
    <View style={viewStyle}>
      <Image
        src={image.dataUrl}
        style={{ width, height }}
      />
      {caption && (
        <Text style={styles.caption}>{caption}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  caption: {
    fontSize: 8,
    fontFamily: 'Helvetica-Oblique',
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
  },
});
