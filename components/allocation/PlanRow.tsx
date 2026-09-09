/**
 * PlanRow — one row of an action plan, at any depth.
 *
 * "Versa" and "Preleva" are the same three-level tree (class → sub-category → instrument) with the
 * sign flipped, so they share this renderer rather than drifting apart. Depth drives indentation
 * and type scale; `direction` drives the sign and the leaf caption.
 *
 * Inside the Piano tile the row is the tile's own type scale (DESIGN.md → Tile: rows at 13px,
 * captions at 11px) — a 14px name in a 13px tile would read as a second system. The tree is
 * kept flat on purpose: the depth is the indent, never a box, because the plan is one answer
 * read top to bottom, not three nested cards. Amounts drop their cents (the reading above the
 * rows already does, and a plan to the cent is false precision on an estimate).
 *
 * The leaf caption is NOT a percentage on purpose. A weight only means something where a target
 * exists — at class and sub-category level. An instrument's percentage would be its share of its
 * own sub-category, which reads "100%" whenever it is the only instrument there: it looks like
 * "you keep everything". What you want at the instrument level is the resulting position.
 */
'use client';

import { formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { MIN_VISIBLE_AMOUNT } from '@/lib/utils/allocazioneSummary';
import type { PlanNode } from '@/lib/utils/allocationUtils';

// The threshold now lives with the plan builder (`allocazioneSummary.ts`), which filters the top
// level with it; it is re-exported so the callers that still import it from here keep compiling.
export { MIN_VISIBLE_AMOUNT };

export type PlanDirection = 'contribute' | 'withdraw';

interface PlanRowProps {
  node: PlanNode;
  depth: 0 | 1 | 2;
  /** Theme-resolved color for the moved amount. Resolve once per tile, never per row. */
  color: string;
  direction: PlanDirection;
}

const MINUS = '−';

export function PlanRow({ node, depth, color, direction }: PlanRowProps) {
  const children = node.children.filter((child) => child.amount >= MIN_VISIBLE_AMOUNT);
  const isInstrument = depth === 2;
  const sign = direction === 'contribute' ? '+' : MINUS;

  const nameClass =
    depth === 0
      ? 'truncate text-[13px] font-medium text-foreground'
      : 'truncate text-[12px] text-muted-foreground';
  const amountClass =
    depth === 0
      ? 'font-mono text-[13px] font-semibold tabular-nums'
      : 'font-mono text-[12px] font-medium tabular-nums';
  const captionClass =
    depth === 0
      ? 'mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground'
      : 'font-mono text-[10px] tabular-nums text-muted-foreground';

  const caption = isInstrument
    ? `${direction === 'contribute' ? 'avrai' : 'restano'} ${cachedFormatCurrencyEUR(node.newValue, true)}`
    : `→ ${formatPercentage(node.newPercentage, 1)}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className={nameClass} title={node.label}>
          {node.label}
        </span>
        <div className="shrink-0 text-right">
          <p className={amountClass} style={{ color }}>
            {sign}
            {cachedFormatCurrencyEUR(node.amount, true)}
          </p>
          <p className={captionClass}>{caption}</p>
        </div>
      </div>

      {children.length > 0 && (
        <div className="mt-2 space-y-1.5 pl-4">
          {children.map((child) => (
            <PlanRow
              key={child.key}
              node={child}
              depth={depth === 0 ? 1 : 2}
              color={color}
              direction={direction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
