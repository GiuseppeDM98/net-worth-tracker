import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  ALLOCATION_ADVICE_INSTRUMENTS_EFFORT,
  ALLOCATION_ADVICE_INSTRUMENTS_MODEL,
  ALLOCATION_ADVICE_STRATEGY_EFFORT,
  ALLOCATION_ADVICE_STRATEGY_MODEL,
  SERVER_SIDE_FALLBACK_BETA,
} from '@/lib/constants/aiModels';
import { buildAssistantYtdContext } from '@/lib/services/assistantMonthContextService';
import { readCashflowBlockForPrompt } from '@/lib/server/assistant/cashflowBlockPrompt';
import { formatBundleForPrompt, formatPortfolioForPrompt } from '@/lib/server/assistant/prompts';
import { buildInstrumentsPrompt, buildInterviewPrompt, buildReviewPrompt, buildRevisionPrompt, buildStrategyPrompt } from './prompts';
import { archiveAllocationAdviceAdmin, getAllocationAdviceAdmin, listAllocationAdviceHistoryAdmin, patchAllocationAdviceAdmin, setAllocationAdviceAdmin } from './store';
import {
  ALLOCATION_PROPOSAL_BLOCK,
  INSTRUMENT_CANDIDATES_BLOCK,
  allocationAdviceAnswerSchema,
  interviewRoundSchema,
  parseAllocationAnswer,
  parseInstrumentCandidatesLenient,
  parseInterviewRound,
  stripFencedBlocks,
  type AllocationAdviceAnswers,
} from '@/lib/utils/allocationAdviceProposal';
import {
  ALLOCATION_ADVICE_HISTORY_LIMIT,
  type AllocationAdviceDocument,
  type AllocationAdviceInterview,
  type AllocationAdviceInterviewRound,
  type AllocationAdvicePreviousPaths,
  type AllocationAdvicePriorPlan,
  type AllocationAdviceRunStage,
  type AllocationAdviceStage,
} from '@/types/allocationAdvice';
import { priorPlanOf } from '@/lib/utils/allocationAdviceDocument';
import { bondProfileRequests, formatBondTermsBlock, selectBondHoldings } from '@/lib/utils/allocationAdviceBonds';
import type { AssistantPortfolioContext } from '@/lib/utils/assistantPortfolioContext';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { resolveInstrumentProfiles } from '@/lib/server/exposure/instrumentProfileService';
import type { InstrumentProfile } from '@/types/exposure';

/**
 * The Consulente's run (2026-10-20): the context, then three model calls in series — the
 * strategy on Opus 5.5, the instruments on Sonnet 5.5 with web search, the review on Opus 5.5
 * — each persisted as soon as it lands, so a reload mid-run shows where the run is and a run
 * the platform cut leaves what it had reached. Each call is its OWN request from the client
 * (`runAllocationAdviceStage`): see the note above it.
 *
 * Every call streams and is read to its end: the SDK's HTTP timeout never counts against a
 * 32 000-token answer, and the final message carries the `stop_reason` the surface must read
 * (a `max_tokens` cut or a `refusal` is a failed stage, said in the product's words — never a
 * half proposal parsed as whole). The strategy and the review answer as a structured output
 * (markdown + proposal, `allocationAdviceAnswerSchema`); the instrument search keeps its fenced
 * block, because web search answers with citations and structured outputs refuse them. Both
 * models opt into the server-side fallback (aiModels.ts).
 *
 * The interview (2026-11-08, doc/ai/AI-04-colloquio.md) is a request of its own,
 * `runInterviewRound`: one call on Opus 5.5 that reads the strategy's context and answers a round
 * of questions as a structured output. It never enters `runAllocationAdviceStage` and writes
 * nothing — the rounds live in the browser's draft until the strategy's body carries them.
 */

/** Output budget per call: thinking AND text; a strategy with its block is a few thousand tokens, the rest is reasoning. */
export const ALLOCATION_ADVICE_MAX_TOKENS = 32000;
/** An interview round is a note and at most four questions: half the strategy's budget, most of it reasoning. */
export const ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS = 16000;
/**
 * How many searches the instrument agent may run. Twelve ran out on the owner's thirteen sleeves
 * (2026-10-20: two left unverified «perché il limite di ricerche è finito prima»); the prompt now
 * asks for one search per instrument and the cap leaves room for a second look.
 */
