// lib/utils/chartCapture.ts
// Chart capture utilities using html2canvas

import html2canvas from 'html2canvas';
import type { ChartImage, ChartCaptureOptions } from '@/types/pdf';

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Capture a single chart as PNG image with retry logic
 *
 * @param options - Chart capture configuration
 * @param retries - Number of retry attempts (default: 2)
 * @returns ChartImage object or null if capture fails
 */
export async function captureChart(
  options: ChartCaptureOptions,
  retries = 2
): Promise<ChartImage | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const element = document.getElementById(options.chartId);

      if (!element) {
        console.warn(`Chart not found: ${options.chartId} (attempt ${attempt}/${retries})`);
        if (attempt < retries) {
          await sleep(500); // Wait for potential render
          continue;
        }
        return null;
      }

      // Wait a bit to ensure chart is fully rendered
      if (attempt === 1) {
        await sleep(100);
      }

      // 🔧 FIX: Override LAB colors with HEX before capture
      // Save original colors
      const originalBgColor = element.style.backgroundColor;
      const cardParent = element.closest('.bg-card') as HTMLElement | null;
      const originalCardBg = cardParent?.style.backgroundColor;

      // Force white background in HEX format (overrides LAB computed styles)
      element.style.backgroundColor = '#ffffff';
      if (cardParent) {
        cardParent.style.backgroundColor = '#ffffff';
      }

      try {
        const canvas = await html2canvas(element, {
          scale: options.scale || 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          allowTaint: false,
          width: options.width,
          height: options.height,
        });

        const actualScale = options.scale || 2;
        const chartImage: ChartImage = {
          id: options.chartId,
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width / actualScale,
          height: canvas.height / actualScale,
        };

        console.log(`Chart captured successfully: ${options.chartId} (${chartImage.width}x${chartImage.height})`);
        return chartImage;
      } finally {
        // 🔧 CLEANUP: Restore original colors
        element.style.backgroundColor = originalBgColor;
        if (cardParent && originalCardBg !== undefined) {
          cardParent.style.backgroundColor = originalCardBg;
        }
      }

    } catch (error) {
      console.error(`Chart capture failed for ${options.chartId} (attempt ${attempt}/${retries}):`, error);
      if (attempt < retries) {
        await sleep(500);
      }
    }
  }

  console.error(`All capture attempts failed for ${options.chartId}`);
  return null;
}

/**
 * Capture multiple charts in parallel with controlled batching
 *
 * Processes charts in batches of 3 to avoid memory spikes
 *
 * @param chartIds - Array of HTML element IDs to capture
 * @returns Map of chart ID to ChartImage (only successful captures)
 */
export async function captureCharts(
  chartIds: string[]
): Promise<Map<string, ChartImage>> {
  const results = new Map<string, ChartImage>();

  // Split into chunks of 3 for controlled parallelization
  const chunks: string[][] = [];
  for (let i = 0; i < chartIds.length; i += 3) {
    chunks.push(chartIds.slice(i, i + 3));
  }

  console.log(`Capturing ${chartIds.length} charts in ${chunks.length} batches...`);

  for (const chunk of chunks) {
    console.log(`Processing batch: ${chunk.join(', ')}`);

    const captures = await Promise.all(
      chunk.map(id => captureChart({ chartId: id }))
    );

    captures.forEach((img, i) => {
      if (img) {
        results.set(chunk[i], img);
      }
    });
  }

  console.log(`Chart capture complete: ${results.size}/${chartIds.length} successful`);
  return results;
}

/**
 * Cleanup chart images to free memory
 *
 * Revokes blob URLs if present and clears the map
 *
 * @param images - Map of chart images to cleanup
 */
export function cleanupChartImages(images: Map<string, ChartImage>): void {
  images.forEach(img => {
    // Revoke blob URLs if present (though we use data URLs, this is safe)
    if (img.dataUrl.startsWith('blob:')) {
      URL.revokeObjectURL(img.dataUrl);
    }
  });

  images.clear();
  console.log('Chart images cleaned up');
}

/**
 * Check if a chart element exists in the DOM
 *
 * @param chartId - HTML element ID
 * @returns true if element exists
 */
export function chartExists(chartId: string): boolean {
  return document.getElementById(chartId) !== null;
}
