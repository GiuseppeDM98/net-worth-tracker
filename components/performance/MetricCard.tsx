import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
