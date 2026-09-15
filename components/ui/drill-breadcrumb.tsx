/**
 * Shared clickable breadcrumb for multi-level drill-down navigation.
 *
 * Extracted so AnalisiTab's category→subcategory drill-down and
 * CashflowSankeyChart's independent type→category→subcategory drill-down speak
 * the same visual/interaction language and both support jumping to an
 * intermediate level (not just one step back at a time). Previously the Sankey
 * rendered a plain, non-clickable title string here — this component makes
 * every step but the last one a real link.
 *
 * Wrapped in <nav> so screen readers announce it as a navigation landmark.
 * The `/` separators are aria-hidden — purely visual dividers.
 */
import { Fragment } from 'react';

export interface DrillBreadcrumbStep {
  label: string;
  /** Omit for the current (last) step — it renders as plain, non-clickable text. */
  onClick?: () => void;
}

interface DrillBreadcrumbProps {
  steps: DrillBreadcrumbStep[];
  ariaLabel: string;
}

export function DrillBreadcrumb({ steps, ariaLabel }: DrillBreadcrumbProps) {
  if (steps.length === 0) return null;

  return (
    <nav aria-label={ariaLabel}>
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {steps.map((step, index) => (
          <Fragment key={`${step.label}-${index}`}>
            {index > 0 && (
              <span className="text-border" aria-hidden="true">/</span>
            )}
            {step.onClick ? (
              <button
                type="button"
                // The words stay 14px; the TARGET is 24px with a mouse and 44px on touch, folded
                // back by a negative margin so the crumb row keeps its rhythm (a «Spese» crumb
                // measured 40×20 at 1440, 2026-09-14).
                className="-my-1 inline-flex min-h-6 items-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:min-h-11"
                onClick={step.onClick}
              >
                {step.label}
              </button>
            ) : (
              <span className="text-foreground font-medium">{step.label}</span>
            )}
          </Fragment>
        ))}
      </div>
    </nav>
  );
}
