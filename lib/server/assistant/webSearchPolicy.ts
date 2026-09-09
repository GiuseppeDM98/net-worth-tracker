import { AssistantMode, AssistantPreferences } from '@/types/assistant';

// A trailing '*' marks a deliberate word-STEM match: 'geopolit*' must still catch
// "geopolitica"/"geopolitico"/"geopolitici", so only its leading word boundary is
// enforced. Every other entry is a whole word/phrase — matched on both boundaries,
// or 'pil' (PIL, gross domestic product) also fires on "pilastro"/"pilota".
const MACRO_KEYWORDS = [
  'macro',
  'macroeconomia',
  'inflazione',
  'tassi',
  'bce',
  'fed',
  'geopolit*',
  'guerra',
  'dazi',
  'tariffe',
  'petrolio',
  'recessione',
  'pil',
  'mercati globali',
  'banche centrali',
  'obbligazioni governative',
];

const EXPLICIT_WEB_SEARCH_PATTERNS = [
  'cerca sul web',
  'cerca online',
  'usa il web',
  'controlla online',
  'verifica online',
  'notizie recenti',
  'ultime notizie',
  'ultimi sviluppi',
  'aggiornamento macro',
  'situazione geopolitica',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a word-boundary regex for one keyword/phrase. A `.includes()` match let
 * 'pil' fire on "pilastro"/"pilota" — a false positive that costs a full web-search
 * turn. `\b` on both ends fixes that for whole words; a trailing '*' opts a pattern
 * out of the trailing boundary for deliberate stem matches (see MACRO_KEYWORDS).
 */
function buildKeywordRegex(pattern: string): RegExp {
  const isStem = pattern.endsWith('*');
  const raw = isStem ? pattern.slice(0, -1) : pattern;
  return new RegExp(`\\b${escapeRegExp(raw)}${isStem ? '' : '\\b'}`);
}

const WEB_SEARCH_MATCHERS = [...MACRO_KEYWORDS, ...EXPLICIT_WEB_SEARCH_PATTERNS].map(buildKeywordRegex);

export function getDefaultAssistantPreferences(): AssistantPreferences {
  return {
    responseStyle: 'balanced',
    includeMacroContext: false,
    memoryEnabled: true,
    includeDummySnapshots: false,
  };
}

export function shouldUseWebSearch(prompt: string): boolean {
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (!normalizedPrompt) {
    return false;
  }

  return WEB_SEARCH_MATCHERS.some((regex) => regex.test(normalizedPrompt));
}

const STRUCTURED_ANALYSIS_MODES: AssistantMode[] = [
  'month_analysis',
  'year_analysis',
  'ytd_analysis',
  'history_analysis',
];

export function resolveAssistantWebSearchPolicy(
  mode: AssistantMode,
  prompt: string,
  preferences: AssistantPreferences
): boolean {
  if (STRUCTURED_ANALYSIS_MODES.includes(mode)) {
    return preferences.includeMacroContext;
  }

  // Chat mode: only prompt-based keyword detection triggers web search.
  // The includeMacroContext preference is intentionally ignored here — it controls
  // structured analysis modes (month/year/ytd/history) but should not cause every
  // chat message to trigger an expensive web search when no macro keyword is present.
  return shouldUseWebSearch(prompt);
}
