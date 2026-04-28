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

  it('chat: toggle on enables web search regardless of prompt keywords', () => {
    expect(
      resolveAssistantWebSearchPolicy('chat', 'Riorganizza le mie domande sul portafoglio', {
        ...getDefaultAssistantPreferences(),
        includeMacroContext: true,
      })
    ).toBe(true);
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
