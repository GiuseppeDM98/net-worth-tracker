/**
 * Memory extraction pipeline for Assistente AI — Step 5.
 *
 * After each successful assistant response, this module evaluates whether
 * the conversation exchange contains stable, memorizable facts. It uses a
 * lightweight Claude Haiku call to extract candidates and deduplicates them
 * against existing active items before the caller persists them.
 *
 * Design constraints:
 * - Never block the user-facing chat stream: callers must fire-and-forget
 * - Extract only stable, explicit facts declared by the user
 * - Deduplicate using fuzzy text normalization scoped per category
 * - Extraction errors are swallowed here; callers may log but must not throw
 */

import Anthropic from '@anthropic-ai/sdk';
import { AssistantMemoryItem } from '@/types/assistant';

// Haiku is used for extraction to keep latency and cost low.
// The prompt is tightly scoped so a smaller model is reliable enough.
const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

/** Raw candidate produced by the LLM before deduplication and ID assignment. */
export interface MemoryCandidate {
  category: AssistantMemoryItem['category'];
  text: string;
}

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
 * Filters candidates that are already represented in the active item set.
 * Deduplication is scoped per category to avoid cross-category false positives.
 *
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

  return candidates.filter((candidate) => {
    const existing = activeByCategory.get(candidate.category) ?? [];
    return !existing.some((item) => isSimilarText(candidate.text, item.text));
  });
}

/**
 * Calls Claude Haiku to extract stable memory candidates from one conversation turn.
 *
 * Only facts explicitly stated by the user are extracted — not assistant output:
 * - goal: financial objectives, time horizons, target net worth
 * - preference: desired analysis depth, topics to focus on or avoid
 * - risk: declared risk tolerance, aversion, specific constraints
 * - fact: stable facts explicitly stated (e.g. "Ho un mutuo a tasso fisso")
 *
 * Returns an empty array on any error — callers must not throw on failure.
 */
export async function extractMemoryCandidates(
  userMessage: string,
  assistantMessage: string,
  anthropicClient: Anthropic
): Promise<MemoryCandidate[]> {
  const systemPrompt = `Sei un estrattore di fatti per un assistente finanziario personale.
Il tuo compito è analizzare uno scambio utente-assistente e identificare fatti stabili esplicitamente dichiarati dall'utente.

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
- Se non c'è nulla da estrarre, rispondi con []
- Rispondi SOLO con JSON valido, senza testo aggiuntivo né markdown fence`;

  // Limit message lengths to keep the prompt small and cost low
  const userContent = `UTENTE: ${userMessage.slice(0, 600)}

ASSISTENTE: ${assistantMessage.slice(0, 300)}

Estrai i fatti memorizzabili dall'input dell'UTENTE. Formato: [{"category":"...","text":"..."}]`;

  try {
    const response = await anthropicClient.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const firstBlock = response.content[0];
    if (firstBlock.type !== 'text') return [];

    const raw = firstBlock.text.trim();
    // Strip markdown code fence if model wraps the output
    const json = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed: unknown = JSON.parse(json);

    if (!Array.isArray(parsed)) return [];

    // Validate each item strictly to avoid persisting garbage
    return parsed.filter(
      (item): item is MemoryCandidate =>
        typeof item === 'object' &&
        item !== null &&
        ['goal', 'preference', 'risk', 'fact'].includes((item as any).category) &&
        typeof (item as any).text === 'string' &&
        (item as any).text.trim().length > 0 &&
        (item as any).text.length <= 120
    );
  } catch {
    // Non-fatal: extraction failures must not surface to the user
    return [];
  }
}
