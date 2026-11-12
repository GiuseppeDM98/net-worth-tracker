/**
 * The Consulente's path as a value (2026-10-20): the answers being typed, which screen is
 * open, which goal of the goals screen. A `useReducer` reducer with no React in it, so every
 * transition — next, back, add a goal, the goals screen that walks one goal per screen and
 * then asks what is missing — is unit-tested.
 *
 * The screens are `ALLOCATION_ADVICE_STEPS`; the goals screen has sub-screens: one per goal
 * (index 0..n−1) and a last one (index n) that asks whether the goals reflect reality and what
 * is missing. `next` on the last goal sub-screen leaves the goals screen.
 *
 * After the summary the interview (2026-11-08): `phase` says whether the summary or the
 * interview scene is open, `interview` holds the rounds with their answers, written in place
 * (`interviewReducer`), so the same localStorage effect persists them across a reload.
 */

import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { ALLOCATION_ADVICE_STEPS, type AllocationAdviceDocument, type AllocationAdviceInterview, type AllocationAdviceStep } from '@/types/allocationAdvice';
import { interviewSchema, type AllocationAdviceAnswers, type AnswerGoal } from '@/lib/utils/allocationAdviceProposal';
import { interviewReducer, type InterviewAction } from '@/lib/utils/allocationAdviceInterview';
import { resolveAllocationRoleWithin } from '@/lib/utils/allocationUtils';

export type AllocationAdviceDraftPhase = 'path' | 'interview';

export interface AllocationAdviceDraft {
  step: number;
  /** Only read on the goals screen: 0..goals.length (the last is «cosa manca»). */
  goalIndex: number;
  answers: AllocationAdviceAnswers;
  /** The summary's screens, or the interview scene after it (2026-11-08). */
  phase: AllocationAdviceDraftPhase;
  /** The rounds asked so far with their answers; absent before the first «Avvia il colloquio». */
  interview?: AllocationAdviceInterview;
}

export type AllocationAdviceDraftAction =
  | { type: 'patch'; patch: Partial<AllocationAdviceAnswers> }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goto'; step: number }
  | { type: 'addGoal' }
  | { type: 'updateGoal'; index: number; patch: Partial<AnswerGoal> }
  | { type: 'removeGoal'; index: number }
  | { type: 'reset'; draft: AllocationAdviceDraft }
  /** `'interview'` opens the scene and makes sure an interview exists (the rounds kept, `skipped` cleared). */
  | { type: 'phase'; phase: AllocationAdviceDraftPhase }
  | { type: 'interview'; action: InterviewAction };

export const DEFAULT_EXCHANGE = 'Borsa Italiana (Milano, XMIL)';

export function stepOf(draft: AllocationAdviceDraft): AllocationAdviceStep {
  return ALLOCATION_ADVICE_STEPS[draft.step];
}

export function isLastStep(draft: AllocationAdviceDraft): boolean {
  return draft.step === ALLOCATION_ADVICE_STEPS.length - 1;
}

/** A new goal, empty, to be typed on its own screen. */
export function emptyAnswerGoal(): AnswerGoal {
  return { goalId: null, name: '', targetAmount: null, targetDateIso: null, priority: 'media', keep: true, note: '' };
}

/** The role the path starts from for a family of assets: the role they have today, `fallback` when none is held. */
function roleOf(assets: readonly Asset[], matches: (asset: Asset) => boolean, fallback: 'frozen' | 'excluded'): 'frozen' | 'excluded' {
  const first = assets.find(matches);
  if (!first) return fallback;
  const role = resolveAllocationRoleWithin(first, assets);
  return role === 'excluded' ? 'excluded' : 'frozen';
}

/**
 * The answers prefilled from what the app already knows: the age of the settings, the goals of
 * FIRE › Obiettivi, the roles the assets carry today. Everything else starts at its default.
 */
export function initialAnswers(
  settings: AssetAllocationSettings | null,
  goalData: GoalBasedInvestingData | null,
  assets: readonly Asset[]
): AllocationAdviceAnswers {
  return {
    age: settings?.userAge ?? null,
    horizonYears: null,
    lossTolerance: 'media',
    exchange: DEFAULT_EXCHANGE,
    broker: '',
    distributionPolicy: 'accumulazione',
    goals: (goalData?.goals ?? []).map((goal) => ({
      goalId: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount ?? null,
      targetDateIso: goal.targetDate ?? null,
      priority: goal.priority,
      keep: true,
      note: '',
    })),
    goalsReflectReality: true,
    newGoalsNote: '',
    homeRole: roleOf(assets, (asset) => asset.isPrimaryResidence === true, 'excluded'),
    pensionRole: roleOf(assets, (asset) => asset.type === 'pensionFund', 'frozen'),
    privateEquityRole: roleOf(assets, (asset) => asset.isLiquid === false && asset.type !== 'pensionFund' && asset.type !== 'loan' && asset.type !== 'realestate', 'frozen'),
    keepAssets: [],
    avoid: '',
    esg: false,
    notes: '',
  };
}

