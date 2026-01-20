// components/pdf/PDFDocument.tsx
// Main PDF document orchestrator

import { Document } from '@react-pdf/renderer';
import { CoverSection } from './sections/CoverSection';
import { PortfolioSection } from './sections/PortfolioSection';
import { AllocationSection } from './sections/AllocationSection';
import { HistorySection } from './sections/HistorySection';
import { CashflowSection } from './sections/CashflowSection';
import { PerformanceSection } from './sections/PerformanceSection';
import { FireSection } from './sections/FireSection';
import { SummarySection } from './sections/SummarySection';
import type { PDFDataContext, PDFSectionData, SectionSelection, ChartImage } from '@/types/pdf';

interface PDFDocumentProps {
  data: PDFSectionData;
  context: PDFDataContext;
  sections: SectionSelection;
  chartImages: Map<string, ChartImage>;
}

/**
 * Main PDF document orchestrator that composes all sections into a single document.
 *
 * Document structure:
 * 1. Cover page (always included, not optional)
 * 2. Portfolio section (asset listing with pagination)
 * 3. Allocation section (asset distribution and rebalancing recommendations)
 * 4. History section (historical performance and year-over-year comparison)
 * 5. Cashflow section (income/expense analysis with financial health indicator)
 * 6. Performance section (portfolio metrics: ROI, CAGR, TWR, Sharpe, Drawdown, YOC)
 * 7. FIRE section (Financial Independence metrics and Trinity Study guidance)
 * 8. Summary section (overview page with all key metrics)
 *
 * Section ordering rationale:
 * - Cover first for professional appearance
 * - Portfolio/Allocation early (core holdings data)
 * - History/Cashflow in middle (analytical sections)
 * - FIRE near end (forward-looking planning)
 * - Summary last (comprehensive overview referencing prior sections)
 *
 * Conditional rendering:
 * Each section (except cover) renders only if:
 * 1. User selected it in PDFExportDialog (sections.sectionName === true)
 * 2. Data is available for that section (data.sectionName !== null/undefined)
 *
 * Document metadata:
 * - Title: Appears in PDF viewer tab/window
 * - Author: User's display name
 * - Subject/Creator/Producer: Portfolio Tracker identification
 *
 * @param data - Prepared data for all sections (from parent component)
 * @param context - Document context (user name, generation timestamp, time filter)
 * @param sections - User selection of which sections to include
 * @param chartImages - Map of pre-captured chart images (base64 PNGs) by chart ID
 */
export function PDFDocument({
  data,
  context,
  sections,
  chartImages,
}: PDFDocumentProps) {
  return (
    <Document
      title="Portfolio Report"
      author={context.userName}
      subject="Comprehensive Portfolio Analysis"
      creator="Portfolio Tracker"
      producer="Portfolio Tracker"
    >
      {/* Cover page - Always rendered first, provides professional title page
          with report type (Total/Yearly/Monthly), generation date, and user name */}
      <CoverSection
        generatedAt={context.generatedAt}
        userName={context.userName}
        timeFilter={context.timeFilter}
      />

      {/* Portfolio section - Asset details with pagination (25 assets per page) */}
      {sections.portfolio && data.portfolio && (
        <PortfolioSection data={data.portfolio} />
      )}

      {/* Allocation section - Current vs target allocation with rebalancing actions */}
      {sections.allocation && data.allocation && (
        <AllocationSection data={data.allocation} />
      )}

      {/* History section - Multi-page: net worth evolution and YoY comparison */}
      {sections.history && data.history && (
        <HistorySection data={data.history} chartImages={chartImages} />
      )}

      {/* Cashflow section - Income/expense metrics with financial health indicator */}
      {sections.cashflow && data.cashflow && (
        <CashflowSection data={data.cashflow} />
      )}

      {/* Performance section - Portfolio performance metrics (ROI, CAGR, TWR, IRR, Sharpe, Drawdown, YOC) */}
      {sections.performance && data.performance && (
        <PerformanceSection data={data.performance} />
      )}

      {/* FIRE section - Financial Independence metrics with Trinity Study reference */}
      {sections.fire && data.fire && (
        <FireSection data={data.fire} />
      )}

      {/* Summary section - Overview page aggregating all key metrics */}
      {sections.summary && data.summary && (
        <SummarySection data={data.summary} />
      )}
    </Document>
  );
}