export const ALLOCATION_ADVICE_WEB_SEARCH_MAX_USES = 20;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface RunAllocationAdviceArgs {
  userId: string;
  answers: AllocationAdviceAnswers;
  onStage: (stage: AllocationAdviceStage) => void;
  now?: Date;
}

interface CollectedAnswer {
  text: string;
  stopReason: string | null;
  model: string;
  webSearchUsed: boolean;
}

/** The stage a model call belongs to: the document's four, or the interview, which no document holds. */
type CallStage = AllocationAdviceStage | 'interview';

/** An agent that did not finish: the stage it was in and the product's sentence for it. */
export class AllocationAdviceStageError extends Error {
  stage: CallStage;
  retryable: boolean;

  constructor(stage: CallStage, message: string, retryable = false) {
    super(message);
    this.name = 'AllocationAdviceStageError';
    this.stage = stage;
    this.retryable = retryable;
  }
}

/**
 * How many times a stage resumes a turn the server paused. With web search the server runs its
 * own tool loop and stops it at a cap with `stop_reason: 'pause_turn'`; the turn is resumed by
 * sending the paused answer back as the assistant's message, with no new user text. Before
 * 2026-10-23 a pause failed the stage and «Riprova» redid every search.
 */
export const ALLOCATION_ADVICE_MAX_CONTINUATIONS = 3;

/**
 * The structured answer of the strategy and the review: the wire form of
 * `allocationAdviceAnswerSchema`. Only `type` and `schema` go out: the helper's `parse` would
 * make the SDK throw on a proposal that breaks a sum, where the run keeps the markdown instead.
 */
const ALLOCATION_ANSWER_FORMAT = { type: 'json_schema' as const, schema: betaZodOutputFormat(allocationAdviceAnswerSchema).schema };
/** The interview round's wire form (`interviewRoundSchema`): `note` first, so the model reads before it asks. */
const INTERVIEW_FORMAT = { type: 'json_schema' as const, schema: betaZodOutputFormat(interviewRoundSchema).schema };

/** A stage's answer is usable only when the model finished on its own. */
function assertFinished(stage: CallStage, answer: CollectedAnswer): void {
  if (answer.stopReason === 'end_turn' || answer.stopReason === 'stop_sequence') return;
  if (answer.stopReason === 'refusal') {
    throw new AllocationAdviceStageError(stage, 'Il modello ha rifiutato di rispondere su questi dati. Riprova riformulando le note del percorso.');
  }
  if (answer.stopReason === 'max_tokens') {
    throw new AllocationAdviceStageError(stage, 'La risposta del modello ha superato il limite di lunghezza. Riprova: di norma la seconda corsa rientra.', true);
  }
  throw new AllocationAdviceStageError(stage, 'La risposta del modello si è interrotta prima della fine. Riprova fra qualche istante.', true);
}

interface ModelCall {
  model: string;
  prompt: { system: string; userContent: string };
  effort: 'low' | 'medium' | 'high';
  /** Web search: the instrument stage only — its citations rule out a structured answer. */
  webSearch?: boolean;
  /** The structured answer's wire schema: the strategy, the review and the revision (`ALLOCATION_ANSWER_FORMAT`), the interview (`INTERVIEW_FORMAT`). */
  format?: { type: 'json_schema'; schema: Record<string, unknown> };
  /** The output budget; `ALLOCATION_ADVICE_MAX_TOKENS` when absent. */
  maxTokens?: number;
}

/**
 * One stage's model call, streamed and read to its end by the SDK's accumulator (`finalMessage`):
 * the text, the stop reason, and the model that answered — after a mid-stream fallback the
 * accumulator names the model that finished, not the one that declined. A paused turn is resumed
 * up to `ALLOCATION_ADVICE_MAX_CONTINUATIONS` times, its text kept.
 */
