/**
 * Tests for the assistant period-axis pure layer.
 *
 * Time-dependent helpers are pinned with fake timers on explicit instants —
 * including a January boundary, where "previous completed month" must roll into
 * the previous year. Dates are built the way the app builds them (local time),
 * per the TZ guidance in AGENTS.md → Testing and Workflow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildComposerPlaceholder,
  buildEmptyStateQuestion,
  buildMonthOptions,
  buildYearOptions,
  findThreadForPeriod,
  getActivePeriodLabel,
  getPreviousCompletedMonth,
  resolveAssistantPreviewMode,
} from '@/lib/utils/assistantPeriodOptions';
import { AssistantThread } from '@/types/assistant';

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

  describe('getPreviousCompletedMonth', () => {
    it('should return the prior month within the same year', () => {
      vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
      expect(getPreviousCompletedMonth()).toEqual({ year: 2026, month: 7 });
    });

    it('should roll into December of the previous year in January', () => {
      vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));
      expect(getPreviousCompletedMonth()).toEqual({ year: 2025, month: 12 });
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

  describe('buildComposerPlaceholder / buildEmptyStateQuestion', () => {
    const month = { year: 2026, month: 7 };

    it('should phrase the placeholder on the selected period', () => {
      expect(buildComposerPlaceholder('month_analysis', 'none', month, 2026)).toContain('Luglio 2026');
      expect(buildComposerPlaceholder('chat', 'year', month, 2024)).toContain('anno 2024');
      expect(buildComposerPlaceholder('chat', 'none', month, 2026)).toContain('domanda libera');
    });

    it('should phrase the empty-state question on the selected period', () => {
      expect(buildEmptyStateQuestion('month_analysis', month, 2026)).toBe(
        'Cosa vuoi sapere su Luglio 2026?'
      );
      expect(buildEmptyStateQuestion('chat', month, 2026)).toBe('Cosa vuoi chiedere?');
    });
  });

  describe('resolveAssistantPreviewMode', () => {
    it('should pass a non-chat mode through untouched', () => {
      expect(resolveAssistantPreviewMode('ytd_analysis', 'month')).toBe('ytd_analysis');
    });

    it('should map an attached chat context to the matching analysis mode', () => {
      expect(resolveAssistantPreviewMode('chat', 'month')).toBe('month_analysis');
      expect(resolveAssistantPreviewMode('chat', 'year')).toBe('year_analysis');
      expect(resolveAssistantPreviewMode('chat', 'ytd')).toBe('ytd_analysis');
      expect(resolveAssistantPreviewMode('chat', 'history')).toBe('history_analysis');
      expect(resolveAssistantPreviewMode('chat', 'none')).toBe('chat');
    });
  });

  describe('findThreadForPeriod', () => {
    const baseThread = {
      id: 't1',
      userId: 'u1',
      title: 'x',
      createdAt: new Date(2026, 0, 10, 12, 0, 0),
      updatedAt: new Date(2026, 0, 10, 12, 0, 0),
      lastMessagePreview: '',
      messageCount: 1,
    };
    const threads: AssistantThread[] = [
      { ...baseThread, id: 'm-mar', mode: 'month_analysis', pinnedMonth: { year: 2026, month: 3 } },
      { ...baseThread, id: 'y-2025', mode: 'year_analysis', pinnedYear: 2025 },
      { ...baseThread, id: 'ytd', mode: 'ytd_analysis' },
    ];

    it('should match a month thread on BOTH year and month', () => {
      expect(findThreadForPeriod(threads, 'month_analysis', { year: 2026, month: 3 }, 2025)?.id).toBe('m-mar');
      expect(findThreadForPeriod(threads, 'month_analysis', { year: 2025, month: 3 }, 2025)).toBeUndefined();
    });

    it('should match a year thread on the selected year', () => {
      expect(findThreadForPeriod(threads, 'year_analysis', { year: 2026, month: 3 }, 2025)?.id).toBe('y-2025');
      expect(findThreadForPeriod(threads, 'year_analysis', { year: 2026, month: 3 }, 2024)).toBeUndefined();
    });

    it('should never auto-select for chat (Libera) mode', () => {
      expect(findThreadForPeriod(threads, 'chat', { year: 2026, month: 3 }, 2025)).toBeUndefined();
    });
  });
});
