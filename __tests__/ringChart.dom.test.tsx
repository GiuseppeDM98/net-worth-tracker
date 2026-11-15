/**
 * `RingChart` (components/ui/ring-chart.tsx, DESIGN.md → The Ring Rule, 2026-11-12): the text
 * alternative, one circle per part, nothing under two parts, the figure inside the hole or above the
 * ring, and the arcs that do not draw themselves on mount. The pure module is `ringChart.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

import { RingChart } from '@/components/ui/ring-chart';
import type { RingSegment } from '@/lib/utils/ringChart';

const NBSP = ' ';

const INCOME: RingSegment[] = [
  { key: 'stipendio', label: 'Stipendio', value: 2880, color: 'var(--chart-2)' },
  { key: 'dividendi', label: 'Dividendi', value: 560, color: 'var(--chart-7)' },
  { key: 'affitto', label: 'Affitto', value: 360, color: 'var(--chart-6)' },
  { key: 'altro', label: 'Altro', value: 200, color: 'var(--chart-3)' },
];

afterEach(() => {
  reducedMotion.value = false;
});

describe('RingChart', () => {
  it('C1: is one named image with one circle per part', () => {
    const { container } = render(<RingChart segments={INCOME} centerValue={4000} centerLabel="entrate" ariaLabel="Entrate per categoria" />);
    const images = container.querySelectorAll('svg[role="img"]');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('aria-label')).toBe(
      `Entrate per categoria: Stipendio 72%, Dividendi 14%, Affitto 9%, Altro 5%; entrate 4000${NBSP}€`,
    );
    expect(images[0].querySelectorAll('circle')).toHaveLength(4);
  });

  it('C2: draws nothing with a single part', () => {
    const { container } = render(
      <RingChart segments={[INCOME[0]]} centerValue={2880} centerLabel="entrate" ariaLabel="Entrate per categoria" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('C3: abbreviates the figure to what a 120px hole holds', () => {
    const { container } = render(
      <RingChart segments={INCOME} centerValue={31900} centerLabel="entrate" ariaLabel="Entrate per categoria" />,
    );
    expect(container.querySelector('[data-ring]')?.getAttribute('data-ring-max-chars')).toBe('7');
    expect(container.querySelector('[data-ring-center="hole"]')?.textContent).toBe(`31,9k${NBSP}€`);
    expect(container.querySelector('[data-ring-center="above"]')).toBeNull();
  });

  it('C4: stands the figure above a 72px ring when no form fits, and leaves the hole empty', () => {
    const { container } = render(
      <RingChart segments={INCOME} centerValue={821} centerLabel="versati" ariaLabel="Versato" size={72} />,
    );
    expect(container.querySelector('[data-ring-center="hole"]')).toBeNull();
    const above = container.querySelector('[data-ring-center="above"]');
    expect(above?.textContent).toBe(`821${NBSP}€ versati`);
  });

  it('C5: carries the final dashes on the first render, and jumps under reduced motion', () => {
    const { container, unmount } = render(
      <RingChart segments={INCOME} centerValue={4000} centerLabel="entrate" ariaLabel="Entrate per categoria" />,
    );
    const first = container.querySelector('circle') as SVGCircleElement;
    expect(first.style.strokeDasharray).toBe('71 29');
    expect(first.style.strokeDashoffset).toBe('0');
    expect(first.style.transition).toContain('stroke-dasharray 400ms');
    unmount();

    reducedMotion.value = true;
    const reduced = render(<RingChart segments={INCOME} centerValue={4000} centerLabel="entrate" ariaLabel="Entrate per categoria" />);
    expect((reduced.container.querySelector('circle') as SVGCircleElement).style.transition).toBe('none');
  });
});