/** The answers only: a document's interview never enters a draft (2026-11-08: «Rifai il percorso» never prefills rounds a run already used). */
export function initialDraft(answers: AllocationAdviceAnswers): AllocationAdviceDraft {
  return { step: 0, goalIndex: 0, answers, phase: 'path' };
}

/**
 * A draft that comes back — from this browser, or from the last report's answers on «Rifai il
 * percorso» — carries the goals it had when it was written. FIRE › Obiettivi may have moved since
 * (the owner's run, 2026-10-20: the report's answers had ZERO goals, taken before the goal document
 * existed, and the goals screen read «Nessun obiettivo registrato»). So, on open: a goal the document
 * has and the draft does not is added as on a fresh start; a draft goal whose id the document no
 * longer has is dropped; the goals the draft already has keep what the user typed (its answers, not
 * the document's, are the point of a draft); a goal typed as new (no id) stays. The index is clamped.
 */
export function reconcileDraftGoals(draft: AllocationAdviceDraft, goalData: GoalBasedInvestingData | null): AllocationAdviceDraft {
  const fresh = initialAnswers(null, goalData, []).goals;
  const knownIds = new Set(fresh.map((goal) => goal.goalId));
  const kept = draft.answers.goals.filter((goal) => goal.goalId === null || knownIds.has(goal.goalId));
  const keptIds = new Set(kept.map((goal) => goal.goalId));
  const added = fresh.filter((goal) => !keptIds.has(goal.goalId));
  const goals = [...kept, ...added];
  const unchanged = added.length === 0 && kept.length === draft.answers.goals.length;
  if (unchanged) return draft;
  return { ...draft, goalIndex: Math.min(draft.goalIndex, goals.length), answers: { ...draft.answers, goals } };
}

export function allocationAdviceDraftReducer(draft: AllocationAdviceDraft, action: AllocationAdviceDraftAction): AllocationAdviceDraft {
  switch (action.type) {
    case 'patch':
      return { ...draft, answers: { ...draft.answers, ...action.patch } };
    case 'next': {
      if (stepOf(draft) === 'obiettivi' && draft.goalIndex < draft.answers.goals.length) {
        return { ...draft, goalIndex: draft.goalIndex + 1 };
      }
      if (isLastStep(draft)) return draft;
      const step = draft.step + 1;
      return { ...draft, step, goalIndex: ALLOCATION_ADVICE_STEPS[step] === 'obiettivi' ? 0 : draft.goalIndex };
    }
    case 'back': {
      if (stepOf(draft) === 'obiettivi' && draft.goalIndex > 0) {
        return { ...draft, goalIndex: draft.goalIndex - 1 };
      }
      if (draft.step === 0) return draft;
      const step = draft.step - 1;
      // Going back INTO the goals screen lands on its last sub-screen, the one just left.
      return { ...draft, step, goalIndex: ALLOCATION_ADVICE_STEPS[step] === 'obiettivi' ? draft.answers.goals.length : draft.goalIndex };
    }
    case 'goto':
      return { ...draft, step: Math.max(0, Math.min(ALLOCATION_ADVICE_STEPS.length - 1, action.step)), goalIndex: 0 };
    case 'addGoal': {
      const goals = [...draft.answers.goals, emptyAnswerGoal()];
      // The new goal's screen opens at once.
      return { ...draft, answers: { ...draft.answers, goals }, goalIndex: goals.length - 1 };
    }
    case 'updateGoal': {
      const goals = draft.answers.goals.map((goal, index) => (index === action.index ? { ...goal, ...action.patch } : goal));
      return { ...draft, answers: { ...draft.answers, goals } };
    }
    case 'removeGoal': {
      const goals = draft.answers.goals.filter((_, index) => index !== action.index);
      return { ...draft, answers: { ...draft.answers, goals }, goalIndex: Math.min(draft.goalIndex, goals.length) };
    }
    case 'reset':
      return action.draft;
    case 'phase':
      if (action.phase === 'interview') return { ...draft, phase: 'interview', interview: { rounds: draft.interview?.rounds ?? [], skipped: false } };
      return { ...draft, phase: 'path' };
    case 'interview':
      return { ...draft, interview: interviewReducer(draft.interview ?? { rounds: [], skipped: false }, action.action) };
    default:
      return draft;
  }
}

