/**
 * `Tile`'s `generated` (components/ui/tile.tsx, 2026-11-07): what the model wrote carries the accent
 * surface and the accent eyebrow, in the open tile and in the closed row; a failed row keeps its
 * red. Without the flag, nothing of the accent.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tile } from '@/components/ui/tile';
import { AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';

const collapse = (failed: boolean) => ({ id: 't', open: true, mounted: true, failed, onOpenChange() {} });

describe('Tile generated', () => {
  it('marks the open tile and colours its eyebrow', () => {
    render(
      <Tile eyebrow="Il report" generated>
        <p>testo</p>
      </Tile>
    );
    const region = screen.getByRole('region', { name: 'Il report' });
    expect(region.hasAttribute('data-generated')).toBe(true);
    expect(region.className).toContain(AI_GENERATED_SURFACE_CLASS);
    expect(screen.getByRole('heading', { name: 'Il report' }).className).toContain(AI_GENERATED_EYEBROW_CLASS);
  });

  it('leaves a plain tile without the accent', () => {
    render(
      <Tile eyebrow="Il report">
        <p>testo</p>
      </Tile>
    );
    const region = screen.getByRole('region', { name: 'Il report' });
    expect(region.hasAttribute('data-generated')).toBe(false);
    expect(region.className).not.toContain('var(--ai-accent)');
    expect(screen.getByRole('heading', { name: 'Il report' }).className).not.toContain('var(--ai-accent)');
  });

  it('marks the closed row too, the red of a failed read winning over the accent', () => {
    const { container, rerender } = render(
      <Tile eyebrow="Il report" generated collapse={collapse(false)}>
        <p>testo</p>
      </Tile>
    );
    const region = screen.getByRole('region', { name: 'Il report' });
    expect(region.hasAttribute('data-generated')).toBe(true);
    expect(region.className).toContain(AI_GENERATED_SURFACE_CLASS);
    const label = () => container.querySelector('h3 button > span') as HTMLElement;
    expect(label().className).toContain(AI_GENERATED_EYEBROW_CLASS);
    rerender(
      <Tile eyebrow="Il report" generated collapse={collapse(true)}>
        <p>testo</p>
      </Tile>
    );
    expect(label().className).toContain('text-destructive');
    expect(label().className).not.toContain(AI_GENERATED_EYEBROW_CLASS);
  });
});