async function callModel(stage: CallStage, call: ModelCall): Promise<CollectedAnswer> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: call.prompt.userContent }];
  const texts: string[] = [];
  let webSearchUsed = false;
  for (let turn = 0; ; turn++) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await anthropic.beta.messages
        .stream({
          model: call.model,
          betas: [SERVER_SIDE_FALLBACK_BETA],
          fallbacks: 'default',
          max_tokens: call.maxTokens ?? ALLOCATION_ADVICE_MAX_TOKENS,
          system: call.prompt.system,
          thinking: { type: 'adaptive' },
          output_config: { effort: call.effort, ...(call.format ? { format: call.format } : {}) },
          ...(call.webSearch
            ? {
                tools: [
                  {
                    type: 'web_search_20260209',
                    name: 'web_search',
                    max_uses: ALLOCATION_ADVICE_WEB_SEARCH_MAX_USES,
                  } satisfies Anthropic.Beta.BetaWebSearchTool20260209,
                ],
              }
            : {}),
          messages: [...messages],
        })
        .finalMessage();
    } catch (error) {
      const type = error instanceof Anthropic.APIError ? error.type : undefined;
      if (type === 'overloaded_error' || (error instanceof Anthropic.APIError && error.status === 429)) {
        throw new AllocationAdviceStageError(stage, 'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche minuto.', true);
      }
      console.error(`[consulente] ${stage} failed`, error);
      throw new AllocationAdviceStageError(stage, 'Il servizio AI non ha risposto. Riprova fra qualche istante.', true);
    }
    for (const block of message.content) {
      if (block.type === 'text') texts.push(block.text);
      if (block.type === 'server_tool_use') webSearchUsed = true;
      if (block.type === 'fallback') console.info(`[consulente] ${block.from.model} declined; ${block.to.model} continued`);
    }
    if (message.stop_reason === 'pause_turn' && turn < ALLOCATION_ADVICE_MAX_CONTINUATIONS) {
      // The paused answer goes back unchanged — thinking, tool and fallback blocks included.
      messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    const answer: CollectedAnswer = { text: texts.join('').trim(), stopReason: message.stop_reason, model: message.model, webSearchUsed };
    assertFinished(stage, answer);
    return answer;
  }
}

// ─── The run, one request per stage ─────────────────────────────────────────────
//
// Vercel's Hobby plan stops a function at 300 s (60 s without Fluid compute), and the owner's
// third run took 396 s in ONE request — the strategy alone 210 s (2026-10-20). So a run is
// three requests, one per model call, each its own function invocation under the ceiling:
// `runAllocationAdviceStage` runs ONE stage on the persisted document and the client chains
// them (`useConsulenteRun`); a failed stage is retried from that stage, never from scratch.
// `runAllocationAdvice` is the three in sequence for a caller with no ceiling (and the tests).

export interface RunAllocationAdviceStageArgs {
  userId: string;
  stage: AllocationAdviceRunStage;
  /** Required by the strategy (it creates the document); the other two read the document's. */
  answers?: AllocationAdviceAnswers;
  /** The document the stage continues; read from the store when absent. */
  document?: AllocationAdviceDocument | null;
  /** «Chiedi una modifica»: what the user asked on the finished report; required by `revise`. */
  request?: string;
  /** The interview (2026-11-08): the path's rounds for the strategy, the revision's round for `revise`; null or absent when none. */
  interview?: AllocationAdviceInterview | null;
  onStage: (stage: AllocationAdviceStage) => void;
  now?: Date;
}

/** The document's stage a request belongs to: a revision is the review again. */
function documentStageOf(stage: AllocationAdviceRunStage): AllocationAdviceStage {
  return stage === 'revise' ? 'review' : stage;
}

/** An agent's text with its fenced block put back, so the next agent reads it as it was answered. */
function withBlock(markdown: string, language: string, block: unknown): string {
  if (block === null || block === undefined) return markdown;
  return `${markdown}\n\n\`\`\`${language}\n${JSON.stringify(block)}\n\`\`\``;
}

/** The strategy's document, the interview's ONLY writer (criterion 6 of AI-04). */
function newDocument(userId: string, answers: AllocationAdviceAnswers, now: Date, interview: AllocationAdviceInterview | null = null): AllocationAdviceDocument {
  return {
    userId,
    status: 'running',
    answers,
    stage: 'context',
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    strategy: null,
    instruments: null,
    report: null,
    error: null,
    applied: null,
    interview,
    revisionInterview: null,
  };
}

