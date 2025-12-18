// components/pdf/PDFDocument.tsx
// Main PDF document orchestrator

import { Document } from '@react-pdf/renderer';
import { CoverSection } from './sections/CoverSection';
import { PortfolioSection } from './sections/PortfolioSection';
import { AllocationSection } from './sections/AllocationSection';
import { HistorySection } from './sections/HistorySection';
import { CashflowSection } from './sections/CashflowSection';
import { FireSection } from './sections/FireSection';
import { SummarySection } from './sections/SummarySection';
import type { PDFDataContext, PDFSectionData, SectionSelection, ChartImage } from '@/types/pdf';

interface PDFDocumentProps {
  data: PDFSectionData;
  context: PDFDataContext;
  sections: SectionSelection;
  chartImages: Map<string, ChartImage>;
}

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
      {/* Cover page - always present */}
      <CoverSection
        generatedAt={context.generatedAt}
        userName={context.userName}
        timeFilter={context.timeFilter}
      />

      {/* Portfolio section */}
      {sections.portfolio && data.portfolio && (
        <PortfolioSection data={data.portfolio} />
      )}

      {/* Allocation section */}
      {sections.allocation && data.allocation && (
        <AllocationSection data={data.allocation} />
      )}

      {/* History section */}
      {sections.history && data.history && (
        <HistorySection data={data.history} chartImages={chartImages} />
      )}

      {/* Cashflow section */}
      {sections.cashflow && data.cashflow && (
        <CashflowSection data={data.cashflow} />
      )}

      {/* FIRE section */}
      {sections.fire && data.fire && (
        <FireSection data={data.fire} />
      )}

      {/* Summary section */}
      {sections.summary && data.summary && (
        <SummarySection data={data.summary} />
      )}
    </Document>
  );
}
