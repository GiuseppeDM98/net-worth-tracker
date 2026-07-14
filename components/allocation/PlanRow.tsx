/**
 * PlanRow — one row of an action plan, at any depth.
 *
 * "Versa" and "Preleva" are the same three-level tree (class → sub-category → instrument) with the
 * sign flipped, so they share this renderer rather than drifting apart. Depth drives indentation
 * and type scale; `direction` drives the sign and the leaf caption.
 *
 * The leaf caption is NOT a percentage on purpose. A weight only means something where a target
 * exists — at class and sub-category level. An instrument's percentage would be its share of its
 * own sub-category, which reads "100%" whenever it is the only instrument there: it looks like
 * "you keep everything". What you want at the instrument level is the resulting position.
 */
'use client';

import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import type { PlanNode } from '@/lib/utils/allocationUtils';

/** Rows below this amount are noise, not a plan. */
export const MIN_VISIBLE_AMOUNT = 0.5;

export type PlanDirection = 'contribute' | 'withdraw';

interface PlanRowProps {
  node: PlanNode;
  depth: 0 | 1 | 2;
  /** Theme-resolved color for the moved amount. Resolve once per panel, never per row. */
  color: string;
  direction: PlanDirection;
}

export function PlanRow({ node, depth, color, direction }: PlanRowProps) {
  const children = node.children.filter((child) => child.amount >= MIN_VISIBLE_AMOUNT);
  const isInstrument = depth === 2;
  const sign = direction === 'contribute' ? '+' : '−';

  const nameClass =
    depth === 0
      ? 'truncate text-sm font-medium text-foreground'
      : 'truncate text-xs text-muted-foreground';
  const amountClass =
    depth === 0
      ? 'font-mono text-sm font-semibold tabular-nums'
      : 'font-mono text-xs font-medium tabular-nums';
  const captionClass =
    depth === 0
      ? 'mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground'
      : 'font-mono text-[10px] tabular-nums text-muted-foreground';

  const caption = isInstrument
    ? `${direction === 'contribute' ? 'avrai' : 'restano'} ${formatCurrency(node.newValue)}`
    : `→ ${formatPercentage(node.newPercentage)}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className={nameClass} title={node.label}>
          {node.label}
        </span>
        <div className="shrink-0 text-right">
          <p className={amountClass} style={{ color }}>
            {sign}
            {formatCurrency(node.amount)}
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