/**
 * The OBBLIGAZIONI block (2026-11-08, the owner's addition after AI-04's phase F): the single
 * bonds' maturities from the portfolio context, the bond ETFs' duration and average maturity from
 * the Esposizione's shared profile cache (Yahoo once per ticker, then 30 days) — a read that may
 * fail without failing the run: the block then says the profiles were not read.
 */
async function readBondTermsBlock(portfolio: AssistantPortfolioContext, now: Date): Promise<string> {
  const requests = bondProfileRequests(selectBondHoldings(portfolio.holdings).funds);
  let profiles: Record<string, InstrumentProfile> = {};
  let profilesRead = true;
  if (requests.length > 0) {
    try {
      profiles = (await resolveInstrumentProfiles(requests, { now })).response.profiles;
    } catch (error) {
      profilesRead = false;
      console.error('[consulente] bond profiles not read', error);
    }
  }
  return formatBondTermsBlock({ holdings: portfolio.holdings, coupons: portfolio.dividends.coupons, profiles, profilesRead, todayIso: getItalyDateIso(now) }).join('\n');
}

/**
 * The paths before this one (2026-11-08): the live document when it has a report — during the
 * interview nothing has replaced it yet, at the strategy it is read before the new one — then the
 * archive, the most recent first, cut at `ALLOCATION_ADVICE_HISTORY_LIMIT`. A failed archive read
 * never fails a path: the block says it and lists the live one alone.
 */
async function readPreviousPaths(userId: string, live: AllocationAdviceDocument | null): Promise<AllocationAdvicePreviousPaths> {
  let archived: AllocationAdviceDocument[] = [];
  let archiveRead = true;
  try {
    archived = await listAllocationAdviceHistoryAdmin(userId, ALLOCATION_ADVICE_HISTORY_LIMIT);
  } catch (error) {
    archiveRead = false;
    console.error('[consulente] history not read', error);
  }
  return { paths: [...(live?.report ? [live] : []), ...archived].slice(0, ALLOCATION_ADVICE_HISTORY_LIMIT), archiveRead };
}

/** The document a new path replaces goes to the archive when it has a report; a failed copy is logged, never the path's failure. */
async function archivePreviousPath(previous: AllocationAdviceDocument | null): Promise<void> {
  if (!previous?.report) return;
  try {
    await archiveAllocationAdviceAdmin(previous);
  } catch (error) {
    console.error('[consulente] previous path not archived', error);
  }
}

/**
 * The strategy's context, read once per call: the YTD bundle, the fullest picture of the year
 * the app has, with every portfolio block the assistant reads, and under it the OBBLIGAZIONI
 * block (2026-11-08); beside them the CASHFLOW 12 MESI block (2026-11), on its own read of the
 * whole history. Shared by the strategy and the interview (2026-11-08), so a round reads exactly
 * the strategy's data. A failed read rejects here and fails the caller, retryable: never a
 * strategy on a silent empty cashflow.
 */
async function buildConsulenteContext(userId: string, now: Date): Promise<{ dataBlock: string; cashflowBlock: string }> {
  const [bundle, cashflowBlock] = await Promise.all([buildAssistantYtdContext(userId), readCashflowBlockForPrompt(userId, now)]);
  const bondBlock = await readBondTermsBlock(bundle.portfolio, now);
  return { dataBlock: `${formatBundleForPrompt(bundle)}\n\n${bondBlock}`, cashflowBlock };
}

/** The stage begins: the document says so before the model is called, so a cut leaves it there. */
async function enterStage(document: AllocationAdviceDocument, stage: AllocationAdviceStage, onStage: (stage: AllocationAdviceStage) => void): Promise<void> {
  document.stage = stage;
  document.status = 'running';
  document.error = null;
  await patchAllocationAdviceAdmin(document.userId, { stage, status: 'running', error: null });
  onStage(stage);
}

