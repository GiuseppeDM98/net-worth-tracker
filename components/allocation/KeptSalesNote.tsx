/**
 * The plan editor's warning when a month-1 sale touches an instrument the Consulente proposed to keep
 * (owner, 2026-11-12): only the hand-off passes the kept ids, so everywhere else it renders nothing.
 */
import type { PlanDisposal } from '@/types/accumulationPlan';
import { findKeptSales } from '@/lib/utils/allocationAdviceHandoff';
import { describeKeptSales } from '@/lib/utils/accumulationNarrative';

interface KeptSalesNoteProps {
  disposals: readonly PlanDisposal[];
  keepAssetIds: readonly string[];
  nameOf: (assetId: string) => string;
}

export function KeptSalesNote({ disposals, keepAssetIds, nameOf }: KeptSalesNoteProps) {
  const kept = findKeptSales(disposals, keepAssetIds);
  if (kept.length === 0) return null;
  return <p role="status" className="text-[12px] text-warning-foreground">{describeKeptSales(kept.map((d) => nameOf(d.assetId)))}</p>;
}
