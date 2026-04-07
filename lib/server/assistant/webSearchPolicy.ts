import { AssistantMode, AssistantPreferences } from '@/types/assistant';

const MACRO_KEYWORDS = [
  'macro',
  'macroeconomia',
  'inflazione',
  'tassi',
  'bce',
  'fed',
  'geopolit',
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

export function getDefaultAssistantPreferences(): AssistantPreferences {
  return {
    responseStyle: 'balanced',
    includeMacroContext: false,
    memoryEnabled: true,
  };
}

export function shouldUseWebSearch(prompt: string): boolean {
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (!normalizedPrompt) {
    return false;
  }

  return [...MACRO_KEYWORDS, ...EXPLICIT_WEB_SEARCH_PATTERNS].some((pattern) =>
    normalizedPrompt.includes(pattern)
  );
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

  return shouldUseWebSearch(prompt);
}
