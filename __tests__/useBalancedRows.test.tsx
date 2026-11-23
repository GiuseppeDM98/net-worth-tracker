/**
 * `useBalancedRows` (lib/hooks/useBalancedRows.ts, owner 2026-11-23): the hook reads the two cells'
 * marked parts (`data-fill-body`, `data-fill-list`, `data-fill-foot`) and hands each tile its extra
 * rows. jsdom lays nothing out: the rectangles and the observer are stubbed. Seen red on 2026-11-23
 * with the hook answering while disabled and with the body's `data-fill-extra` unread.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useBalancedRows } from '@/lib/hooks/useBalancedRows';

type Box = { top: number; bottom: number; height: number };

let observers: Array<() => void> = [];
const boxes = new Map<string, Box>();

beforeEach(() => {
  observers = [];
  boxes.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
        observers.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {
        observers = observers.filter((entry) => entry !== this.callback);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const box = boxes.get(this.dataset.box ?? '') ?? { top: 0, bottom: 0, height: 0 };
    return { ...box, left: 0, right: 0, width: 0, x: 0, y: box.top, toJSON: () => box } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Cell({ name, rows, extra, room, cellRef }: { name: string; rows: number; extra: number; room: number; cellRef: (node: HTMLElement | null) => void }) {
  return (
    <div ref={cellRef}>
      <div data-fill-body="" data-fill-extra={extra} data-fill-room={room} data-box={`${name}-body`}>
        <div data-fill-list="" data-box={`${name}-list`}>
          <ul>
            {Array.from({ length: rows }, (_, index) => (
              <li key={index} />
            ))}
          </ul>
        </div>
      </div>
      <div data-fill-foot="" data-box={`${name}-foot`} />
    </div>
  );
}

function Harness({ enabled }: { enabled: boolean }) {
  const [left, right, [extraLeft, extraRight]] = useBalancedRows(enabled, 'rows');
  return (
    <>
      <Cell name="left" rows={9 + extraLeft} extra={extraLeft} room={14} cellRef={left} />
      <Cell name="right" rows={10 + extraRight} extra={extraRight} room={10} cellRef={right} />
      <output>{`${extraLeft}:${extraRight}`}</output>
    </>
  );
}

/** The left tile's rows end at `432 + extra × 48`, its footer sits at 720; the right tile has no void. */
function layOut(leftExtra: number): void {
  const leftRows = 9 + leftExtra;
  boxes.set('left-list', { top: 0, bottom: leftRows * 48, height: leftRows * 48 });
  boxes.set('left-body', { top: 0, bottom: leftRows * 48, height: leftRows * 48 });
  boxes.set('left-foot', { top: 720, bottom: 760, height: 40 });
  boxes.set('right-list', { top: 0, bottom: 720, height: 720 });
  boxes.set('right-body', { top: 0, bottom: 720, height: 720 });
  boxes.set('right-foot', { top: 720, bottom: 760, height: 40 });
}

const fire = () => act(() => observers.forEach((callback) => callback()));

describe('useBalancedRows', () => {
  it('hands the shorter tile the rows of its void, and keeps them once they are drawn', () => {
    layOut(0);
    render(<Harness enabled />);
    fire();
    // 720 − 432 = 288px of void at 48px a row.
    expect(screen.getByRole('status').textContent).toBe('6:0');
    layOut(6);
    fire();
    expect(screen.getByRole('status').textContent).toBe('6:0');
  });

  it('gives nothing while disabled', () => {
    layOut(0);
    render(<Harness enabled={false} />);
    fire();
    expect(screen.getByRole('status').textContent).toBe('0:0');
  });
});
