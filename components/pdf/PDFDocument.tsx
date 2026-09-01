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
import type { PDFDataContext, PDFSectionData, SectionSelection } from '@/types/pdf';
import { buildReportVerdict, reportScopeLabel, PDF_SECTION_TITLES, type PdfSectionKey } from '@/lib/utils/pdfNarrative';

interface PDFDocumentProps {
  data: PDFSectionData;
  context: PDFDataContext;
  sections: SectionSelection;
}

/** The order the sections are printed in, and the only place it is declared. */
const SECTION_ORDER: PdfSectionKey[] = [
  'portfolio', 'allocation', 'history', 'cashflow', 'performance', 'fire', 'summary',
];

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
 * - Title: appears in the PDF viewer's tab — the product and the window it covers
 * - Author: the account holder's display name
 * - Subject/Creator/Producer: Net Worth Tracker
 *
 * @param data - Prepared data for all sections (from parent component)
 * @param context - Document context (user name, generation timestamp, time filter)
 * @param sections - User selection of which sections to include
 */
export function PDFDocument({
  data,
  context,
  sections,
}: PDFDocumentProps) {
  // The cover's verdict is built here, from whatever sections were actually selected: it names
  // a growth only when the Storico section is in the report to supply one.
  const verdict = buildReportVerdict({
    portfolio: data.portfolio,
    history: data.history,
    summary: data.summary,
    timeFilter: context.timeFilter,
  });
  const includedTitles = SECTION_ORDER.filter((key) => sections[key] && data[key]).map(
    (key) => PDF_SECTION_TITLES[key],
  );
  const reportScope = reportScopeLabel(
    context.timeFilter,
    context.selectedYear,
    context.selectedMonth,
    context.generatedAt,
  );

  return (
    <Document
      title={`Net Worth Tracker — ${reportScope}`}
      author={context.userName}
      subject={reportScope}
      creator="Net Worth Tracker"
      producer="Net Worth Tracker"
    >
      {/* Page 1 — the report's verdict, not a frontispiece */}
      <CoverSection
        generatedAt={context.generatedAt}
        userName={context.userName}
        verdict={verdict}
        sectionTitles={includedTitles}
        timeFilter={context.timeFilter}
        selectedYear={context.selectedYear}
        selectedMonth={context.selectedMonth}
      />

      {/* Portfolio section - Asset details with pagination (25 assets per page) */}
      {sections.portfolio && data.portfolio && (
        <PortfolioSection data={data.portfolio} reportScope={reportScope} />
      )}

      {/* Allocation section - Current vs target allocation with rebalancing actions */}
      {sections.allocation && data.allocation && (
        <AllocationSection data={data.allocation} reportScope={reportScope} />
      )}

      {/* History section - Multi-page: net worth evolution and YoY comparison */}
      {sections.history && data.history && (
        <HistorySection data={data.history} reportScope={reportScope} />
      )}

      {/* Cashflow section - Income/expense metrics with financial health indicator */}
      {sections.cashflow && data.cashflow && (
        <CashflowSection data={data.cashflow} reportScope={reportScope} />
      )}

      {/* Performance section - Portfolio performance metrics (ROI, CAGR, TWR, IRR, Sharpe, Drawdown, YOC) */}
      {sections.performance && data.performance && (
        <PerformanceSection data={data.performance} reportScope={reportScope} />
      )}

      {/* FIRE section - Financial Independence metrics with Trinity Study reference */}
      {sections.fire && data.fire && (
        <FireSection data={data.fire} reportScope={reportScope} />
      )}

      {/* Summary section - Overview page aggregating all key metrics */}
      {sections.summary && data.summary && (
        <SummarySection data={data.summary} reportScope={reportScope} />
      )}
    </Document>
  );
}
