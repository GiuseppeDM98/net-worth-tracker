import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: number | null;
  format: 'percentage' | 'currency' | 'number' | 'months';
  description?: string;
  tooltip?: string;
  isPrimary?: boolean;
}

export function MetricCard({
  title,
  value,
  format,
  description,
  tooltip,
  isPrimary = false,
}: MetricCardProps) {
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

  const formatValue = (val: number | null): string => {
    if (val === null) return 'N/D';

    switch (format) {
      case 'percentage':
        return formatPercentage(val);
      case 'currency':
        return formatCurrency(val);
      case 'number':
        return val.toFixed(2);
      case 'months':
        const years = Math.floor(val / 12);
        const months = val % 12;
        if (years > 0) return `${years}a ${months}m`;
        return `${months}m`;
      default:
        return val.toString();
    }
  };

  const getValueColor = (val: number | null): string => {
    if (val === null) return 'text-muted-foreground';
    if (format === 'percentage' || format === 'number') {
      if (val > 0) return 'text-green-600 dark:text-green-400';
      if (val < 0) return 'text-red-600 dark:text-red-400';
    }
    return 'text-foreground';
  };

  return (
    <Card className={cn(isPrimary && 'border-primary')}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
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
              <div className="absolute right-0 top-6 z-50 w-72 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
                <p>{tooltip}</p>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', getValueColor(value))}>
          {formatValue(value)}
        </div>
        {description && (
          <CardDescription className="mt-1 text-xs">{description}</CardDescription>
        )}
      </CardContent>
    </Card>
  );
}