async function runStrategy(
  document: AllocationAdviceDocument,
  onStage: (stage: AllocationAdviceStage) => void,
  priorPlan: AllocationAdvicePriorPlan | null,
  now: Date,
  previousPaths: AllocationAdvicePreviousPaths | null = null
): Promise<void> {
  const { dataBlock, cashflowBlock } = await buildConsulenteContext(document.userId, now);
  await enterStage(document, 'strategy', onStage);
  const answer = await callModel('strategy', {
    model: ALLOCATION_ADVICE_STRATEGY_MODEL,
    prompt: buildStrategyPrompt(document.answers, dataBlock, { priorPlan, cashflowBlock, interview: document.interview, previousPaths }),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    format: ALLOCATION_ANSWER_FORMAT,
  });
  const parsed = parseAllocationAnswer(answer.text);
  if (!parsed?.proposal) {
    // The shape is the API's; what fails here is a sum or a bound it does not enforce.
    console.warn('[consulente] strategy proposal refused', parsed ? parsed.refused : 'not the answer object');
    throw new AllocationAdviceStageError('strategy', 'Il modello non ha prodotto una proposta leggibile. Riprova: di norma la seconda corsa rientra.', true);
  }
  document.strategy = { markdown: parsed.markdown, proposal: parsed.proposal, model: answer.model, finishedAt: new Date() };
  await patchAllocationAdviceAdmin(document.userId, { strategy: document.strategy });
}

async function runInstruments(document: AllocationAdviceDocument, onStage: (stage: AllocationAdviceStage) => void, now: Date): Promise<void> {
  const proposal = document.strategy?.proposal;
  if (!proposal) throw new AllocationAdviceStageError('instruments', 'Manca la strategia da cui partire. Avvia di nuovo la ricerca.', false);
  const bundle = await buildAssistantYtdContext(document.userId);
  // The holdings and, under them, the OBBLIGAZIONI block: the agent reads the durations it must confirm.
  const holdingsBlock = [...formatPortfolioForPrompt(bundle.portfolio), '', await readBondTermsBlock(bundle.portfolio, now)].join('\n');
  await enterStage(document, 'instruments', onStage);
  const answer = await callModel('instruments', {
    model: ALLOCATION_ADVICE_INSTRUMENTS_MODEL,
    prompt: buildInstrumentsPrompt(document.answers, proposal, holdingsBlock),
    effort: ALLOCATION_ADVICE_INSTRUMENTS_EFFORT,
    webSearch: true,
  });
  // Lenient: the sleeves that parse are kept; what was refused goes to the log, so a block the
  // agent writes wrong is diagnosed, not silently null (the owner's run 4, 2026-10-20).
  const { candidates, refused } = parseInstrumentCandidatesLenient(answer.text);
  if (refused.length > 0) console.warn('[consulente] instrument-candidates partly refused', refused);
  if (candidates === null) console.warn('[consulente] instrument-candidates block missing or unreadable', answer.text.slice(-1500));
  document.instruments = {
    markdown: stripFencedBlocks(answer.text),
    candidates,
    model: answer.model,
    webSearchUsed: answer.webSearchUsed,
    finishedAt: new Date(),
  };
  await patchAllocationAdviceAdmin(document.userId, { instruments: document.instruments });
}

async function runReview(document: AllocationAdviceDocument, onStage: (stage: AllocationAdviceStage) => void): Promise<void> {
  const { strategy, instruments } = document;
  if (!strategy?.proposal || !instruments) throw new AllocationAdviceStageError('review', 'Mancano strategia o strumenti da rivedere. Avvia di nuovo la ricerca.', false);
  await enterStage(document, 'review', onStage);
  const answer = await callModel('review', {
    model: ALLOCATION_ADVICE_STRATEGY_MODEL,
    prompt: buildReviewPrompt(
      document.answers,
      withBlock(strategy.markdown, ALLOCATION_PROPOSAL_BLOCK, strategy.proposal),
      withBlock(instruments.markdown, INSTRUMENT_CANDIDATES_BLOCK, instruments.candidates),
      instruments.candidates,
      { interview: document.interview }
    ),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    format: ALLOCATION_ANSWER_FORMAT,
  });
  // The review's proposal when valid, the strategy's otherwise: a review that breaks a sum loses
  // its structure, never the proposal.
  const reviewed = parseAllocationAnswer(answer.text);
  if (reviewed && !reviewed.proposal) console.warn('[consulente] review proposal refused', reviewed.refused);
  document.report = { markdown: reviewed?.markdown ?? answer.text, proposal: reviewed?.proposal ?? strategy.proposal, model: answer.model, finishedAt: new Date() };
  document.status = 'ready';
  await patchAllocationAdviceAdmin(document.userId, { report: document.report, status: 'ready' });
}

