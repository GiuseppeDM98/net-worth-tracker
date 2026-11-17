/**
 * What the Accumulo tab's tiles share: the injected plan dependencies, the 44px-on-touch button
 * classes (AGENTS.md → Accessibility) and the small box the draft and done states print figures in.
 */
import { calculateAssetValue } from '@/lib/services/assetService';
import { unitPriceEur, type PlanDeps } from '@/lib/utils/accumulationPlanUtils';
import type { LineUiState } from '@/lib/utils/accumulationPlanMatching';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

export const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };

/** Every button of a tile: 44px on touch, the dense 32px from `desktop:`. */
export const TILE_ACTION_CLASS = 'h-11 text-[12px] desktop:h-8';
/** A row's action: the same floor, a tighter label. */
export const ROW_ACTION_CLASS = 'h-11 shrink-0 px-3 text-[12px] desktop:h-8 desktop:px-2 desktop:text-[11px]';
/** Undoing a closed line («Scollega», «Segna da rifare») is rare and asks nothing of the reader:
 *  a ghost, so a column of seven executed lines does not read as seven calls to action. The negative
 *  right margin lines the ghost's LABEL up with the state above it. */
export const ROW_UNDO_CLASS = `${ROW_ACTION_CLASS} -mr-3 text-muted-foreground desktop:-mr-2`;

/** A dismissed `toConfirm` match falls back to what its raw state would be without a match — the
 *  dismissal is never written, so it only affects THIS render. */
export function effectiveLineState(rawState: LineUiState, key: string, ignored: Set<string>, isLate: boolean): LineUiState {
  if (rawState === 'toConfirm' && ignored.has(key)) return isLate ? 'late' : 'todo';
  return rawState;
}

export function DraftBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

const CHIP_BASE = 'shrink-0 whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-[10.5px]';
const CHIP_TONE: Partial<Record<LineUiState, string>> = {
  executed: 'bg-accent text-accent-foreground',
  toConfirm: 'border border-warning-border bg-warning text-warning-foreground',
  late: 'border border-warning-border bg-warning text-warning-foreground',
};

/** A line's state as the render draws it: a pill, filled for done, amber for what asks the reader. */
export function LineStateChip({ state, label }: { state: LineUiState; label: string }) {
  return <span className={`${CHIP_BASE} ${CHIP_TONE[state] ?? 'bg-muted text-muted-foreground'}`}>{label}</span>;
}
