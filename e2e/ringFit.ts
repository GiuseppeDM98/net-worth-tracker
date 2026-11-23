/**
 * The ring's figure stays INSIDE its hole (DESIGN.md → The Ring Rule, 2026-11-12, the owner's remark
 * that «31.900 €» crossed the arc): every `[data-ring-center="hole"]` under `scope` has its four
 * corners within the hole's radius of the `svg`'s centre — 38,5 of the 100 viewBox, the arc's inner
 * edge — and at most the `data-ring-max-chars` the ring declared; a ring whose figure stood above it
 * passes by construction. Read from the boxes the browser laid out, so the font that really rendered
 * is what is measured.
 *
 * A helper, not a spec: no project collects it (`testMatch`), it only exports.
 */

import { expect, type Locator } from '@playwright/test';

export async function expectRingFiguresInside(scope: Locator): Promise<void> {
  const rings = scope.locator('[data-ring]');
  await expect(rings.first()).toBeVisible();
  const fits = await rings.evaluateAll((nodes) =>
    nodes.map((node) => {
      const svg = node.querySelector('svg')!.getBoundingClientRect();
      const figure = node.querySelector('[data-ring-center="hole"]');
      if (!figure) return { inside: node.querySelector('[data-ring-center="above"]') !== null, text: 'above' };
      const box = figure.getBoundingClientRect();
      const [cx, cy, hole] = [svg.left + svg.width / 2, svg.top + svg.height / 2, (svg.width / 100) * 38.5];
      const corners = [
        [box.left, box.top],
        [box.right, box.top],
        [box.left, box.bottom],
        [box.right, box.bottom],
      ];
      const text = figure.textContent ?? '';
      return {
        inside:
          corners.every(([x, y]) => Math.hypot(x - cx, y - cy) <= hole + 0.5) &&
          text.length <= Number(node.getAttribute('data-ring-max-chars')),
        text,
      };
    }),
  );
  for (const fit of fits) expect(fit, JSON.stringify(fit)).toMatchObject({ inside: true });
}