/**
 * «Chiedi una modifica» (2026-10-20): the review again, on the same strategy and instruments,
 * with the previous report and every request so far — a couple of minutes on Opus 5.5 instead
 * of a whole new run. The report and its proposal are replaced; the requests stay on the document.
 */
async function runRevise(document: AllocationAdviceDocument, request: string, interview: AllocationAdviceInterview | null, onStage: (stage: AllocationAdviceStage) => void): Promise<void> {
  const { strategy, instruments, report } = document;
  if (!strategy?.proposal || !instruments || !report) throw new AllocationAdviceStageError('review', "Non c'è un report finito da rivedere. Avvia la ricerca.");
  const requests = [...(document.revisions ?? []).map((row) => row.request), request];
  await enterStage(document, 'review', onStage);
  const answer = await callModel('review', {
    model: ALLOCATION_ADVICE_STRATEGY_MODEL,
    prompt: buildRevisionPrompt(
      document.answers,
      withBlock(strategy.markdown, ALLOCATION_PROPOSAL_BLOCK, strategy.proposal),
      withBlock(instruments.markdown, INSTRUMENT_CANDIDATES_BLOCK, instruments.candidates),
      instruments.candidates,
      withBlock(report.markdown, ALLOCATION_PROPOSAL_BLOCK, report.proposal),
      requests,
      { interview }
    ),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    format: ALLOCATION_ANSWER_FORMAT,
  });
  const reviewed = parseAllocationAnswer(answer.text);
  if (reviewed && !reviewed.proposal) console.warn('[consulente] revision proposal refused', reviewed.refused);
  document.report = { markdown: reviewed?.markdown ?? answer.text, proposal: reviewed?.proposal ?? report.proposal, model: answer.model, finishedAt: new Date() };
  document.revisions = [...(document.revisions ?? []), { request, at: new Date() }];
  document.revisionInterview = interview ?? null;
  document.status = 'ready';
  await patchAllocationAdviceAdmin(document.userId, { report: document.report, revisions: document.revisions, revisionInterview: document.revisionInterview, status: 'ready' });
}

// ─── The interview, a request of its own (2026-11-08) ─────────────────────────

export interface RunInterviewRoundArgs {
  userId: string;
  answers: AllocationAdviceAnswers;
  /** The rounds already asked, each with the answers given; empty for round 1. */
  previousRounds: AllocationAdviceInterviewRound[];
  /** «Chiedi una modifica»: the ONE round about the written request, over the finished report. */
  revision?: { requests: string } | null;
  onRound: (round: Omit<AllocationAdviceInterviewRound, 'answers'>) => void;
  now?: Date;
}

/**
 * One round of the interview: reads the store ONCE (`getAllocationAdviceAdmin`, null for a
 * first-time user — the plan in force, or the report a revision is about), builds the strategy's
 * context, calls Opus 5.5 with `interviewRoundSchema` as the structured output and hands the
 * round to `onRound`. It never writes: no `setAllocationAdviceAdmin`, no
 * `patchAllocationAdviceAdmin`, no `enterStage` — the rounds live in the browser's draft until
 * the strategy's body carries them (decision 23). A failure rejects with an
 * `AllocationAdviceStageError` of stage `'interview'`.
 */
export async function runInterviewRound({ userId, answers, previousRounds, revision = null, onRound, now = new Date() }: RunInterviewRoundArgs): Promise<void> {
  const stored = await getAllocationAdviceAdmin(userId);
  let revisionBlock: { requests: string; report: string } | null = null;
  if (revision) {
    const report = stored?.report;
    if (!stored || !report || !stored.strategy?.proposal) throw new AllocationAdviceStageError('interview', "Non c'è un report finito da rivedere. Avvia la ricerca.");
    const requests = [...(stored.revisions ?? []).map((row) => row.request), revision.requests];
    revisionBlock = {
      requests: requests.map((request, index) => `${index + 1}. ${request}`).join('\n'),
      report: withBlock(report.markdown, ALLOCATION_PROPOSAL_BLOCK, report.proposal),
    };
  }
  // A new path reads the paths before it; the revision's round reads its own report instead.
  const [{ dataBlock, cashflowBlock }, previousPaths] = await Promise.all([buildConsulenteContext(userId, now), revision ? null : readPreviousPaths(userId, stored)]);
  const answer = await callModel('interview', {
    model: ALLOCATION_ADVICE_STRATEGY_MODEL,
    prompt: buildInterviewPrompt(answers, dataBlock, {
      cashflowBlock,
      priorPlan: revision ? null : priorPlanOf(stored),
      previousRounds,
      roundNumber: previousRounds.length + 1,
      revision: revisionBlock,
      previousPaths,
    }),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    maxTokens: ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS,
    format: INTERVIEW_FORMAT,
  });
  // Lenient: the questions that parse are kept, the refused go to the log (the silent-cap rule).
  const { round, refused } = parseInterviewRound(answer.text);
  for (const reason of refused) console.warn('[consulente] interview question refused', reason);
  if (!round) throw new AllocationAdviceStageError('interview', 'Il modello non ha prodotto domande leggibili. Riprova.', true);
  onRound({ ...round, model: answer.model, askedAt: new Date() });
}

