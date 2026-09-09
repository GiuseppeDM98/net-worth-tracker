/**
 * Memory extraction pipeline for Assistente AI.
 *
 * After each successful assistant response, this module evaluates whether the
 * conversation exchange contains stable, memorizable facts. It uses a lightweight
 * Claude Haiku call to extract candidates and deduplicates them against existing
 * active items before the caller persists them.
 *
 * Design constraints:
 * - Never block the user-facing chat stream: callers must fire-and-forget
 * - Extract only stable, explicit facts declared by the user
 * - Deduplicate using fuzzy text normalization scoped per category
 * - Extraction errors are swallowed here; callers may log but must not throw
 *
 * Why forced tool use instead of "reply with JSON": a quantified goal
 * must arrive as a NUMBER with a direction, not as a sentence somebody has to
 * parse afterwards. The previous design asked for prose and ran it through a
 * cascade of Italian regexes, so most real phrasings never produced a structured
 * goal at all and "1,5M" was read as fifteen million. The tool's input_schema now
 * carries that structure, and zod validates what comes back — a model is an
 * untrusted input source like any other.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AssistantMemoryItem, AssistantStructuredGoal } from '@/types/assistant';
import { MEMORY_EXTRACTION_MODEL } from '@/lib/constants/aiModels';

// Haiku is used for extraction to keep latency and cost low.
// The prompt is tightly scoped so a smaller model is reliable enough.
const EXTRACTION_MODEL = MEMORY_EXTRACTION_MODEL;

const MEMORY_TOOL_NAME = 'save_memory_items';

/** Raw candidate produced by the LLM before deduplication and ID assignment. */
export interface MemoryCandidate {
  category: AssistantMemoryItem['category'];
  text: string;
  structuredGoal?: AssistantStructuredGoal;
}

// ── Tool contract ────────────────────────────────────────────────────────────

// Kinds the evaluator can actually measure. Keep in lock-step with
// AssistantStructuredGoalKind and with resolveGoalMetric() in goalEvaluation.ts:
// a kind the model can emit but the evaluator cannot read is a goal that silently
// never completes.
const GOAL_KINDS = [
  'net_worth_target',
  'liquid_net_worth_target',
  'cash_target',
  'asset_class_value_target',
  'asset_class_percentage_target',
  'sub_category_value_target',
] as const;

const ASSET_CLASSES = [
  'equity',
  'bonds',
  'crypto',
  'realestate',
  'cash',
  'commodity',
  'trendFollowing',
  'carry',
] as const;

const MEMORY_CATEGORIES = ['goal', 'preference', 'risk', 'fact'] as const;

/**
 * JSON Schema handed to Claude. Mirrors `toolInputSchema` below — the schema
 * tells the model what to produce, zod decides what we accept.
 */
const MEMORY_TOOL: Anthropic.Tool = {
  name: MEMORY_TOOL_NAME,
  description:
    'Registra i fatti stabili dichiarati dall’utente. Chiama sempre questo tool, anche quando non c’è nulla da registrare (items: []).',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [...MEMORY_CATEGORIES],
              description:
                'goal = obiettivo finanziario; preference = preferenza di analisi; risk = propensione al rischio; fact = fatto stabile',
            },
            text: {
              type: 'string',
              description: 'Il fatto in italiano, conciso e verificabile, massimo 120 caratteri',
            },
            structuredGoal: {
              type: 'object',
              description:
                'SOLO per category "goal" e SOLO se l’obiettivo è quantificabile su patrimonio, liquidità, classe di asset o sottocategoria. Ometti se l’obiettivo non ha un numero misurabile.',
              properties: {
                kind: {
                  type: 'string',
                  // "Liquidità" is the label the product uses for the `cash` asset class,
                  // so it must map to cash_target: left to itself the model splits the
                  // same sentence between cash_target and liquid_net_worth_target.
                  enum: [...GOAL_KINDS],
                  description:
                    'net_worth_target = patrimonio totale. cash_target = "liquidità", "cash", "contanti", "conti correnti", "conto deposito" (è il nome che l’app dà alla classe di asset cash). liquid_net_worth_target = SOLO se l’utente dice esplicitamente "patrimonio liquido", "asset liquidabili", "quanto posso smobilizzare". asset_class_value_target = valore in euro di una classe. asset_class_percentage_target = peso percentuale di una classe. sub_category_value_target = valore in euro di una sottocategoria',
                },
                targetValue: {
                  type: 'number',
                  description:
                    'Valore numerico del target, in euro o in punti percentuali. MAI una stringa: "1,5M" → 1500000, "un milione e mezzo" → 1500000, "800k" → 800000, "il 10%" → 10',
                },
                direction: {
                  type: 'string',
                  enum: ['at_least', 'at_most'],
                  description:
                    'at_least se l’obiettivo è raggiungere o superare il target; at_most se è restare sotto (ridurre, non superare, tenere sotto)',
                },
                assetClass: {
                  type: 'string',
                  enum: [...ASSET_CLASSES],
                  description: 'Obbligatorio per i kind asset_class_*',
                },
                subCategoryName: {
                  type: 'string',
                  description:
                    'Obbligatorio per sub_category_value_target: il nome della sottocategoria così come l’utente l’ha detta (es. "Azioni USA")',
                },
                deadlineIso: {
                  type: 'string',
                  description: 'Scadenza in formato YYYY-MM-DD, solo se l’utente ne ha dichiarata una',
                },
              },
              required: ['kind', 'targetValue', 'direction'],
            },
          },
          required: ['category', 'text'],
        },
      },
    },
    required: ['items'],
  },
};

