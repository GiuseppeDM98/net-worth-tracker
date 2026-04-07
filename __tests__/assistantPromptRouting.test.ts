/**
 * Tests for web-search policy and prompt routing logic used by the assistant stream route.
 *
 * These are pure-function unit tests with no network or Firebase dependencies — run fast
 * and should stay green in all environments, including CI without ANTHROPIC_API_KEY set.
 */
import { describe, expect, it } from 'vitest';
import {
  getDefaultAssistantPreferences,
  resolveAssistantWebSearchPolicy,
  shouldUseWebSearch,
} from '@/lib/server/assistant/webSearchPolicy';

describe('getDefaultAssistantPreferences', () => {
  it('returns expected defaults', () => {
    const prefs = getDefaultAssistantPreferences();
    expect(prefs.responseStyle).toBe('balanced');
    expect(prefs.includeMacroContext).toBe(false);
    expect(prefs.memoryEnabled).toBe(true);
  });
});

describe('shouldUseWebSearch', () => {
  it('returns false for empty prompt', () => {
    expect(shouldUseWebSearch('')).toBe(false);
    expect(shouldUseWebSearch('   ')).toBe(false);
  });

  it('returns false for a plain portfolio question', () => {
    expect(shouldUseWebSearch('Come va il mio portafoglio questo mese?')).toBe(false);
    expect(shouldUseWebSearch('Analizza le mie spese di febbraio')).toBe(false);
  });

  it('returns true for macro keyword prompts', () => {
    expect(shouldUseWebSearch("Qual è l'impatto dell'inflazione sul mio portafoglio?")).toBe(true);
    expect(shouldUseWebSearch('Come si muovono i tassi della BCE?')).toBe(true);
    expect(shouldUseWebSearch('rischio recessione e obbligazioni')).toBe(true);
    expect(shouldUseWebSearch('petrolio e materie prime')).toBe(true);
    expect(shouldUseWebSearch('pil italiano questo trimestre')).toBe(true);
  });

  it('returns true for explicit web-search triggers', () => {
    expect(shouldUseWebSearch('cerca sul web gli ultimi aggiornamenti macro')).toBe(true);
    expect(shouldUseWebSearch('notizie recenti sui mercati')).toBe(true);
    expect(shouldUseWebSearch('ultime notizie BCE')).toBe(true);
    expect(shouldUseWebSearch('aggiornamento macro Europa')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(shouldUseWebSearch('INFLAZIONE 2025')).toBe(true);
    expect(shouldUseWebSearch('Tassi FED')).toBe(true);
  });
});

describe('resolveAssistantWebSearchPolicy', () => {
  const defaultPrefs = getDefaultAssistantPreferences();

  describe('month_analysis mode', () => {
    it('returns false when includeMacroContext is false (default)', () => {
      expect(
        resolveAssistantWebSearchPolicy('month_analysis', 'analisi mensile', defaultPrefs)
      ).toBe(false);
    });

    it('returns true when includeMacroContext is true regardless of prompt', () => {
      const macroPrefs = { ...defaultPrefs, includeMacroContext: true };
      expect(
        resolveAssistantWebSearchPolicy('month_analysis', 'analisi mensile', macroPrefs)
      ).toBe(true);
      // Even a plain portfolio question triggers web search when macro is on
      expect(
        resolveAssistantWebSearchPolicy('month_analysis', 'come vanno i miei asset?', macroPrefs)
      ).toBe(true);
    });

    it('ignores macro keywords in the prompt — only preference controls it', () => {
      // Macro keyword in prompt should NOT enable web search for month_analysis when pref is off
      expect(
        resolveAssistantWebSearchPolicy('month_analysis', 'inflazione e portafoglio', defaultPrefs)
      ).toBe(false);
    });
  });

  describe('chat mode', () => {
    it('returns false for a plain portfolio question', () => {
      expect(
        resolveAssistantWebSearchPolicy('chat', 'Come sto performando quest anno?', defaultPrefs)
      ).toBe(false);
    });

    it('returns true for a macro keyword prompt', () => {
      expect(
        resolveAssistantWebSearchPolicy('chat', "impatto dell'inflazione sul portafoglio", defaultPrefs)
      ).toBe(true);
    });

    it('returns true for an explicit web-search request', () => {
      expect(
        resolveAssistantWebSearchPolicy('chat', 'cerca sul web notizie BCE', defaultPrefs)
      ).toBe(true);
    });

    it('ignores includeMacroContext preference — chat uses prompt-based detection only', () => {
      const macroPrefs = { ...defaultPrefs, includeMacroContext: true };
      // Without a macro keyword, web search stays off in chat regardless of preference
      expect(
        resolveAssistantWebSearchPolicy('chat', 'Come sto performando?', macroPrefs)
      ).toBe(false);
    });
  });
});
