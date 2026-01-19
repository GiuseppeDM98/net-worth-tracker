import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * MetricSection - Reusable container for categorized performance metrics
 *
 * Displays a titled section with description and a responsive grid of metric cards.
 * Used to organize performance metrics into logical categories (Rendimento, Rischio, etc.)
 *
 * Layout:
 * - Mobile: 1 column
 * - Tablet (md): 2 columns
 * - Desktop (lg): 4 columns
 *
 * @param title - Category name (e.g., "Metriche di Rendimento")
 * @param description - Optional explanatory text below title
 * @param children - MetricCard components to display in grid
 * @param className - Optional additional CSS classes
 */
export function MetricSection({
  title,
  description,
  children,
  className
}: MetricSectionProps) {
  return (
    <div className={cn('mt-8', className)}>
      {/* Section Header */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {children}
      </div>
    </div>
  );
}
