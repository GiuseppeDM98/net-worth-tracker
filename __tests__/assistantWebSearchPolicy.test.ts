import { describe, expect, it } from 'vitest';
import {
  getDefaultAssistantPreferences,
  resolveAssistantWebSearchPolicy,
  shouldUseWebSearch,
} from '@/lib/server/assistant/webSearchPolicy';

describe('Assistant web search policy', () => {
  it('enables web search for macro and geopolitical prompts', () => {
    expect(
      shouldUseWebSearch('Dammi un aggiornamento su inflazione, BCE e tensioni geopolitiche')
    ).toBe(true);
  });

  it('enables web search for explicit user requests', () => {
    expect(shouldUseWebSearch('Per favore cerca sul web le ultime notizie sui mercati')).toBe(true);
  });

  it('keeps web search disabled for generic portfolio prompts', () => {
    expect(shouldUseWebSearch('Spiegami come leggere meglio la mia asset allocation')).toBe(false);
  });

  it('does NOT trigger on "pilastro", a false positive of the old .includes() match on "pil"', () => {
    expect(shouldUseWebSearch('Qual è il primo pilastro della mia strategia di risparmio?')).toBe(false);
  });

  it('does NOT trigger on "pilota", another substring false positive of "pil"', () => {
    expect(shouldUseWebSearch('Chi è il pilota di questo fondo?')).toBe(false);
  });

  it('triggers on the whole word "PIL" (gross domestic product), case-insensitively', () => {
    expect(shouldUseWebSearch('Come impatta il PIL sui mercati?')).toBe(true);
  });

  it('still matches the "geopolit" stem across its inflections (deliberate prefix match)', () => {
    expect(shouldUseWebSearch('Cosa ne pensi della situazione geopolitica attuale?')).toBe(true);
    expect(shouldUseWebSearch('Rischio geopolitico in aumento nel 2026')).toBe(true);
  });

  it('uses includeMacroContext only for month analysis mode', () => {
    expect(
      resolveAssistantWebSearchPolicy('month_analysis', 'Analizza il mese', {
        ...getDefaultAssistantPreferences(),
        includeMacroContext: true,
      })
    ).toBe(true);

    expect(
      resolveAssistantWebSearchPolicy('month_analysis', 'Analizza il mese', {
        ...getDefaultAssistantPreferences(),
        includeMacroContext: false,
      })
    ).toBe(false);
  });

  it('chat: keyword triggers web search even with toggle off', () => {
    expect(
      resolveAssistantWebSearchPolicy('chat', 'Cerca online le ultime notizie macro', {
        ...getDefaultAssistantPreferences(),
        includeMacroContext: false,
      })
    ).toBe(true);
  });

  it('chat: toggle on does NOT enable web search without keywords (chat is keyword-only)', () => {
    // Chat mode ignores includeMacroContext — it uses prompt-based keyword detection only.
    // The preference controls structured analysis modes (month/year/ytd/history), not chat.
    expect(
      resolveAssistantWebSearchPolicy('chat', 'Riorganizza le mie domande sul portafoglio', {
        ...getDefaultAssistantPreferences(),
        includeMacroContext: true,
      })
    ).toBe(false);
  });

  it('chat: toggle off and no keywords keeps web search disabled', () => {
    expect(
      resolveAssistantWebSearchPolicy('chat', 'Riorganizza le mie domande sul portafoglio', {
        ...getDefaultAssistantPreferences(),
        includeMacroContext: false,
      })
    ).toBe(false);
  });
});
