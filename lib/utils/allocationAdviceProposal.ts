/**
 * The contract between the Consulente's agents and the app, in ONE place (2026-10-20): the
 * answers the path collects, the proposal Opus 5.5 returns beside its markdown as a structured
 * output (`allocationAdviceAnswerSchema`, since 2026-10-23), the candidates Sonnet 5.5 writes in
 * a fenced ```instrument-candidates block — web search answers with citations, which structured
 * outputs refuse (400) — and the parser that lifts that block out of the prose.
 *
 * Client-safe on purpose (no `server-only`, no Firestore): the report page validates a stored
 * proposal before it renders an «Applica» button on it, and the run route validates the answers
 * with the same schema the screens typed them against.
 *
 * STRUCTURE IS NEVER PARSED FROM PROSE. An agent that gets the block wrong leaves `null` where
 * the structure would be — the report still shows what it wrote, and «Applica» says why it is
 * not available (doc/guide/assistente.md § Structured goals, the same rule).
 */

import { z } from 'zod';
import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import type { AssetClass } from '@/types/assets';

const ASSET_CLASSES = ASSET_CLASS_SEQUENCE as [AssetClass, ...AssetClass[]];

/** Rounding slack on a set of percentages the model writes with one decimal. */
export const PROPOSAL_SUM_TOLERANCE = 0.5;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data in formato YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Data non valida.');

function sumsTo100(values: number[]): boolean {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.abs(total - 100) <= PROPOSAL_SUM_TOLERANCE;
}

// ─── The answers ──────────────────────────────────────────────────────────────

export const lossToleranceSchema = z.enum(['bassa', 'media', 'alta']);
export const distributionPolicySchema = z.enum(['accumulazione', 'distribuzione', 'indifferente']);
export const goalPrioritySchema = z.enum(['alta', 'media', 'bassa']);

/** A goal as the path confirms it: an existing one (with its id) or a new one the user typed. */
export const answerGoalSchema = z.object({
  goalId: z.string().min(1).nullable(),
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().finite().positive().nullable(),
  targetDateIso: isoDate.nullable(),
  priority: goalPrioritySchema,
  /** `false` on an existing goal the user no longer recognises: the proposal drops it. */
  keep: z.boolean(),
  note: z.string().max(500),
});

export const allocationAdviceAnswersSchema = z.object({
  age: z.number().int().min(18).max(100).nullable(),
  horizonYears: z.number().int().min(1).max(60).nullable(),
  lossTolerance: lossToleranceSchema,
  exchange: z.string().trim().min(1).max(80),
  broker: z.string().trim().max(80),
  distributionPolicy: distributionPolicySchema,
  goals: z.array(answerGoalSchema).max(20),
  goalsReflectReality: z.boolean(),
  newGoalsNote: z.string().max(1000),
  homeRole: z.enum(['excluded', 'frozen']),
  pensionRole: z.enum(['frozen', 'excluded']),
  privateEquityRole: z.enum(['frozen', 'excluded']),
  keepAssets: z.array(z.string().trim().min(1).max(120)).max(50),
  avoid: z.string().max(500),
  esg: z.boolean(),
  notes: z.string().max(1000),
});

export type AllocationAdviceAnswers = z.infer<typeof allocationAdviceAnswersSchema>;
export type AnswerGoal = z.infer<typeof answerGoalSchema>;

// ─── The proposal (Opus 5.5) ──────────────────────────────────────────────────

export const proposalSubTargetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Of the class. */
  targetPercentage: z.number().finite().min(0).max(100),
  /** The instrument the sleeve should hold, by name, when the agent names one. */
  instrument: z.string().trim().max(160).optional(),
  rationale: z.string().max(400).optional(),
});

