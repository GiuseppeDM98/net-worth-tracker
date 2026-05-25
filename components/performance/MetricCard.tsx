'use client';

import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { HelpCircle } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';
import { metricSettleTransition } from '@/lib/utils/motionVariants';

export interface MetricCardProps {
  title: string;
  value: number | null;
  format: 'percentage' | 'currency' | 'number' | 'months';
  subtitle?: string;
  description?: string;
  tooltip?: string;
  badge?: string;
  /** @deprecated — hierarchy is now set by position (hero vs row). Kept for back-compat. */
  isPrimary?: boolean;
}

function formatValue(val: number | null, format: MetricCardProps['format']): string {
  if (val === null) return 'N/D';
  switch (format) {
    case 'percentage': return formatPercentage(val);
    case 'currency': return formatCurrency(val);
    case 'number': return val.toFixed(2);
    case 'months': {
      const total = Math.round(val);
      const years = Math.floor(total / 12);
      const months = total % 12;
      if (years > 0) return `${years}a ${months}m`;
      return `${months}m`;
    }
    default: return String(val);
  }
}

function getValueColor(val: number | null, format: MetricCardProps['format']): string {
  if (val === null) return 'text-muted-foreground';
  if (format === 'percentage' || format === 'number') {
    if (val > 0) return 'text-green-600 dark:text-green-400';
    if (val < 0) return 'text-red-600 dark:text-red-400';
  }
  return 'text-foreground';
}

/**
 * MetricCard — flat list row for secondary performance metrics.
 *
 * Used inside a divide-y Card container. Left: label + optional badge.
 * Right: value (font-mono) + optional subtitle. Popover for tooltip.
 */
export function MetricCard({
  title,
  value,
  format,
  subtitle,
  description,
  tooltip,
  badge,
}: MetricCardProps) {
  const animatedValue = useCountUp(value, { duration: 460, once: true });

  return (
    <motion.div
      layout="position"
      transition={metricSettleTransition}
      className="flex items-center justify-between gap-4 px-6 py-3.5"
    >
      {/* Left: label + badge + description */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge && (
            <Badge
              variant="outline"
              className="h-4 border-muted-foreground/30 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
            >
              {badge}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground/80 leading-snug">{description}</p>
        )}
      </div>

      {/* Right: value + subtitle + tooltip */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className={cn('font-mono text-sm font-semibold tabular-nums', getValueColor(value, format))}>
            {formatValue(animatedValue, format)}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {tooltip ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 text-muted-foreground/50 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label={`Mostra definizione: ${title}`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="center"
              className="max-w-[280px] text-sm leading-relaxed"
            >
              {tooltip}
            </PopoverContent>
          </Popover>
        ) : (
          <div className="w-3.5" />
        )}
      </div>
    </motion.div>
  );
}
