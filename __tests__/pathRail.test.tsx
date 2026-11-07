/**
 * `PathRail` (components/ui/path-rail.tsx, 2026-11-07): the path's eight ticks with ONE current step,
 * the interview's three (the interview passes them, `reached` the round number — decision 86) hidden
 * until a round is on, the run's four fills hidden from the reader (the card's rows speak).
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PathRail } from '@/components/ui/path-rail';
import { ALLOCATION_ADVICE_STEPS } from '@/types/allocationAdvice';
import { STEP_COPY } from '@/lib/utils/allocationAdviceNarrative';

const STEPS = ALLOCATION_ADVICE_STEPS.map((step) => STEP_COPY[step].eyebrow);

describe('PathRail, path mode', () => {
  it('lists the eight steps with the current one as the only aria-current', () => {
    const { container } = render(<PathRail mode="path" steps={STEPS} current={2} />);
    const list = screen.getByRole('list', { name: 'Il percorso' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe(STEP_COPY.borsa.eyebrow);
    expect(screen.queryByRole('list', { name: 'Il colloquio', hidden: true })).toBeNull();
  });

  it('keeps the interview hidden and dimmed while no round is on', () => {
    const { container } = render(<PathRail mode="path" steps={STEPS} current={7} interview={{ total: 3, reached: null }} />);
    // An aria-hidden element has no accessible name (accname step 2A): the reader cannot find
    // it by name, and neither can the query; the DOM holds it.
    expect(screen.queryByRole('list', { name: 'Il colloquio' })).toBeNull();
    expect(screen.getAllByRole('list')).toHaveLength(1);
    const interview = container.querySelector('ol[aria-label="Il colloquio"]') as HTMLElement;
    expect(screen.getAllByRole('list', { hidden: true })).toContain(interview);
    expect(interview.getAttribute('aria-hidden')).toBe('true');
    expect(interview.className).toContain('opacity-50');
    expect(within(interview).getAllByRole('listitem', { hidden: true })).toHaveLength(3);
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Il percorso' }).contains(current[0])).toBe(true);
  });

  it('moves the current step onto the round being asked, the ones before it lit (decision 86)', () => {
    const { container } = render(<PathRail mode="path" steps={STEPS} current={7} interview={{ total: 3, reached: 2 }} />);
    const interview = screen.getByRole('list', { name: 'Il colloquio' });
    const items = within(interview).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Tornata 1 di 3', 'Tornata 2 di 3', 'Tornata 3 di 3']);
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(items[1]);
    expect(screen.getByRole('list', { name: 'Il percorso' }).querySelector('[aria-current]')).toBeNull();
    const tickOf = (item: HTMLElement) => item.querySelector('span[aria-hidden]')?.className ?? '';
    expect(tickOf(items[0])).toContain('var(--ai-accent)');
    expect(tickOf(items[1])).toContain('var(--ai-accent)');
    expect(tickOf(items[2])).not.toContain('var(--ai-accent)');
  });

  it('is a «Dove sei» landmark as tall as the run’s strip below desktop, so the card does not move (2026-11-07)', () => {
    render(<PathRail mode="path" steps={STEPS} current={0} />);
    const rail = screen.getByRole('navigation', { name: 'Dove sei' });
    expect(rail.className).toContain('h-6');
    expect(rail.className).toContain('desktop:h-auto');
  });
});

describe('PathRail, run mode', () => {
  it('is hidden from the reader and follows the four states', () => {
    const { container } = render(
      <PathRail
        mode="run"
        stages={[
          { label: 'Leggo', state: 'done' },
          { label: 'Propongo', state: 'active' },
          { label: 'Cerco', state: 'failed' },
          { label: 'Rivedo', state: 'pending' },
        ]}
      />
    );
    const list = container.querySelector('ol[aria-label="Le fasi"]');
    expect(list?.getAttribute('aria-hidden')).toBe('true');
    // No landmark around a hidden list: a reader would be offered an empty «Dove sei» (2026-11-07).
    expect(screen.queryByRole('navigation', { hidden: true })).toBeNull();
    expect(container.firstElementChild?.className).toContain('h-6');
    const items = Array.from(list?.querySelectorAll('li') ?? []);
    expect(items.map((item) => item.getAttribute('data-state'))).toEqual(['done', 'active', 'failed', 'pending']);
    const fillOf = (item: Element) => item.querySelector('[data-fill]')?.className ?? '';
    expect(fillOf(items[1])).toContain('var(--ai-accent)');
    expect(fillOf(items[1])).toContain('scale-x-100');
    expect(fillOf(items[3])).toContain('scale-x-0');
    expect(fillOf(items[2])).toContain('bg-destructive');
  });
});
