/**
 * `ConsulenteRun` (components/allocation/consulente/ConsulenteRun.tsx, AI-03): the active row with
 * its typical duration and its elapsed clock (hidden from the reader, the headline the ONE live
 * region), the failed stage with «Riprova», the finished run. Fake timers at a noon fixture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ConsulenteRun } from '@/components/allocation/consulente/ConsulenteRun';
import { initialAnswers } from '@/lib/utils/allocationAdviceDraft';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';

const answers = initialAnswers(null, null, []);
const noop = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
});

/** The card's rows — the rail above the card lists the same four stages, hidden from the reader. */
const ROWS = 'ol[aria-label="Le fasi"]:not([aria-hidden]) li';
const statesOf = (container: HTMLElement) => Array.from(container.querySelectorAll(ROWS)).map((li) => li.getAttribute('data-state'));

describe('ConsulenteRun', () => {
  it('shows the active stage with what it usually takes and a clock the reader does not hear', () => {
    const { container } = render(<ConsulenteRun state={{ kind: 'running', answers, stage: 'strategy', stageStartedAt: Date.now() - 61_000 }} onRetry={noop} onBack={noop} />);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(statesOf(container)).toEqual(['done', 'active', 'pending', 'pending']);
    const active = container.querySelector(`${ROWS}[data-state="active"]`) as HTMLElement;
    expect(active.textContent).toContain('Propongo la strategia');
    expect(active.textContent).toContain('di solito ~2 min');
    expect(active.className).toContain('var(--ai-accent)');
    const done = container.querySelector(`${ROWS}[data-state="done"]`) as HTMLElement;
    expect(done.textContent).toContain('Leggo il portafoglio');
    expect(done.textContent).not.toContain('di solito');
    const clock = screen.getByText('1:01');
    expect(clock.getAttribute('aria-hidden')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('1:02')).not.toBeNull();
  });

  it('marks the failed stage, keeps no clock and offers «Riprova» as an AI control', () => {
    const { container } = render(
      <ConsulenteRun state={{ kind: 'failed', answers, error: 'Ricerca interrotta: ornitorinco.', retryable: true, resumeFrom: 'instruments' }} onRetry={noop} onBack={noop} />
    );
    expect(statesOf(container)).toEqual(['done', 'done', 'failed', 'pending']);
    expect(screen.getByRole('status').textContent).toBe('Il percorso non si è concluso.');
    expect(screen.getByText('Ricerca interrotta: ornitorinco.')).not.toBeNull();
    expect(container.querySelector('ol[aria-label="Le fasi"]:not([aria-hidden])')?.textContent).not.toMatch(/\d+:\d\d/);
    expect(screen.getByRole('button', { name: 'Riprova' }).className).toContain(AI_CONTROL_ACCENT_CLASS);
  });

  it('shows every stage done when the run has finished', () => {
    const { container } = render(<ConsulenteRun state={{ kind: 'done', answers }} onRetry={noop} onBack={noop} />);
    expect(statesOf(container)).toEqual(['done', 'done', 'done', 'done']);
    expect(screen.getByRole('status').textContent).toBe('La proposta è pronta.');
  });
});