const structuredGoalInputSchema = z.object({
  kind: z.enum(GOAL_KINDS),
  targetValue: z.number().finite(),
  direction: z.enum(['at_least', 'at_most']),
  assetClass: z.enum(ASSET_CLASSES).optional(),
  subCategoryName: z.string().trim().min(1).max(80).optional(),
  deadlineIso: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const candidateInputSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  text: z.string().trim().min(1).max(120),
  // Validated separately, so a malformed structure costs the structure and not
  // the goal: the text is still worth remembering, just not auto-trackable.
  structuredGoal: z.unknown().optional(),
});

const toolInputSchema = z.object({
  // Items are validated one by one afterwards so a single malformed entry
  // discards itself instead of the whole extraction.
  items: z.array(z.unknown()),
});

type StructuredGoalInput = z.infer<typeof structuredGoalInputSchema>;

/**
 * Maps a validated tool payload onto the domain type, dropping structures the
 * evaluator could not read anyway (an asset-class goal with no class, a
 * subcategory goal with no name). The goal text survives: it becomes a memory
 * item that is simply not auto-trackable.
 */
function toStructuredGoal(input: StructuredGoalInput): AssistantStructuredGoal | undefined {
  const needsAssetClass =
    input.kind === 'asset_class_value_target' || input.kind === 'asset_class_percentage_target';
  if (needsAssetClass && !input.assetClass) return undefined;
  if (input.kind === 'sub_category_value_target' && !input.subCategoryName) return undefined;

  return {
    kind: input.kind,
    targetValue: input.targetValue,
    unit: input.kind === 'asset_class_percentage_target' ? 'percent' : 'eur',
    direction: input.direction,
    ...(input.assetClass ? { assetClass: input.assetClass } : {}),
    ...(input.subCategoryName ? { subCategory: input.subCategoryName } : {}),
    ...(input.deadlineIso ? { deadlineIso: input.deadlineIso } : {}),
  };
}

/**
 * Validates one raw item from the model. Returns null for anything malformed —
 * including a structured goal attached to a non-goal category, which would make
 * the memory panel promise tracking on a preference.
 */
function toMemoryCandidate(raw: unknown): MemoryCandidate | null {
  const parsed = candidateInputSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { category, text, structuredGoal } = parsed.data;
  if (category !== 'goal' || structuredGoal === undefined) {
    return { category, text };
  }

  const goalInput = structuredGoalInputSchema.safeParse(structuredGoal);
  return {
    category,
    text,
    ...(goalInput.success ? { structuredGoal: toStructuredGoal(goalInput.data) } : {}),
  };
}

// ── Deduplication ────────────────────────────────────────────────────────────

/**
 * Normalizes text for deduplication comparison: lowercase, remove punctuation,
 * collapse whitespace. Makes comparison robust to minor rephrasing.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?'"()\[\]{}\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true when two strings share enough normalized content to be
 * considered duplicates. Uses Jaccard similarity on word bigrams.
 *
 * Single-word strings fall back to exact normalized match to avoid
 * false positives on common short words like "rischio" or "basso".
 */
