/**
 * EmptyState — reusable empty state component with floating icon animation.
 *
 * Designed to be minimal: it communicates absence without dominating the page.
 * The float animation adds life without distracting from the surrounding content.
 *
 * Float keyframes are defined inline so this component is self-contained.
 * `motion-safe:` prefix ensures the animation stops for users who prefer reduced motion.
 */

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-8 px-4 text-center', className)}>
      {/* Float keyframes defined inline — avoids globals.css coupling */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      <div className="mb-3 text-muted-foreground/50 motion-safe:animate-[float_3s_ease-in-out_infinite]">
        {icon}
      </div>

      <p className="text-sm font-medium text-muted-foreground">{title}</p>

      {description && (
        <p className="mt-1 text-xs text-muted-foreground/70 max-w-xs">{description}</p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon set for empty states — 24×24, currentColor, monochromatic.
// Kept in this file to avoid icon sprawl; extract if reused outside EmptyState.
// ---------------------------------------------------------------------------

/** Seedling growing from soil — use for "no milestones yet" contexts. */
export function SeedlingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Stem */}
      <line x1="12" y1="20" x2="12" y2="10" />
      {/* Left leaf */}
      <path d="M12 14 C9 14 7 12 7 9 C9 9 11 11 12 14Z" fill="currentColor" stroke="none" opacity="0.4" />
      <path d="M12 14 C9 14 7 12 7 9" />
      {/* Right leaf */}
      <path d="M12 11 C15 11 17 9 17 6 C15 6 13 8 12 11Z" fill="currentColor" stroke="none" opacity="0.4" />
      <path d="M12 11 C15 11 17 9 17 6" />
      {/* Ground line */}
      <path d="M8 20 Q12 18 16 20" />
    </svg>
  );
}

/** Calendar with no events — use for "no dividends" contexts. */
export function CalendarEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Calendar body */}
      <rect x="3" y="4" width="18" height="17" rx="2" />
      {/* Header bar */}
      <line x1="3" y1="9" x2="21" y2="9" />
      {/* Binding posts */}
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      {/* Empty grid dots */}
      <circle cx="8" cy="13" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="12" cy="13" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="16" cy="13" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="8" cy="17" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" opacity="0.4" />
    </svg>
  );
}

/** Funnel with an X — use for "no results match filter" contexts. */
export function FilterEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Funnel shape */}
      <path d="M4 4h16l-6 7v6l-4-2V11Z" />
      {/* X mark overlay — indicates no match */}
      <line x1="15" y1="15" x2="19" y2="19" strokeWidth="2" />
      <line x1="19" y1="15" x2="15" y2="19" strokeWidth="2" />
    </svg>
  );
}

/** Trophy / medal outline — use for "no rankings yet" contexts. */
export function TrophyEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Cup body */}
      <path d="M6 3h12v8a6 6 0 0 1-12 0V3Z" />
      {/* Left handle */}
      <path d="M6 6H3a2 2 0 0 0 0 4h3" />
      {/* Right handle */}
      <path d="M18 6h3a2 2 0 0 1 0 4h-3" />
      {/* Stem */}
      <line x1="12" y1="17" x2="12" y2="20" />
      {/* Base */}
      <line x1="8" y1="20" x2="16" y2="20" />
    </svg>
  );
}

/** Bar chart with no bars — use for "no historical data" contexts. */
export function ChartEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Axes */}
      <line x1="3" y1="19" x2="21" y2="19" />
      <line x1="5" y1="19" x2="5" y2="4" />
      {/* Ghost bars — dashed to indicate absence */}
      <rect x="8" y="11" width="3" height="8" rx="0.5" strokeDasharray="2 2" opacity="0.4" />
      <rect x="13" y="7" width="3" height="12" rx="0.5" strokeDasharray="2 2" opacity="0.4" />
      {/* Upward trend arrow — hints at what will appear */}
      <polyline points="7 8 11 5 15 7 19 3" strokeDasharray="2 2" opacity="0.4" />
    </svg>
  );
}