export const proposalClassSchema = z
  .object({
    assetClass: z.enum(ASSET_CLASSES),
    /** Of the base; 0 with `fixedAmount` on cash. */
    targetPercentage: z.number().finite().min(0).max(100),
    /** Cash only: a fixed euro reserve instead of a percentage. */
    fixedAmount: z.number().finite().positive().optional(),
    rationale: z.string().max(600),
    subTargets: z.array(proposalSubTargetSchema).max(12),
  })
  .refine((cls) => cls.subTargets.length === 0 || sumsTo100(cls.subTargets.map((sub) => sub.targetPercentage)), {
    message: 'I sotto-target di una classe devono sommare a 100.',
  });

export const proposalAssetRoleSchema = z.object({
  assetName: z.string().trim().min(1).max(160),
  role: z.enum(['tradable', 'frozen', 'excluded']),
  reason: z.string().max(300),
});

export const proposalGoalSchema = z.object({
  /** Set when the goal is one of the existing ones; absent on a new goal. */
  goalId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().finite().positive().optional(),
  targetDateIso: isoDate.optional(),
  priority: goalPrioritySchema,
  monthlyContribution: z.number().finite().nonnegative().optional(),
  // One optional key per class, as the app stores it. On the wire it travels as a list of pairs
  // (`allocationAdviceAnswerSchema`): see there why.
  recommendedAllocation: z
    .object(Object.fromEntries(ASSET_CLASSES.map((cls) => [cls, z.number().finite().min(0).max(100).optional()])) as Record<AssetClass, z.ZodOptional<z.ZodNumber>>)
    .refine((mix) => sumsTo100(Object.values(mix).map((pct) => pct ?? 0)), { message: "L'allocazione consigliata deve sommare a 100." })
    .optional(),
  /** Quotas on instruments HELD today, by exact name, in percent of the instrument. */
  assignments: z.array(z.object({ assetName: z.string().trim().min(1).max(160), percentage: z.number().finite().positive().max(100) })).max(20),
  rationale: z.string().max(500),
});

const proposalShape = {
  summary: z.string().trim().min(1).max(800),
  classes: z.array(proposalClassSchema).min(1).max(8),
  assetRoles: z.array(proposalAssetRoleSchema).max(60),
  goals: z.array(proposalGoalSchema).max(20),
  reviewByIso: isoDate,
  reviewReason: z.string().max(400),
  risks: z.array(z.string().max(300)).max(10),
};

export const allocationAdviceProposalSchema = z
  .object(proposalShape)
  .refine(
    (proposal) => {
      // The percentages of the classes without a fixed amount sum to 100: a fixed cash reserve
      // is carved out of the base before they apply (the page's own reading).
      const pcts = proposal.classes.filter((cls) => cls.fixedAmount === undefined).map((cls) => cls.targetPercentage);
      return sumsTo100(pcts);
    },
    { message: 'Le percentuali delle classi devono sommare a 100.' }
  )
  .refine((proposal) => new Set(proposal.classes.map((cls) => cls.assetClass)).size === proposal.classes.length, {
    message: 'Una classe compare una sola volta.',
  });

export type AllocationAdviceProposal = z.infer<typeof allocationAdviceProposalSchema>;

/**
 * The answer of the strategy and of the review (2026-10-23): ONE JSON object, the report's
 * markdown beside the proposal, sent to the API as the structured-output schema — the API
 * guarantees the shape, so a missing or broken block can no longer cost a whole Opus call.
 * The API does not enforce the numeric and length bounds nor the refinements (the sums to 100):
 * the SDK moves them into the schema's descriptions, and `parseAllocationAnswer` checks them here.
 *
 * A goal's mix travels as a list of `{ assetClass, percentage }` pairs, not as the stored object:
 * the API writes an object's keys in the schema's order, so a model that wrote `equity` and then
 * `trendFollowing` could no longer go back to `bonds`, and the mix fell short of 100 (the tour of
 * 2026-10-23, twice on the same goal). A record would not compile either: it becomes
 * `additionalProperties`, which structured outputs only take as `false`.
 */
