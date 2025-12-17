// lib/utils/chartCapture.ts
// Chart capture utilities using html2canvas

import html2canvas from 'html2canvas';
import type { ChartImage, ChartCaptureOptions } from '@/types/pdf';
import { convertOklchToHex, isOklchColor } from './colorConverter';

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Backup object for storing original inline styles
 */
interface StyleBackup {
  element: HTMLElement;
  originalStyles: {
    backgroundColor?: string;
    color?: string;
    borderColor?: string;
    fill?: string;
    stroke?: string;
  };
}

/**
 * CSS color properties to check and override
 */
const COLOR_PROPERTIES = [
  'backgroundColor',
  'color',
  'borderColor',
  'fill',
  'stroke',
] as const;

/**
 * Recursively override OKLCh colors with hex equivalents for html2canvas
 *
 * Traverses the DOM tree starting from rootElement and finds all elements
 * with computed styles containing OKLCh colors. Converts them to hex format
 * and applies as inline styles. Stores original inline styles for restoration.
 *
 * @param rootElement - Root element to start traversal from (typically chart container)
 * @returns Array of StyleBackup objects for restoration
 */
function overrideOklchColors(rootElement: HTMLElement): StyleBackup[] {
  const backups: StyleBackup[] = [];

  try {
    // Use TreeWalker for efficient DOM traversal
    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    let currentNode = walker.currentNode as HTMLElement;

    while (currentNode) {
      const computedStyle = window.getComputedStyle(currentNode);
      const backup: StyleBackup = {
        element: currentNode,
        originalStyles: {},
      };
      let hasChanges = false;

      // Check each color property
      COLOR_PROPERTIES.forEach((prop) => {
        const value = computedStyle[prop];

        if (value && isOklchColor(value)) {
          // Store original inline style (may be empty)
          backup.originalStyles[prop] = currentNode.style[prop as keyof CSSStyleDeclaration] as string;

          // Convert OKLCh to hex and set as inline style
          const hexColor = convertOklchToHex(value);
          (currentNode.style as any)[prop] = hexColor;
          hasChanges = true;
        }
      });

      // Only save backup if we made changes
      if (hasChanges) {
        backups.push(backup);
      }

      currentNode = walker.nextNode() as HTMLElement;
    }

  } catch (error) {
    console.error('Error during OKLCh color override:', error);
    // Return whatever backups we collected so far
  }

  return backups;
}

/**
 * Restore original inline styles from backup
 *
 * Iterates through backup array and restores each element's original inline styles.
 * If the original style was empty, removes the inline property entirely.
 *
 * @param backups - Array of StyleBackup objects from overrideOklchColors()
 */
function restoreOriginalStyles(backups: StyleBackup[]): void {
  try {
    backups.forEach(({ element, originalStyles }) => {
      Object.entries(originalStyles).forEach(([prop, value]) => {
        if (value === undefined || value === '') {
          // Original style was empty, remove the inline property
          element.style.removeProperty(prop);
        } else {
          // Restore original inline style
          (element.style as any)[prop] = value;
        }
      });
    });
  } catch (error) {
    console.error('Error restoring original styles:', error);
  }
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

      // Override OKLCh colors with hex equivalents for html2canvas compatibility
      let styleBackups: StyleBackup[] = [];

      try {
        console.log(`[Chart Capture] Overriding OKLCh colors for ${options.chartId}...`);
        styleBackups = overrideOklchColors(element);
        console.log(`[Chart Capture] Overridden ${styleBackups.length} elements with OKLCh colors`);

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

        console.log(`[Chart Capture] Chart captured successfully: ${options.chartId} (${chartImage.width}x${chartImage.height})`);
        return chartImage;
      } finally {
        // Restore original inline styles
        console.log(`[Chart Capture] Restoring ${styleBackups.length} original styles...`);
        restoreOriginalStyles(styleBackups);
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
