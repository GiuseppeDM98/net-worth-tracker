/**
 * The «Consulente» of the Allocazione page (2026-10-20): a guided path — one question per
 * screen — then an interview of up to three rounds of questions (2026-11-08) — whose answers, with
 * the whole portfolio, go to two agents (Opus 5.5 for the interview, the strategy
 * and the review, Sonnet 5.5 with web search for the instruments); the result is a report, a
 * proposal the user can apply to Impostazioni → Allocazione with one button, and a date to
 * review it by. The document lives in `allocationAdvice/{userId}`, written by the Admin SDK
 * (the run) and read by the client; «Applica» writes the settings, the roles and the goals
 * through their own paths and then marks the document applied through its route.
 *
 * The proposal's JSON shape is the zod schema of `lib/utils/allocationAdviceProposal.ts`; the
 * types here are inferred from it so the two can never drift.
 */

import type {
  AllocationAdviceAnswers,
  AllocationAdviceInterview,
  AllocationAdviceInterviewRound,
  AllocationAdviceProposal,
  InstrumentCandidates,
} from '@/lib/utils/allocationAdviceProposal';

export type { AllocationAdviceAnswers, AllocationAdviceInterview, AllocationAdviceInterviewRound, AllocationAdviceProposal, InstrumentCandidates };

/**
 * The interview's cap (2026-11-08, decision 6 of the AI series): three rounds of questions after
 * the summary, then the strategy. Here and not in `run.ts`: the schema, the pure interview module
 * and the Wizard read it, and `run.ts` is `server-only`.
 */
export const ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS = 3;

/**
 * How many previous paths the interview and the strategy read (2026-11-08, the owner's addition
 * after the interview's phase F on the mirror): the live document when it has a report, then the archive
 * `allocationAdvice/{uid}/history`, the most recent first. Six is about three years of paths at
 * the review dates the Consulente proposes; the older ones stay archived, unread.
 */
export const ALLOCATION_ADVICE_HISTORY_LIMIT = 6;

/** The path's screens, in order. The index is the reducer's `step`. */
export const ALLOCATION_ADVICE_STEPS = [
  'profilo',
  'tolleranza',
  'borsa',
  'politica',
  'obiettivi',
  'ruoli',
  'vincoli',
  'riepilogo',
] as const;

export type AllocationAdviceStep = (typeof ALLOCATION_ADVICE_STEPS)[number];

/** Where a run is, in order; `ready` and `failed` are terminal, `applied` follows `ready`. */
export type AllocationAdviceStatus = 'draft' | 'running' | 'ready' | 'failed' | 'applied';

export type AllocationAdviceStage = 'context' | 'strategy' | 'instruments' | 'review';

export const ALLOCATION_ADVICE_STAGES: readonly AllocationAdviceStage[] = ['context', 'strategy', 'instruments', 'review'];

/**
 * The three REQUESTS a run is made of, one model call each (2026-10-20): Vercel's Hobby plan
 * stops a function at 300 s and the whole run takes six to seven minutes, so the client chains
 * one request per stage and a failed stage is retried from itself. «context» runs inside the first.
 */
export type AllocationAdviceRunStage = 'strategy' | 'instruments' | 'review' | 'revise';
/** The chain «Avvia la ricerca» runs; `revise` is the one request «Chiedi una modifica» sends on a finished report. */
export const ALLOCATION_ADVICE_RUN_STAGES: readonly AllocationAdviceRunStage[] = ['strategy', 'instruments', 'review'];

/** One agent's answer: the prose it wrote and the structure parsed out of it (null when it got the block wrong). */
export interface AllocationAdviceStrategy {
  markdown: string;
  proposal: AllocationAdviceProposal | null;
  model: string;
  finishedAt: Date;
}

export interface AllocationAdviceInstruments {
  markdown: string;
  candidates: InstrumentCandidates | null;
  model: string;
  webSearchUsed: boolean;
  finishedAt: Date;
}

export interface AllocationAdviceReport {
  markdown: string;
  /** The reviewed proposal; falls back to the strategy's when the review's block is malformed. */
  proposal: AllocationAdviceProposal | null;
  model: string;
  finishedAt: Date;
}

/**
 * What a NEW run is told about the plan in force (2026-10-20, owner: «il report nuovo tiene conto
 * delle scelte e dei motivi fatti in passato?»): the last report, its requests, when it was
 * applied and when it asked to be reviewed. Built from the previous document before the new one
 * replaces it (`priorPlanOf`), given to the strategy only.
 */
export interface AllocationAdvicePriorPlan {
  reportMarkdown: string;
  revisions: string[];
  finishedAt: Date;
  appliedAt: Date | null;
  reviewByIso: string | null;
  reviewReason: string | null;
}

/** A change the user asked for on the finished report; the review was run again with it (2026-10-20). */
export interface AllocationAdviceRevision {
  request: string;
  at: Date;
}

export interface AllocationAdviceApplied {
  at: Date;
  targetsWritten: boolean;
  rolesChanged: number;
  goalsWritten: number;
}

export interface AllocationAdviceDocument {
  userId: string;
  status: AllocationAdviceStatus;
  answers: AllocationAdviceAnswers;
  /** The stage a run is in, or the last one it reached. */
  stage: AllocationAdviceStage | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  strategy: AllocationAdviceStrategy | null;
  instruments: AllocationAdviceInstruments | null;
  report: AllocationAdviceReport | null;
  /** The product's sentence for a failed run, never the SDK's. */
  error: string | null;
  applied: AllocationAdviceApplied | null;
  /** The requests «Chiedi una modifica» sent, in order; the report is the last revision's. The mapper always sets it. */
  revisions?: AllocationAdviceRevision[];
  /** The path's interview, from the strategy's body (2026-11-08); null when absent (older documents, an older client). */
  interview: AllocationAdviceInterview | null;
  /** The round asked before the last «Chiedi una modifica», from the revise's body. */
  revisionInterview?: AllocationAdviceInterview | null;
}

/**
 * The paths before this one, as the interview and the strategy read them (2026-11-08): the
 * documents, the most recent first, and whether the archive could be read — a failed read never
 * fails a path, the block says it instead.
 */
export interface AllocationAdvicePreviousPaths {
  paths: AllocationAdviceDocument[];
  archiveRead: boolean;
}

/**
 * The SSE events of `POST /api/allocation-advice/run`. An `interview` request streams exactly one
 * terminal event: `interview` (its round, `askedAt` an ISO string on the wire) or `error`; never `done`.
 */
export type AllocationAdviceRunEvent =
  | { type: 'stage'; stage: AllocationAdviceStage }
  | { type: 'interview'; round: Omit<AllocationAdviceInterviewRound, 'answers'> }
  | { type: 'done'; document: AllocationAdviceDocument }
  | { type: 'error'; error: string; retryable?: boolean };