const wireGoalSchema = proposalGoalSchema.extend({
  recommendedAllocation: z
    .array(z.object({ assetClass: z.enum(ASSET_CLASSES), percentage: z.number().finite().min(0).max(100) }))
    .max(8)
    .optional(),
});

export const allocationAdviceAnswerSchema = z.object({
  markdown: z.string(),
  proposal: z.object({ ...proposalShape, goals: z.array(wireGoalSchema).max(20) }),
});

/** The wire's list of pairs back to the stored object; a class named twice stays a list, and fails the check. */
function mixOf(pairs: unknown): unknown {
  if (!Array.isArray(pairs)) return pairs;
  if (pairs.length === 0) return undefined;
  const mix: Record<string, unknown> = {};
  for (const pair of pairs) {
    const cls = (pair as { assetClass?: unknown } | null)?.assetClass;
    if (typeof cls !== 'string' || cls in mix) return pairs;
    mix[cls] = (pair as { percentage?: unknown }).percentage;
  }
  return mix;
}

function storedProposalOf(proposal: unknown): unknown {
  const goals = (proposal as { goals?: unknown } | null)?.goals;
  if (!Array.isArray(goals)) return proposal;
  return {
    ...(proposal as object),
    goals: goals.map((goal) =>
      goal && typeof goal === 'object' && 'recommendedAllocation' in goal
        ? { ...goal, recommendedAllocation: mixOf((goal as { recommendedAllocation: unknown }).recommendedAllocation) }
        : goal
    ),
  };
}

/**
 * Reads a structured answer: null when the text is not the JSON object at all; the markdown
 * with `proposal: null` when the proposal breaks a bound or a sum the API does not enforce —
 * the report still shows what the agent wrote, and the caller decides what a missing proposal means.
 */
export function parseAllocationAnswer(text: string): { markdown: string; proposal: AllocationAdviceProposal | null; refused: string[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const markdown = (parsed as { markdown?: unknown } | null)?.markdown;
  if (typeof markdown !== 'string') return null;
  const proposal = allocationAdviceProposalSchema.safeParse(storedProposalOf((parsed as { proposal?: unknown }).proposal));
  if (proposal.success) return { markdown: markdown.trim(), proposal: proposal.data, refused: [] };
  return { markdown: markdown.trim(), proposal: null, refused: proposal.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
}

// ─── The instrument candidates (Sonnet 5.5) ──────────────────────────────────

export const instrumentCandidateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  isin: z.string().trim().max(20).optional(),
  ticker: z.string().trim().max(30).optional(),
  exchange: z.string().trim().max(120),
  policy: z.enum(['accumulazione', 'distribuzione']).optional(),
  /** Percent per year, e.g. 0.2. */
  ter: z.number().finite().min(0).max(5).optional(),
  domicile: z.string().trim().max(60).optional(),
  /** Set when the user already holds this very instrument. */
  alreadyHeld: z.boolean().optional(),
  // The caps are generous (the owner's run 4, 2026-10-20, lost the WHOLE block to one field
  // the agent wrote long): a note or a list of sources is prose, not a key.
  note: z.string().max(1000),
  source: z.string().max(1000).optional(),
});

export const instrumentCandidatesSchema = z.object({
  sleeves: z
    .array(
      z.object({
        assetClass: z.enum(ASSET_CLASSES),
        subTarget: z.string().trim().min(1).max(80),
        candidates: z.array(instrumentCandidateSchema).max(5),
        /** What the search could not establish; empty when every fact above was verified. */
        caveat: z.string().max(1000).optional(),
      })
    )
    .max(30),
});

export type InstrumentCandidates = z.infer<typeof instrumentCandidatesSchema>;

// ─── The fenced block ─────────────────────────────────────────────────────────