/**
 * Runs ONE stage for `userId`: the strategy creates the document from `answers`, the other two
 * continue the persisted one; `revise` reruns the review on a finished report with `request`. Resolves with the document as it stands after the stage; rejects
 * with an `AllocationAdviceStageError` after persisting the failure (stage, words, retryable).
 */
export async function runAllocationAdviceStage({ userId, stage, answers, document: given, request, interview = null, onStage, now = new Date() }: RunAllocationAdviceStageArgs): Promise<AllocationAdviceDocument> {
  let document: AllocationAdviceDocument;
  // The plan in force and the paths before, read BEFORE the new document replaces the last one:
  // the strategy continues the plan and compares today with then; the replaced document, when it
  // has a report, is archived first — a crash between the two leaves the old document live.
  let priorPlan: AllocationAdvicePriorPlan | null = null;
  let previousPaths: AllocationAdvicePreviousPaths | null = null;
  if (stage === 'strategy') {
    if (!answers) throw new AllocationAdviceStageError('strategy', 'Mancano le risposte del percorso. Torna al riepilogo e riparti.');
    const previous = given ?? (await getAllocationAdviceAdmin(userId));
    priorPlan = priorPlanOf(previous);
    previousPaths = await readPreviousPaths(userId, previous);
    await archivePreviousPath(previous);
    document = newDocument(userId, answers, now, interview);
    await setAllocationAdviceAdmin(document);
    onStage('context');
  } else {
    const found = given ?? (await getAllocationAdviceAdmin(userId));
    if (!found) throw new AllocationAdviceStageError(documentStageOf(stage), 'Non trovo il percorso da continuare. Avvia di nuovo la ricerca.');
    document = found;
  }

  try {
    if (stage === 'strategy') await runStrategy(document, onStage, priorPlan, now, previousPaths);
    else if (stage === 'instruments') await runInstruments(document, onStage, now);
    else if (stage === 'review') await runReview(document, onStage);
    else {
      if (!request) throw new AllocationAdviceStageError('review', 'Scrivi cosa vuoi cambiare nel report.');
      await runRevise(document, request, interview, onStage);
    }
    return document;
  } catch (error) {
    const failure =
      error instanceof AllocationAdviceStageError
        ? error
        : new AllocationAdviceStageError(document.stage ?? documentStageOf(stage), 'Il percorso si è interrotto per un errore imprevisto. Riprova fra qualche istante.', true);
    if (!(error instanceof AllocationAdviceStageError)) console.error('[consulente] run failed', error);
    document.status = 'failed';
    document.error = failure.message;
    // Never 'interview' here (the interview has its own entry point); the narrowing is for the type.
    await patchAllocationAdviceAdmin(userId, { status: 'failed', error: failure.message, stage: failure.stage === 'interview' ? documentStageOf(stage) : failure.stage });
    throw failure;
  }
}

/** The three stages in sequence, for a caller with no ceiling on its time. */
export async function runAllocationAdvice({ userId, answers, onStage, now = new Date() }: RunAllocationAdviceArgs): Promise<AllocationAdviceDocument> {
  let document = await runAllocationAdviceStage({ userId, stage: 'strategy', answers, onStage, now });
  document = await runAllocationAdviceStage({ userId, stage: 'instruments', document, onStage, now });
  return runAllocationAdviceStage({ userId, stage: 'review', document, onStage, now });
}
