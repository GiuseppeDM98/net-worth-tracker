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
import { formatBundleForPrompt, formatPortfolioForPrompt } from '@/lib/server/assistant/prompts';
import { buildInstrumentsPrompt, buildReviewPrompt, buildRevisionPrompt, buildStrategyPrompt } from './prompts';
import { getAllocationAdviceAdmin, patchAllocationAdviceAdmin, setAllocationAdviceAdmin } from './store';
import {
  ALLOCATION_PROPOSAL_BLOCK,
  INSTRUMENT_CANDIDATES_BLOCK,
  allocationAdviceAnswerSchema,
  parseAllocationAnswer,
  parseInstrumentCandidatesLenient,
  stripFencedBlocks,
  type AllocationAdviceAnswers,
} from '@/lib/utils/allocationAdviceProposal';
import type { AllocationAdviceDocument, AllocationAdvicePriorPlan, AllocationAdviceRunStage, AllocationAdviceStage } from '@/types/allocationAdvice';
import { priorPlanOf } from '@/lib/utils/allocationAdviceDocument';

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
 */

/** Output budget per call: thinking AND text; a strategy with its block is a few thousand tokens, the rest is reasoning. */
export const ALLOCATION_ADVICE_MAX_TOKENS = 32000;
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

/** An agent that did not finish: the stage it was in and the product's sentence for it. */
export class AllocationAdviceStageError extends Error {
  stage: AllocationAdviceStage;
  retryable: boolean;

  constructor(stage: AllocationAdviceStage, message: string, retryable = false) {
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

/** A stage's answer is usable only when the model finished on its own. */
function assertFinished(stage: AllocationAdviceStage, answer: CollectedAnswer): void {
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
  /** The structured answer: the strategy and the review. */
  structured?: boolean;
}

/**
 * One stage's model call, streamed and read to its end by the SDK's accumulator (`finalMessage`):
 * the text, the stop reason, and the model that answered — after a mid-stream fallback the
 * accumulator names the model that finished, not the one that declined. A paused turn is resumed
 * up to `ALLOCATION_ADVICE_MAX_CONTINUATIONS` times, its text kept.
 */
async function callModel(stage: AllocationAdviceStage, call: ModelCall): Promise<CollectedAnswer> {
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
          max_tokens: ALLOCATION_ADVICE_MAX_TOKENS,
          system: call.prompt.system,
          thinking: { type: 'adaptive' },
          output_config: { effort: call.effort, ...(call.structured ? { format: ALLOCATION_ANSWER_FORMAT } : {}) },
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

function newDocument(userId: string, answers: AllocationAdviceAnswers, now: Date): AllocationAdviceDocument {
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
  };
}

/** The stage begins: the document says so before the model is called, so a cut leaves it there. */
async function enterStage(document: AllocationAdviceDocument, stage: AllocationAdviceStage, onStage: (stage: AllocationAdviceStage) => void): Promise<void> {
  document.stage = stage;
  document.status = 'running';
  document.error = null;
  await patchAllocationAdviceAdmin(document.userId, { stage, status: 'running', error: null });
  onStage(stage);
}

async function runStrategy(document: AllocationAdviceDocument, onStage: (stage: AllocationAdviceStage) => void, priorPlan: AllocationAdvicePriorPlan | null): Promise<void> {
  // The context: the YTD bundle, the fullest picture of the year the app has, with every
  // portfolio block the assistant reads.
  const bundle = await buildAssistantYtdContext(document.userId);
  const dataBlock = formatBundleForPrompt(bundle);
  await enterStage(document, 'strategy', onStage);
  const answer = await callModel('strategy', {
    model: ALLOCATION_ADVICE_STRATEGY_MODEL,
    prompt: buildStrategyPrompt(document.answers, dataBlock, priorPlan),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    structured: true,
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

async function runInstruments(document: AllocationAdviceDocument, onStage: (stage: AllocationAdviceStage) => void): Promise<void> {
  const proposal = document.strategy?.proposal;
  if (!proposal) throw new AllocationAdviceStageError('instruments', 'Manca la strategia da cui partire. Avvia di nuovo la ricerca.', false);
  const bundle = await buildAssistantYtdContext(document.userId);
  const holdingsBlock = formatPortfolioForPrompt(bundle.portfolio).join('\n');
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
      instruments.candidates
    ),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    structured: true,
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
async function runRevise(document: AllocationAdviceDocument, request: string, onStage: (stage: AllocationAdviceStage) => void): Promise<void> {
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
      requests
    ),
    effort: ALLOCATION_ADVICE_STRATEGY_EFFORT,
    structured: true,
  });
  const reviewed = parseAllocationAnswer(answer.text);
  if (reviewed && !reviewed.proposal) console.warn('[consulente] revision proposal refused', reviewed.refused);
  document.report = { markdown: reviewed?.markdown ?? answer.text, proposal: reviewed?.proposal ?? report.proposal, model: answer.model, finishedAt: new Date() };
  document.revisions = [...(document.revisions ?? []), { request, at: new Date() }];
  document.status = 'ready';
  await patchAllocationAdviceAdmin(document.userId, { report: document.report, revisions: document.revisions, status: 'ready' });
}

/**
 * Runs ONE stage for `userId`: the strategy creates the document from `answers`, the other two
 * continue the persisted one; `revise` reruns the review on a finished report with `request`. Resolves with the document as it stands after the stage; rejects
 * with an `AllocationAdviceStageError` after persisting the failure (stage, words, retryable).
 */
export async function runAllocationAdviceStage({ userId, stage, answers, document: given, request, onStage, now = new Date() }: RunAllocationAdviceStageArgs): Promise<AllocationAdviceDocument> {
  let document: AllocationAdviceDocument;
  // The plan in force, read BEFORE the new document replaces it: the strategy continues it.
  let priorPlan: AllocationAdvicePriorPlan | null = null;
  if (stage === 'strategy') {
    if (!answers) throw new AllocationAdviceStageError('strategy', 'Mancano le risposte del percorso. Torna al riepilogo e riparti.');
    priorPlan = priorPlanOf(given ?? (await getAllocationAdviceAdmin(userId)));
    document = newDocument(userId, answers, now);
    await setAllocationAdviceAdmin(document);
    onStage('context');
  } else {
    const found = given ?? (await getAllocationAdviceAdmin(userId));
    if (!found) throw new AllocationAdviceStageError(documentStageOf(stage), 'Non trovo il percorso da continuare. Avvia di nuovo la ricerca.');
    document = found;
  }

  try {
    if (stage === 'strategy') await runStrategy(document, onStage, priorPlan);
    else if (stage === 'instruments') await runInstruments(document, onStage);
    else if (stage === 'review') await runReview(document, onStage);
    else {
      if (!request) throw new AllocationAdviceStageError('review', 'Scrivi cosa vuoi cambiare nel report.');
      await runRevise(document, request, onStage);
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
    await patchAllocationAdviceAdmin(userId, { status: 'failed', error: failure.message, stage: failure.stage });
    throw failure;
  }
}

/** The three stages in sequence, for a caller with no ceiling on its time. */
export async function runAllocationAdvice({ userId, answers, onStage, now = new Date() }: RunAllocationAdviceArgs): Promise<AllocationAdviceDocument> {
  let document = await runAllocationAdviceStage({ userId, stage: 'strategy', answers, onStage, now });
  document = await runAllocationAdviceStage({ userId, stage: 'instruments', document, onStage, now });
  return runAllocationAdviceStage({ userId, stage: 'review', document, onStage, now });
}
