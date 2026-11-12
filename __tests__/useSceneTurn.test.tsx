/**
 * `useSceneTurn` (components/allocation/consulente/useSceneTurn.ts, 2026-11-08): the direction of a
 * turn as state, and the focus that moves to the new screen's target only when the reader left it
 * where the gesture did — or anyway, with `always`.
 */

import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useSceneTurn } from '@/components/allocation/consulente/useSceneTurn';

let api: ReturnType<typeof useSceneTurn<HTMLParagraphElement>> | null = null;

function Host() {
  const target = useRef<HTMLParagraphElement>(null);
  const turn = useSceneTurn(target);
  // Handed to the test after the render, never during it (react-hooks/globals).
  useEffect(() => {
    api = turn;
  });
  return (
    <div>
      <p ref={target} tabIndex={-1} data-direction={turn.direction}>
        Titolo
      </p>
      <button type="button">Avanti</button>
      <input aria-label="Campo" />
    </div>
  );
}

describe('useSceneTurn', () => {
  it('move sets the direction and runs the effect', () => {
    render(<Host />);
    const effects: string[] = [];
    act(() => api!.move(-1, () => effects.push('dispatch')));
    expect(screen.getByText('Titolo').getAttribute('data-direction')).toBe('-1');
    expect(effects).toEqual(['dispatch']);
    act(() => api!.move(1, () => {}));
    expect(screen.getByText('Titolo').getAttribute('data-direction')).toBe('1');
  });

  it('focusTarget focuses when the focus is still where the gesture left it', () => {
    render(<Host />);
    screen.getByRole('button', { name: 'Avanti' }).focus();
    act(() => api!.move(1, () => {}));
    act(() => api!.focusTarget(api!.turn));
    expect(document.activeElement).toBe(screen.getByText('Titolo'));
  });

  it('focusTarget focuses when the focus fell on body', () => {
    render(<Host />);
    screen.getByRole('button', { name: 'Avanti' }).focus();
    act(() => api!.move(1, () => {}));
    (document.activeElement as HTMLElement).blur();
    act(() => api!.focusTarget(api!.turn));
    expect(document.activeElement).toBe(screen.getByText('Titolo'));
  });

  it('does not move a focus the reader moved, unless `always`', () => {
    render(<Host />);
    screen.getByRole('button', { name: 'Avanti' }).focus();
    act(() => api!.move(1, () => {}));
    screen.getByRole('textbox', { name: 'Campo' }).focus();
    act(() => api!.focusTarget(api!.turn));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Campo' }));

    act(() => api!.move(1, () => {}, { always: true }));
    screen.getByRole('textbox', { name: 'Campo' }).focus();
    act(() => api!.focusTarget(api!.turn));
    expect(document.activeElement).toBe(screen.getByText('Titolo'));
  });

  it('nothing moves without a turn', () => {
    render(<Host />);
    screen.getByRole('button', { name: 'Avanti' }).focus();
    act(() => api!.focusTarget(api!.turn));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avanti' }));
  });

  // The race of 2026-11-12: «Avvia il colloquio» pressed while the summary was still sliding in.
  // The summary's own slide landed AFTER the gesture and took the focus meant for the interview's
  // headline, which then never got it (the focus ended on body). Only the scene rendered by the
  // turn — the one carrying the new `turn` — may take it.
  it('a scene already on screen at the gesture never takes the focus; the scene of the turn does', () => {
    render(<Host />);
    screen.getByRole('button', { name: 'Avanti' }).focus();
    const before = api!.turn;
    act(() => api!.move(1, () => {}));
    act(() => api!.focusTarget(before));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Avanti' }));
    act(() => api!.focusTarget(api!.turn));
    expect(document.activeElement).toBe(screen.getByText('Titolo'));
  });
});
