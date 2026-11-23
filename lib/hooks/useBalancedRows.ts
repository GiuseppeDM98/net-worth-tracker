'use client';

import { useCallback, useEffect, useState } from 'react';
import { balanceRows, type RowFillMeasure } from '@/lib/utils/rowFill';

const NONE: readonly [number, number] = [0, 0];

/**
 * What a tile marks for the fill: `data-fill-body` on the block its rows end (with `data-fill-extra`,
 * the rows drawn beyond its count at rest, and `data-fill-room`, the rows it could still draw),
 * `data-fill-list` on the box of the rows themselves, `data-fill-foot` on its footer.
 */
function readRowFill(cell: HTMLElement): RowFillMeasure | null {
  const body = cell.querySelector<HTMLElement>('[data-fill-body]');
  const list = cell.querySelector<HTMLElement>('[data-fill-list]');
  const foot = cell.querySelector<HTMLElement>('[data-fill-foot]');
  if (!body || !list || !foot) return null;
  const rows = list.querySelectorAll('li').length;
  if (rows === 0) return null;
  return {
    free: foot.getBoundingClientRect().top - body.getBoundingClientRect().bottom,
    rowHeight: list.getBoundingClientRect().height / rows,
    extra: Number(body.dataset.fillExtra ?? 0),
    room: Number(body.dataset.fillRoom ?? 0),
  };
}

/**
 * Two tiles of one grid row, each handed the rows that fill the void the other leaves it
 * (`balanceRows`, lib/utils/rowFill.ts; owner, 2026-11-23). The caller puts the two refs on the
 * grid cells and passes each number to its tile; `enabled` is false where the two are not side by
 * side, `resetKey` changes when a tile's marked parts are other elements (rows where none were).
 * The measure runs in the observer's callback — after layout, on every change of a cell, of a body
 * or of a footer — and answers the same once the rows are drawn, so it settles in one pass.
 */
export function useBalancedRows(
  enabled: boolean,
  resetKey: string,
): [left: (node: HTMLElement | null) => void, right: (node: HTMLElement | null) => void, extras: readonly [number, number]] {
  const [leftCell, setLeftCell] = useState<HTMLElement | null>(null);
  const [rightCell, setRightCell] = useState<HTMLElement | null>(null);
  const [extras, setExtras] = useState<readonly [number, number]>(NONE);
  const left = useCallback((node: HTMLElement | null) => setLeftCell(node), []);
  const right = useCallback((node: HTMLElement | null) => setRightCell(node), []);

  useEffect(() => {
    if (!enabled || !leftCell || !rightCell || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const a = readRowFill(leftCell);
      const b = readRowFill(rightCell);
      const next = a && b ? balanceRows(a, b) : NONE;
      setExtras((previous) => (previous[0] === next[0] && previous[1] === next[1] ? previous : next));
    };
    const observer = new ResizeObserver(measure);
    for (const cell of [leftCell, rightCell]) {
      observer.observe(cell);
      cell.querySelectorAll('[data-fill-body], [data-fill-foot]').forEach((part) => observer.observe(part));
    }
    return () => observer.disconnect();
  }, [enabled, leftCell, rightCell, resetKey]);

  // A triple, not an object: an object holding a callback ref reads as a ref to the React Compiler (`useElementWidth`).
  return [left, right, enabled ? extras : NONE];
}