export function isSimilarText(a: string, b: string, threshold = 0.5): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return true;

  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');

  // For very short strings (<= 2 words), require exact match after normalization
  if (wordsA.length <= 2 || wordsB.length <= 2) {
    return na === nb;
  }

  const bigramsOf = (words: string[]): Set<string> => {
    const bg = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      bg.add(`${words[i]} ${words[i + 1]}`);
    }
    return bg;
  };

  const ba = bigramsOf(wordsA);
  const bb = bigramsOf(wordsB);
  const intersection = [...ba].filter((bg) => bb.has(bg)).length;
  const union = new Set([...ba, ...bb]).size;

  return union > 0 && intersection / union >= threshold;
}

/**
 * Filters candidates that are already represented in the active item set, AND
 * deduplicates candidates against each other within the same batch — two
 * near-identical candidates extracted from the same turn used to both survive,
 * since the original filter only ever compared against `existingItems`.
 *
 * Deduplication is scoped per category to avoid cross-category false positives.
 * Archived items are ignored: a re-archived topic can be re-learned.
 */
export function dedupeMemoryItems(
  candidates: MemoryCandidate[],
  existingItems: AssistantMemoryItem[]
): MemoryCandidate[] {
  // Build a per-category lookup of active items for efficient comparison
  const activeByCategory = new Map<AssistantMemoryItem['category'], AssistantMemoryItem[]>();
  for (const item of existingItems) {
    if (item.status !== 'active') continue;
    const list = activeByCategory.get(item.category) ?? [];
    list.push(item);
    activeByCategory.set(item.category, list);
  }

  // Candidates already accepted earlier in this same batch, checked the same way
  // as existingItems — first occurrence in the batch wins.
  const acceptedByCategory = new Map<AssistantMemoryItem['category'], MemoryCandidate[]>();

  const deduped: MemoryCandidate[] = [];
  for (const candidate of candidates) {
    const existing = activeByCategory.get(candidate.category) ?? [];
    const acceptedSoFar = acceptedByCategory.get(candidate.category) ?? [];

    const isDuplicate =
      existing.some((item) => isSimilarText(candidate.text, item.text)) ||
      acceptedSoFar.some((accepted) => isSimilarText(candidate.text, accepted.text));

    if (isDuplicate) continue;

    acceptedSoFar.push(candidate);
    acceptedByCategory.set(candidate.category, acceptedSoFar);
    deduped.push(candidate);
  }

  return deduped;
}

// ── Extraction calls ─────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Sei un estrattore di fatti per un assistente finanziario personale.
Analizzi uno scambio utente-assistente e registri i fatti stabili esplicitamente dichiarati dall'utente chiamando il tool ${MEMORY_TOOL_NAME}.

Categorie ammesse:
- "goal": obiettivi finanziari, orizzonti temporali, target di patrimonio
- "preference": preferenze sull'analisi (argomenti, profondità, cosa includere/escludere)
- "risk": propensione al rischio, avversione, vincoli espliciti dichiarati
- "fact": fatti stabili esplicitamente dichiarati (es. mutuo a tasso fisso, immobili in portafoglio, pensione integrativa)

Regole fondamentali:
- Estrai SOLO ciò che l'utente dichiara esplicitamente, mai contenuti inferiti
- NON estrarre: numeri di mercato, analisi mensili, eventi macro, dati storici temporanei
- NON estrarre preferenze di stile risposta (bilanciato/conciso/approfondito) già gestite altrove
- Ogni item: max 120 caratteri, conciso e verificabile
- Se non c'è nulla da estrarre, chiama comunque il tool con items: []

Regole per structuredGoal (solo category "goal"):
- Compilalo SOLO se l'obiettivo ha un numero misurabile sul patrimonio, sulla liquidità, su una classe di asset o su una sottocategoria. Un obiettivo come "andare in pensione sereno" non ha structuredGoal.
- targetValue è SEMPRE un numero. Converti tu le abbreviazioni e le parole:
  "1,5M" → 1500000 · "un milione e mezzo" → 1500000 · "800k" → 800000 · "300 mila" → 300000 · "il 10%" → 10
- direction: "at_least" per raggiungere/superare ("arrivare a 500k", "almeno 40k di liquidità"),
  "at_most" per restare sotto ("porta la liquidità sotto il 10%", "ridurre il cash a 20k", "non superare il 25% in crypto")
- Usa asset_class_percentage_target quando il target è un peso percentuale, asset_class_value_target quando è un valore in euro
- deadlineIso solo se l'utente ha dichiarato una scadenza (es. "entro fine 2027" → 2027-12-31)`;

