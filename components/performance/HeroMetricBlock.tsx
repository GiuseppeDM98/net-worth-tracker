'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpCircle } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';
import { metricSettleTransition } from '@/lib/utils/motionVariants';
import { getMetricValueColor } from '@/lib/utils/metricColors';

export interface HeroMetricBlockProps {
  label: string;
  value: number | null;
  format: 'percentage' | 'currency' | 'number' | 'months';
  subtitle?: string;
  tooltip?: string;
  badge?: string;
  className?: string;
}

function formatValue(val: number | null, format: HeroMetricBlockProps['format']): string {
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


export function HeroMetricBlock({
  label,
  value,
  format,
  subtitle,
  tooltip,
  badge,
  className,
}: HeroMetricBlockProps) {
  const animatedValue = useCountUp(value, { duration: 620, once: true });

  return (
    <motion.div
      layout="position"
      transition={metricSettleTransition}
      className={cn('px-6 py-5', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
              {label}
            </p>
            {badge && (
              <Badge
                variant="outline"
                className="h-4 border-muted-foreground/30 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
              >
                {badge}
              </Badge>
            )}
          </div>

          <motion.p
            layout="position"
            transition={metricSettleTransition}
            className={cn(
              'font-mono text-4xl font-bold tabular-nums leading-none tracking-tight',
              getMetricValueColor(value, format)
            )}
          >
            {formatValue(animatedValue, format)}
          </motion.p>

          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {tooltip && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="mt-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label={`Mostra definizione: ${label}`}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="start"
              className="max-w-[280px] text-sm leading-relaxed"
            >
              {tooltip}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </motion.div>
  );
}
