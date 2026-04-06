import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';
import { metricSettleTransition } from '@/lib/utils/motionVariants';

interface MetricCardProps {
  title: string;
  value: number | null;
  format: 'percentage' | 'currency' | 'number' | 'months';
  subtitle?: string;
  description?: string;
  tooltip?: string;
  isPrimary?: boolean;
  /** Optional label chip (e.g. "Avanzato") to signal that the metric requires domain knowledge. */
  badge?: string;
}

/**
 * Displays a performance metric with optional formatting, tooltip, and color coding.
 *
 * Supports multiple display formats (percentage, currency, number, months) and
 * automatically applies color coding for positive/negative values when appropriate.
 * Includes an optional help icon with click-to-reveal tooltip.
 *
 * @param title - Metric name displayed in card header
 * @param value - Numeric value to display (null shows "N/D")
 * @param format - How to format the value: percentage, currency, number, or months
 * @param subtitle - Optional text displayed below the value
 * @param description - Optional longer description text
 * @param tooltip - Optional help text shown when clicking the info icon
 * @param isPrimary - If true, applies primary border styling to highlight the card
 * @param badge - Optional label chip displayed below the title (e.g. "Avanzato")
 */
export function MetricCard({
  title,
  value,
  format,
  subtitle,
  description,
  tooltip,
  isPrimary = false,
  badge,
}: MetricCardProps) {
  // === Tooltip State Management ===

  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip]);

  // === Value Formatting ===

  /**
   * Formats the metric value based on the specified format type.
   *
   * Supports four format types:
   * - percentage: Uses formatPercentage helper (e.g., "12.34%")
   * - currency: Uses formatCurrency helper (e.g., "€1,234.56")
   * - number: Fixed 2 decimal places (e.g., "1.23")
   * - months: Converts to years + months format (e.g., "2a 3m" for 27 months)
   *
   * @param val - The numeric value to format (null returns "N/D")
   * @returns Formatted string representation of the value
   */
  const formatValue = (val: number | null): string => {
    if (val === null) return 'N/D';

    switch (format) {
      case 'percentage':
        return formatPercentage(val);
      case 'currency':
        return formatCurrency(val);
      case 'number':
        return val.toFixed(2);
      case 'months': {
        // Round to the nearest integer first: during count-up animation the value is
        // a float (e.g. 13.5), and `float % 12` would produce fractional months
        // like "1a 1.5m" instead of clean integers like "1a 2m".
        const totalMonths = Math.round(val);
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        if (years > 0) return `${years}a ${months}m`;
        return `${months}m`;
      }
      default:
        return val.toString();
    }
  };

  // === Value Coloring ===

  /**
   * Determines text color based on value and format type.
   *
   * Color strategy:
   * - Percentage and number formats: green for positive, red for negative
   * - Currency and months formats: use default foreground color
   * - Null values: use muted foreground color
   *
   * @param val - The numeric value to evaluate
   * @returns Tailwind CSS color class string
   */
  const getValueColor = (val: number | null): string => {
    if (val === null) return 'text-muted-foreground';
    if (format === 'percentage' || format === 'number') {
      if (val > 0) return 'text-green-600 dark:text-green-400';
      if (val < 0) return 'text-red-600 dark:text-red-400';
    }
    return 'text-foreground';
  };

  // Animate once from 0 to the target on first meaningful data load.
  // `once: true` prevents re-triggering on React Query cache refreshes or rapid
  // re-renders: without it, the 60ms startDelay window is cancelled and restarted
  // on each update, so the user never sees the full count-up on first load.
  const animatedValue = useCountUp(value, {
    duration: isPrimary ? 560 : 460,
    once: true,
  });

  // === Rendering ===

  return (
    <motion.div
      layout
      transition={metricSettleTransition}
      className="h-full"
    >
    <Card className={cn(
      'h-full transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md',
      isPrimary && 'border-primary shadow-sm'
    )}>
      {/* items-start keeps the help icon pinned top-right when the title wraps
          or a badge chip is present below it. */}
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {badge && (
            <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 font-normal text-muted-foreground border-muted-foreground/30">
              {badge}
            </Badge>
          )}
        </div>
        {tooltip && (
          <div className="relative" ref={tooltipRef}>
            <button
              type="button"
              className="cursor-help hover:text-foreground transition-colors"
              onClick={() => setShowTooltip(!showTooltip)}
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </button>
            {showTooltip && (
              <div className="absolute right-0 top-6 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
                <p>{tooltip}</p>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* isPrimary cards use a larger value to visually dominate the section
            and signal to the eye which metrics deserve attention first. */}
        <motion.div
          layout="position"
          transition={metricSettleTransition}
          className={cn('font-bold tabular-nums', isPrimary ? 'text-3xl' : 'text-2xl', getValueColor(value))}
        >
          {formatValue(animatedValue)}
        </motion.div>
        {subtitle && (
          <motion.p
            layout="position"
            transition={metricSettleTransition}
            className="text-xs text-muted-foreground mt-1 font-medium"
          >
            {subtitle}
          </motion.p>
        )}
        {description && (
          <CardDescription className="mt-1 text-xs">{description}</CardDescription>
        )}
      </CardContent>
    </Card>
    </motion.div>
  );
}
