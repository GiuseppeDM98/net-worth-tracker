/**
 * The Consulente's document as it comes out of Firestore, mapped ONCE for both SDKs
 * (2026-10-20): the Admin store (`lib/server/allocationAdvice/store.ts`) and the client reader
 * (`lib/services/allocationAdviceService.ts`) read the same fields and convert the same dates,
 * so a field the run writes can never be read differently by the page. Pure: `toDate` handles
 * both SDKs' Timestamps.
 */

import { toDate } from '@/lib/utils/dateHelpers';
import type { AllocationAdviceAnswers } from '@/lib/utils/allocationAdviceProposal';
import { ALLOCATION_ADVICE_STAGES, type AllocationAdviceDocument, type AllocationAdvicePriorPlan, type AllocationAdviceRunStage, type AllocationAdviceStage } from '@/types/allocationAdvice';

type Data = Record<string, unknown>;

function dateOrNull(value: unknown): Date | null {
  return value ? toDate(value as Date) : null;
}

function withFinishedAt<T extends { finishedAt: unknown }>(value: unknown): (Omit<T, 'finishedAt'> & { finishedAt: Date }) | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as T;
  return { ...record, finishedAt: toDate(record.finishedAt as Date) };
}

/** How long a `running` document is believed before the page offers to start again. */
export const RUN_STALE_AFTER_MS = 20 * 60 * 1000;

export function isRunStale(document: AllocationAdviceDocument, now: number): boolean {
  return document.status === 'running' && (document.startedAt === null || now - document.startedAt.getTime() > RUN_STALE_AFTER_MS);
}

/**
 * Whether the page shows the report (or its «in corso» / failed view) instead of the screens.
 * A run started on THIS page keeps its own screen until it ends (`runActive`): the first
 * production run of 2026-10-20 flipped to the report's «in corso» view after the first stage,
 * because the document became `running` and the query reread it — the stages lost their
 * spinner and «Ricomincia il percorso» appeared mid-run. «Rifai il percorso» (`redoAt`) hides the
 * document it was pressed on; a newer one shows again.
 */
export function pageShowsReport(args: { document: AllocationAdviceDocument | null; redoAt: number | null; openedAt: number; runActive: boolean }): boolean {
  const { document, redoAt, openedAt, runActive } = args;
  if (document === null || runActive) return false;
  const visible = document.status === 'ready' || document.status === 'applied' || document.status === 'failed' || (document.status === 'running' && !isRunStale(document, openedAt));
  return visible && (redoAt === null || redoAt !== document.updatedAt.getTime());
}

// ─── The run's stage rows (AI-03, 2026-11-07) ─────────────────────────────────

export type StageRowState = 'done' | 'active' | 'pending' | 'failed';

/** The display stage of a run request: `revise` re-enters the review. */
export function stageOfRunStage(stage: AllocationAdviceRunStage): AllocationAdviceStage {
  return stage === 'revise' ? 'review' : stage;
}

/**
 * Each of the four stages with its state: `running` lights `stage` and marks the ones before it
 * done (`null`: all pending, the run is opening); `failed` marks `stage` failed; `done` marks all
 * done. ONE reading for the run's screen, the rail and the report's «in corso» view.
 */
export function runStageStates(at: { status: 'running' | 'failed' | 'done'; stage: AllocationAdviceStage | null }): { stage: AllocationAdviceStage; state: StageRowState }[] {
  const reached = at.status === 'done' ? ALLOCATION_ADVICE_STAGES.length : at.stage === null ? -1 : ALLOCATION_ADVICE_STAGES.indexOf(at.stage);
  return ALLOCATION_ADVICE_STAGES.map((stage, index) => ({
    stage,
    state: index < reached ? 'done' : index === reached ? (at.status === 'failed' ? 'failed' : 'active') : 'pending',
  }));
}

/** The plan in force a new run must read, or null when the last document has no finished report. */
export function priorPlanOf(document: AllocationAdviceDocument | null | undefined): AllocationAdvicePriorPlan | null {
  if (!document?.report) return null;
  return {
    reportMarkdown: document.report.markdown,
    revisions: (document.revisions ?? []).map((row) => row.request),
    finishedAt: document.report.finishedAt,
    appliedAt: document.applied?.at ?? null,
    reviewByIso: document.report.proposal?.reviewByIso ?? null,
    reviewReason: document.report.proposal?.reviewReason ?? null,
  };
}

export function mapAllocationAdviceData(userId: string, data: Data): AllocationAdviceDocument {
  const applied = data.applied as Data | null | undefined;
  return {
    userId,
    status: data.status as AllocationAdviceDocument['status'],
    answers: data.answers as AllocationAdviceAnswers,
    stage: (data.stage as AllocationAdviceDocument['stage']) ?? null,
    createdAt: toDate(data.createdAt as Date),
    updatedAt: toDate(data.updatedAt as Date),
    startedAt: dateOrNull(data.startedAt),
    strategy: withFinishedAt<NonNullable<AllocationAdviceDocument['strategy']>>(data.strategy),
    instruments: withFinishedAt<NonNullable<AllocationAdviceDocument['instruments']>>(data.instruments),
    report: withFinishedAt<NonNullable<AllocationAdviceDocument['report']>>(data.report),
    error: (data.error as string | null | undefined) ?? null,
    applied: applied ? { ...(applied as unknown as NonNullable<AllocationAdviceDocument['applied']>), at: toDate(applied.at as Date) } : null,
    revisions: Array.isArray(data.revisions)
      ? (data.revisions as Data[]).map((row) => ({ request: String(row.request ?? ''), at: toDate(row.at as Date) }))
      : [],
  };
}