/**
 * Lifts the LAST fenced block of language `lang` out of `text` and parses it with `schema`.
 * Null for anything that is not a valid block — no block, broken JSON, a shape the schema
 * refuses: the caller keeps the prose and says the structure is missing.
 */
export function parseFencedBlock<T>(text: string, lang: string, schema: z.ZodType<T>): T | null {
  const pattern = new RegExp('```' + lang + '\\s*\\n([\\s\\S]*?)\\n```', 'g');
  let last: string | null = null;
  for (const match of text.matchAll(pattern)) last = match[1];
  if (last === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** The language of the proposal's block in the INPUT of the next agent (`withBlock` in run.ts). */
export const ALLOCATION_PROPOSAL_BLOCK = 'allocation-proposal';
export const INSTRUMENT_CANDIDATES_BLOCK = 'instrument-candidates';

/** The LAST fenced block of a language, as JSON, or null without one or on broken JSON. */
function lastFencedJson(text: string, lang: string): unknown {
  const pattern = new RegExp('```' + lang + '\\s*\\n([\\s\\S]*?)\\n```', 'g');
  let last: string | null = null;
  for (const match of text.matchAll(pattern)) last = match[1];
  if (last === null) return null;
  try {
    return JSON.parse(last.trim());
  } catch {
    return null;
  }
}

/**
 * The candidates, LENIENT: a sleeve the schema refuses is dropped, a candidate it refuses is
 * dropped from its sleeve, and the rest is kept — one sleeve written wrong must not lose the
 * fourteen written right (the owner's run 4, 2026-10-20: the report's Strumenti tile was empty
 * while the agent had verified every instrument). `refused` names what was left out, for the log.
 */
export function parseInstrumentCandidatesLenient(text: string): { candidates: InstrumentCandidates | null; refused: string[] } {
  const parsed = lastFencedJson(text, INSTRUMENT_CANDIDATES_BLOCK);
  if (parsed === null) return { candidates: null, refused: [] };
  const whole = instrumentCandidatesSchema.safeParse(parsed);
  if (whole.success) return { candidates: whole.data, refused: [] };

  const sleeves = (parsed as { sleeves?: unknown }).sleeves;
  if (!Array.isArray(sleeves)) return { candidates: null, refused: [whole.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')] };

  const refused: string[] = [];
  const kept: InstrumentCandidates['sleeves'] = [];
  const sleeveSchema = instrumentCandidatesSchema.shape.sleeves.element;
  for (const [index, sleeve] of sleeves.entries()) {
    const asSleeve = sleeveSchema.safeParse(sleeve);
    if (asSleeve.success) {
      kept.push(asSleeve.data);
      continue;
    }
    // The sleeve's own fields may be fine and one candidate wrong: keep the candidates that parse.
    const shell = sleeveSchema.safeParse({ ...(sleeve as object), candidates: [] });
    const rows = (sleeve as { candidates?: unknown }).candidates;
    if (shell.success && Array.isArray(rows)) {
      const good = rows.map((row) => instrumentCandidateSchema.safeParse(row)).filter((row) => row.success).map((row) => row.data);
      refused.push(`sleeve ${index} (${shell.data.subTarget}): ${rows.length - good.length} candidati rifiutati — ${asSleeve.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
      kept.push({ ...shell.data, candidates: good.slice(0, 5) });
      continue;
    }
    refused.push(`sleeve ${index}: ${asSleeve.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  return { candidates: { sleeves: kept.slice(0, 30) }, refused };
}

export function parseInstrumentCandidates(text: string): InstrumentCandidates | null {
  return parseInstrumentCandidatesLenient(text).candidates;
}

/** The prose with the fenced structure blocks taken out — what a reader is shown. */
export function stripFencedBlocks(text: string): string {
  return text
    .replace(new RegExp('```(?:' + ALLOCATION_PROPOSAL_BLOCK + '|' + INSTRUMENT_CANDIDATES_BLOCK + ')\\s*\\n[\\s\\S]*?\\n```', 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
