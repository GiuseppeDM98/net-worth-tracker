import type { OverviewVerdict as OverviewVerdictModel } from '@/lib/utils/overviewNarrative';
import { PageVerdict } from '@/components/ui/page-verdict';

interface OverviewVerdictProps {
  verdict: OverviewVerdictModel;
}

/** The Panoramica's verdict — `PageVerdict` (components/ui) named after its question. */
export function OverviewVerdict({ verdict }: OverviewVerdictProps) {
  return <PageVerdict verdict={verdict} ariaLabel="Verdetto del mese" />;
}
