/**
 * CompositionBar — the shared part-of-whole bar (components/ui/composition-bar.tsx).
 *
 * Its four optional props (ticks, edge, legendDecimals, legendAriaLabel) were added for Analisi's
 * phone Flusso on 2026-09-27 under one contract: a caller passing none of them renders EXACTLY the
 * markup it rendered before. The legacy case below is pinned to the string develop's component
 * rendered for the same props (compared side by side once, when the props were added), so a change
 * to the shared path shows up here before it shows up on Bilanciamento, Previdenza, Composizione
 * or the goals' Allocazione derivata.
 *
 * Rendered to a string with react-dom/server: no DOM is needed to read markup.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// chartService pulls in the client Firebase SDK; the bar only needs its it-IT percentage.
vi.mock('@/lib/services/chartService', async () => {
  const { formatPercentageIt } = await import('@/lib/utils/formatters');
  return { formatPercentage: (value: number, decimals = 2) => formatPercentageIt(value, decimals) };
});

import { CompositionBar } from '@/components/ui/composition-bar';

type BarProps = Parameters<typeof CompositionBar>[0];

const render = (props: BarProps) => renderToStaticMarkup(createElement(CompositionBar, props));

const SEGMENTS = [
  { key: 'a', label: 'Azioni', pct: 60.5, color: 'var(--chart-1)' },
  { key: 'b', label: 'Obbligazioni', pct: 39.5, displayPct: 44, color: 'var(--chart-2)' },
];

const LEGACY_MARKUP =
  '<div><div class="flex h-2.5 w-full overflow-hidden rounded-[var(--costume-control-pill-radius,calc(infinity*1px))] bg-muted" role="img" aria-label="Composizione attuale">' +
  '<div class="h-full first:rounded-l-[var(--costume-control-pill-radius,calc(infinity*1px))] last:rounded-r-[var(--costume-control-pill-radius,calc(infinity*1px))]" title="Azioni · 60,50%" style="background-color:var(--chart-1);width:0px"></div>' +
  '<div class="h-full first:rounded-l-[var(--costume-control-pill-radius,calc(infinity*1px))] last:rounded-r-[var(--costume-control-pill-radius,calc(infinity*1px))]" title="Obbligazioni · 44,00%" style="background-color:var(--chart-2);width:0px"></div></div>' +
  '<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5"><li class="flex items-center gap-1.5">' +
  '<span class="h-2 w-2 shrink-0 rounded-[2px]" style="background-color:var(--chart-1)" aria-hidden="true"></span>' +
  '<span class="text-[11px] text-muted-foreground">Azioni</span><span class="font-mono text-[11px] tabular-nums text-foreground">60,50%</span></li>' +
  '<li class="flex items-center gap-1.5"><span class="h-2 w-2 shrink-0 rounded-[2px]" style="background-color:var(--chart-2)" aria-hidden="true"></span>' +
  '<span class="text-[11px] text-muted-foreground">Obbligazioni</span><span class="font-mono text-[11px] tabular-nums text-foreground">44,00%</span></li></ul></div>';

/** The class list of the edge's word, read off the markup. */
function edgeLabelClass(markup: string): string | undefined {
  return markup.match(/<span class="([^"]*text-destructive[^"]*)">entrate<\/span>/)?.[1];
}

describe('CompositionBar — a caller with none of the new props', () => {
  it('should render byte for byte what it rendered before the props existed', () => {
    expect(render({ segments: SEGMENTS, ariaLabel: 'Composizione attuale' })).toBe(LEGACY_MARKUP);
  });

  it('should render nothing for no segments, as before', () => {
    expect(render({ segments: [], ariaLabel: 'Vuota', ticks: [50], edge: { at: 10, label: 'entrate' } })).toBe('');
  });
});

describe('CompositionBar — the marks', () => {
  it('should draw each tick with its number, beside the bar rather than inside its clipped track', () => {
    const markup = render({ segments: SEGMENTS, ariaLabel: 'Quote', ticks: [50, 80] });
    expect(markup).toMatch(/^<div><div class="relative mt-6"><div class="flex h-2\.5[^"]*" role="img"/);
    expect(markup).toContain('style="left:50%"');
    expect(markup).toContain('>50</span>');
    expect(markup).toContain('>80</span>');
    // No edge: the legend keeps its own spacing.
    expect(markup).toContain('<ul class="mt-3 ');
  });

  it('should put the edge\'s word on the right of a line near the left end, so it never paints before the bar', () => {
    const markup = render({ segments: SEGMENTS, ariaLabel: 'Quote', edge: { at: 2, label: 'entrate' } });
    expect(markup).toContain('style="left:2%"');
    expect(edgeLabelClass(markup)).toContain('left-1');
    expect(edgeLabelClass(markup)).not.toContain('right-1');
    // The word hangs under the bar, so the legend steps down to clear it.
    expect(markup).toContain('<ul class="mt-6 ');
  });

  it('should put the edge\'s word on the left of a line past the middle, so it never paints after the bar', () => {
    const markup = render({ segments: SEGMENTS, ariaLabel: 'Quote', edge: { at: 97, label: 'entrate' } });
    expect(edgeLabelClass(markup)).toContain('right-1');
    expect(edgeLabelClass(markup)).not.toContain('left-1');
  });

  it('should print the legend in whole percents and name it when asked', () => {
    const markup = render({
      segments: [
        { key: 'need', label: 'Necessità', pct: 15, color: 'var(--role-need)' },
        { key: 'saving', label: 'Risparmi', pct: 85, color: 'var(--role-saving)' },
      ],
      ariaLabel: 'Quote',
      legendDecimals: 0,
      legendAriaLabel: 'Quote del flusso',
    });
    expect(markup).toContain('<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Quote del flusso">');
    expect(markup).toContain('>15%</span>');
    expect(markup).toContain('title="Risparmi · 85%"');
  });

  it('should print a segment\'s own words instead of its percentage, in the legend and in the tooltip', () => {
    // Analisi's «<1%»: a share that holds money and rounds to zero must not read «0%».
    const markup = render({
      segments: [
        { key: 'need', label: 'Necessità', pct: 0, displayText: '<1%', color: 'var(--role-need)' },
        { key: 'saving', label: 'Risparmi', pct: 100, color: 'var(--role-saving)' },
      ],
      ariaLabel: 'Quote',
      legendDecimals: 0,
    });
    expect(markup).toContain('>&lt;1%</span>');
    expect(markup).toContain('title="Necessità · &lt;1%"');
    expect(markup).not.toContain('>0%</span>');
    // A segment without words of its own keeps the formatted figure.
    expect(markup).toContain('>100%</span>');
  });
});
