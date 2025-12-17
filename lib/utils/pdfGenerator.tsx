// lib/utils/pdfGenerator.ts
// PDF generation orchestrator - main entry point

import { pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { PDFDocument } from '@/components/pdf/PDFDocument';
import { fetchPDFData } from '@/lib/services/pdfDataService';
import { captureCharts, cleanupChartImages } from './chartCapture';
import type { PDFGenerateOptions, PDFDataContext, ChartId } from '@/types/pdf';
import { CHART_IDS } from '@/types/pdf';

/**
 * Determine which chart IDs to capture based on selected sections
 */
function getRequiredChartIds(sections: PDFGenerateOptions['sections']): string[] {
  const ids: string[] = [];

  if (sections.history) {
    ids.push(
      CHART_IDS.NET_WORTH_EVOLUTION,
      CHART_IDS.ASSET_CLASS_EVOLUTION,
      CHART_IDS.LIQUIDITY,
      CHART_IDS.YOY_VARIATION
    );
  }

  return ids;
}

/**
 * Main PDF generation function
 *
 * Orchestrates the entire PDF generation process:
 * 1. Capture charts from DOM
 * 2. Fetch and prepare data
 * 3. Generate PDF
 * 4. Download file
 * 5. Cleanup memory
 *
 * @param options - PDF generation configuration
 * @throws Error if generation fails
 */
export async function generatePDF(options: PDFGenerateOptions): Promise<void> {
  console.log('Starting PDF generation...', options.sections);

  let chartImages: Map<string, any> | null = null;

  try {
    // Step 1: Capture charts from DOM
    const chartIdsToCapture = getRequiredChartIds(options.sections);

    console.log(`Capturing ${chartIdsToCapture.length} charts...`);
    chartImages = await captureCharts(chartIdsToCapture);

    console.log(`Charts captured: ${chartImages.size}/${chartIdsToCapture.length}`);

    // Step 2: Prepare data context
    const context: PDFDataContext = {
      userId: options.userId,
      userName: options.userName,
      generatedAt: new Date(),
      snapshots: options.snapshots,
      assets: options.assets,
      allocationTargets: options.allocationTargets,
    };

    // Step 3: Fetch and prepare section data
    console.log('Fetching PDF data...');
    const data = await fetchPDFData(
      options.userId,
      context,
      options.sections
    );

    console.log('Data fetched successfully');

    // Step 4: Generate PDF
    console.log('Generating PDF document...');
    const blob = await pdf(
      <PDFDocument
        data={data}
        context={context}
        sections={options.sections}
        chartImages={chartImages}
      />
    ).toBlob();

    console.log(`PDF generated: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

    // Step 5: Download file
    const fileName = `portfolio-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`PDF downloaded: ${fileName}`);

    // Step 6: Cleanup
    URL.revokeObjectURL(url);
    cleanupChartImages(chartImages);

    console.log('PDF generation complete!');

  } catch (error) {
    console.error('PDF generation failed:', error);

    // Cleanup on error
    if (chartImages) {
      cleanupChartImages(chartImages);
    }

    throw new Error('Impossibile generare il PDF. Riprova più tardi.');
  }
}

/**
 * Validate PDF generation options
 *
 * @param options - Options to validate
 * @returns true if valid
 * @throws Error with descriptive message if invalid
 */
export function validatePDFOptions(options: PDFGenerateOptions): boolean {
  if (!options.userId || options.userId.trim() === '') {
    throw new Error('User ID is required');
  }

  if (!options.userName || options.userName.trim() === '') {
    throw new Error('User name is required');
  }

  // Check if at least one section is selected
  const selectedSections = Object.values(options.sections).filter(Boolean);
  if (selectedSections.length === 0) {
    throw new Error('Seleziona almeno una sezione da includere nel PDF');
  }

  // Validate assets array (required for portfolio/allocation)
  if (options.sections.portfolio || options.sections.allocation) {
    if (!Array.isArray(options.assets)) {
      throw new Error('Assets array is required for selected sections');
    }
  }

  // Validate snapshots array (required for history)
  if (options.sections.history) {
    if (!Array.isArray(options.snapshots)) {
      throw new Error('Snapshots array is required for history section');
    }
  }

  return true;
}
