/**
 * «Criteri del modello» — the constants both sides of the app read: the default criteria and the words
 * of Impostazioni's read-only tile, and the key of the liquidity's candidate.
 *
 * Why a module of its own (2026-11-12): Impostazioni shows the criteria read-only, and reading these
 * from `weightOptimizer.ts` (900 lines) or from `weightOptimizerNarrative.ts` (which pulls the plan's
 * words) put the optimizer in the Settings bundle. Both modules re-export what they used to define.
 */
import type { IdealAllocationSettings } from '@/types/assets';

/** The applicative default of the criteria (the type lives in types/assets.ts, as for every other setting). */
export const DEFAULT_IDEAL_ALLOCATION: IdealAllocationSettings = {
  enabled: false,
  classPriority: 'essential',
  leveragePriority: 'high',
  factorObjectives: [],
  instrumentLimits: [],
  groupLimits: [],
};

/** The candidate that stands for the accounts net of the personal loans: never an asset id, never saved. */
export const LIQUIDITY_CANDIDATE_KEY = 'liquidita';

/** Where «Criteri del modello» are edited: the Accumulo tab, which opens the dialog on `obiettivi=1`. */
export const OPTIMIZER_OBJECTIVES_HREF = '/dashboard/allocation?tab=accumulo&obiettivi=1';
export const OBJECTIVES_LINK_FROM_SETTINGS = 'Modifica in Allocazione › Accumulo';
export const OBJECTIVES_SETTINGS_EYEBROW = 'Criteri del modello';
