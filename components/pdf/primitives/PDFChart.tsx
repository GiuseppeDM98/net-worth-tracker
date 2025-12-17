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

export function PDFChart({
  image,
  caption,
  maxWidth = 500,
  maxHeight = 300,
  style,
}: PDFChartProps) {
  // Calculate aspect ratio preserving dimensions
  const aspectRatio = image.width / image.height;
  let width = Math.min(image.width, maxWidth);
  let height = width / aspectRatio;

  // If height exceeds maxHeight, recalculate based on height
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  // Normalize style to array
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