/** Why the current screen cannot advance yet, or null when it can. */
export function describeStepBlock(draft: AllocationAdviceDraft): string | null {
  const step = stepOf(draft);
  const { answers } = draft;
  if (step === 'profilo') {
    if (answers.age === null) return "Scrivi la tua età: senza, l'orizzonte non si legge.";
    if (answers.horizonYears === null) return 'Scrivi per quanti anni investi.';
  }
  if (step === 'borsa' && answers.exchange.trim() === '') return 'Scegli la borsa di riferimento.';
  if (step === 'obiettivi' && draft.goalIndex < answers.goals.length) {
    const goal = answers.goals[draft.goalIndex];
    if (goal.name.trim() === '') return "Dai un nome all'obiettivo, o rimuovilo.";
  }
  return null;
}

/** The ids of the existing goals the user marked «da eliminare»: the proposal drops them and «Applica» removes them. */
export function removedGoalIds(answers: AllocationAdviceAnswers): string[] {
  return answers.goals.filter((goal) => goal.goalId !== null && !goal.keep).map((goal) => goal.goalId as string);
}

// ─── localStorage draft ───────────────────────────────────────────────────────

export function draftStorageKey(ownerId: string): string {
  return `allocation-advice-draft:${ownerId}`;
}

/**
 * The draft stored on this browser, or null; a stored draft from another shape is ignored. The
 * interview (2026-11-08) is validated with `interviewSchema` — `askedAt` back to a Date — and a
 * failing value is dropped, the rest of the draft kept; `phase: 'interview'` is kept only with at
 * least one valid round, so a draft stored before 2026-11-08 reads `phase: 'path'` and no interview.
 */
export function readStoredDraft(storage: Pick<Storage, 'getItem'> | null, ownerId: string): AllocationAdviceDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftStorageKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AllocationAdviceDraft>;
    if (typeof parsed.step !== 'number' || typeof parsed.goalIndex !== 'number' || !parsed.answers || typeof parsed.answers !== 'object') return null;
    const interview = parsed.interview === undefined ? null : interviewSchema.safeParse(parsed.interview);
    const rounds = interview?.success ? interview.data : null;
    return {
      step: Math.max(0, Math.min(ALLOCATION_ADVICE_STEPS.length - 1, parsed.step)),
      goalIndex: parsed.goalIndex,
      answers: parsed.answers as AllocationAdviceAnswers,
      phase: parsed.phase === 'interview' && rounds !== null && rounds.rounds.length > 0 ? 'interview' : 'path',
      ...(rounds ? { interview: rounds } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The stored draft as the Wizard reopens it over the last document (2026-11-08):
 * «Rifai il percorso» never prefills an interview a run already used, so the stored interview is
 * dropped — and the phase set back to the summary — unless its last round was asked AFTER the
 * document's `updatedAt` (a path redone over the report and reloaded mid-interview, whose rounds
 * stay). With no document the draft is kept as it is; an interview with zero rounds is dropped.
 */
export function reopenStoredDraft(draft: AllocationAdviceDraft | null, lastDocument: AllocationAdviceDocument | null): AllocationAdviceDraft | null {
  if (!draft) return null;
  const rounds = draft.interview?.rounds ?? [];
  if (rounds.length === 0) {
    if (draft.interview === undefined && draft.phase === 'path') return draft;
    return withoutInterview(draft);
  }
  if (!lastDocument) return draft;
  const lastAsked = rounds[rounds.length - 1].askedAt.getTime();
  if (lastAsked > lastDocument.updatedAt.getTime()) return draft;
  return withoutInterview(draft);
}

/** The draft back on the summary, its interview gone. */
function withoutInterview(draft: AllocationAdviceDraft): AllocationAdviceDraft {
  const next: AllocationAdviceDraft = { ...draft, phase: 'path' };
  delete next.interview;
  return next;
}

export function writeStoredDraft(storage: Pick<Storage, 'setItem'> | null, ownerId: string, draft: AllocationAdviceDraft): void {
  if (!storage) return;
  try {
    storage.setItem(draftStorageKey(ownerId), JSON.stringify(draft));
  } catch {
    // A full or blocked storage loses the convenience, never the path.
  }
}

export function clearStoredDraft(storage: Pick<Storage, 'removeItem'> | null, ownerId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(draftStorageKey(ownerId));
  } catch {
    // Same as above.
  }
}