const GOAL_STRUCTURING_SYSTEM_PROMPT = `Sei un estrattore di obiettivi per un assistente finanziario personale.
Ricevi UN obiettivo scritto a mano dall'utente e lo registri chiamando il tool ${MEMORY_TOOL_NAME} con un solo item di category "goal", testo identico a quello ricevuto.

Compila structuredGoal SOLO se l'obiettivo ha un numero misurabile sul patrimonio, sulla liquidità, su una classe di asset o su una sottocategoria. Se non ce l'ha, ometti structuredGoal: un obiettivo non quantificabile è legittimo.

- targetValue è SEMPRE un numero. Converti tu le abbreviazioni e le parole:
  "1,5M" → 1500000 · "un milione e mezzo" → 1500000 · "800k" → 800000 · "300 mila" → 300000 · "il 10%" → 10
- direction: "at_least" per raggiungere/superare, "at_most" per restare sotto (ridurre, non superare, tenere sotto)
- Usa asset_class_percentage_target quando il target è un peso percentuale, asset_class_value_target quando è un valore in euro
- deadlineIso solo se l'utente ha dichiarato una scadenza (es. "entro fine 2027" → 2027-12-31)`;

/**
 * Runs one forced-tool-use Haiku call and returns the candidates that survive
 * validation. Never throws: every failure path (API error, no tool block,
 * malformed payload) collapses to an empty array.
 */
async function callMemoryExtractionTool(
  systemPrompt: string,
  userContent: string,
  anthropicClient: Anthropic
): Promise<MemoryCandidate[]> {
  try {
    const response = await anthropicClient.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      // Static across every call — cache_control lets back-to-back extractions (one per
      // completed assistant turn, across users) share the cached prefix. Below the Haiku
      // 4.5 minimum cacheable prefix (4096 tokens) today, so this is a safe no-op rather
      // than a guaranteed hit — harmless to leave on, and correct if the prompt grows.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [MEMORY_TOOL],
      // Forced: the model has no way to answer in prose, so there is no prose to parse.
      tool_choice: { type: 'tool', name: MEMORY_TOOL_NAME },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === MEMORY_TOOL_NAME
    );
    if (!toolUse) return [];

    const envelope = toolInputSchema.safeParse(toolUse.input);
    if (!envelope.success) return [];

    return envelope.data.items
      .map(toMemoryCandidate)
      .filter((candidate): candidate is MemoryCandidate => candidate !== null);
  } catch {
    // Non-fatal: extraction failures must not surface to the user
    return [];
  }
}

/**
 * Calls Claude Haiku to extract stable memory candidates from one conversation turn.
 *
 * Only facts explicitly stated by the user are extracted — not assistant output.
 * Quantified goals come back already structured (kind, numeric target, direction,
 * optional deadline), ready for `evaluateStructuredGoal`.
 *
 * Returns an empty array on any error — callers must not throw on failure.
 */
export async function extractMemoryCandidates(
  userMessage: string,
  assistantMessage: string,
  anthropicClient: Anthropic
): Promise<MemoryCandidate[]> {
  // Limit message lengths to keep the prompt small and cost low
  const userContent = `UTENTE: ${userMessage.slice(0, 600)}

ASSISTENTE: ${assistantMessage.slice(0, 300)}

Registra i fatti memorizzabili dichiarati dall'UTENTE.`;

  return callMemoryExtractionTool(EXTRACTION_SYSTEM_PROMPT, userContent, anthropicClient);
}

/**
 * Structures ONE goal written by hand in the memory panel, using the same tool
 * as the conversational extraction. Manually written goals used to be run
 * through the regex parser and therefore almost never became trackable.
 *
 * Returns undefined when the goal carries no measurable number, and equally when
 * the call fails — callers must treat both as "not auto-trackable" rather than
 * as an error.
 */
export async function extractStructuredGoalFromText(
  goalText: string,
  anthropicClient: Anthropic
): Promise<AssistantStructuredGoal | undefined> {
  const candidates = await callMemoryExtractionTool(
    GOAL_STRUCTURING_SYSTEM_PROMPT,
    `OBIETTIVO: ${goalText.slice(0, 300)}`,
    anthropicClient
  );

  return candidates.find((candidate) => candidate.category === 'goal')?.structuredGoal;
}
