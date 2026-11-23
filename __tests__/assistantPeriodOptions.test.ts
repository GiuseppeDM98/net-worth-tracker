/**
 * Tests for the assistant's period helpers: the chooser's month/year options, a mode's label
 * and badge, the composer's length cap.
 *
 * Time-dependent helpers are pinned with fake timers on explicit instants. Dates are built the
 * way the app builds them (local time), per the TZ guidance in AGENTS.md → Testing and Workflow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMonthOptions,
  buildYearOptions,
  describePromptLength,
  getModeBadgeLabel,
  ASSISTANT_PROMPT_MAX_LENGTH,
  getActivePeriodLabel,
} from '@/lib/utils/assistantPeriodOptions';

describe('assistantPeriodOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildMonthOptions', () => {
    it('should start at the current month and go back 3 years, newest first', () => {
      vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0)); // 16 Aug 2026, noon
      const options = buildMonthOptions();

      expect(options[0]).toEqual({ year: 2026, month: 8 });
      expect(options[options.length - 1]).toEqual({ year: 2023, month: 1 });
      // 8 months of 2026 + 3 full years
      expect(options).toHaveLength(8 + 36);
    });
  });

  describe('buildYearOptions', () => {
    it('should list the current year + 4 back, newest first', () => {
      vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
      expect(buildYearOptions()).toEqual([2026, 2025, 2024, 2023, 2022]);
    });
  });

  describe('getActivePeriodLabel', () => {
    const month = { year: 2026, month: 3 };

    it('should label each mode with its own period', () => {
      expect(getActivePeriodLabel('month_analysis', month, 2024)).toBe('Analisi · Marzo 2026');
      expect(getActivePeriodLabel('year_analysis', month, 2024)).toBe('Analisi annuale · 2024');
      expect(getActivePeriodLabel('ytd_analysis', month, 2024)).toBe('YTD · 2026');
      expect(getActivePeriodLabel('history_analysis', month, 2024)).toBe('Storico totale');
      expect(getActivePeriodLabel('chat', month, 2024)).toBe('Domanda libera');
    });
  });

});

describe('assistantPeriodOptions — Registra (2026-11)', () => {
  const month = { year: 2026, month: 11 };

  it('names the mode at its label and its badge', () => {
    expect(getActivePeriodLabel('register', month, 2026)).toBe('Registra · senza periodo');
    expect(getModeBadgeLabel('register')).toBe('Registra');
    expect(getModeBadgeLabel('chat')).toBe('Libera');
    expect(getModeBadgeLabel('month_analysis')).toBe('Mese');
  });

  it('counts the prompt from 3800 characters, silent below', () => {
    expect(ASSISTANT_PROMPT_MAX_LENGTH).toBe(4000);
    expect(describePromptLength(0)).toBeNull();
    expect(describePromptLength(3799)).toBeNull();
    expect(describePromptLength(3800)).toBe('3.800 / 4.000 caratteri');
    expect(describePromptLength(3812)).toBe('3.812 / 4.000 caratteri');
    expect(describePromptLength(4000)).toBe('4.000 / 4.000 caratteri');
  });
});
