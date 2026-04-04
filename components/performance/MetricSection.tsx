import { ReactNode } from 'react';
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { metricSettleTransition } from '@/lib/utils/motionVariants';

interface MetricSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Section order index used to stagger section-level entrance (0-based). */
  sectionIndex?: number;
}

/**
 * MetricSection - Reusable container for categorized performance metrics
 *
 * Displays a titled section with description and a responsive grid of metric cards.
 * Used to organize performance metrics into logical categories (Rendimento, Rischio, etc.)
 *
 * Layout:
 * - Mobile: 1 column
 * - Tablet (sm, ≥640px): 2 columns
 * - Desktop (≥1440px): 4 columns
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
  className,
  sectionIndex = 0,
}: MetricSectionProps) {
  // Delay for the whole section based on its order in the page
  const sectionDelay = sectionIndex * 120;

  return (
    <motion.div
      layout
      transition={metricSettleTransition}
      className={cn('mt-8', className)}
    >
      {/* Section Header — slides in from left; skipped when reduced-motion is preferred.
          Left-border accent creates visual hierarchy between section tiers without
          introducing decorative noise — relies on layout contrast, not color alone. */}
      <motion.div
        layout="position"
        transition={metricSettleTransition}
        className="mb-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-4 duration-500 [animation-fill-mode:both]"
        style={{ animationDelay: `${sectionDelay}ms` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-[3px] h-5 rounded-full bg-primary opacity-70 shrink-0" />
          <h2 className="text-xl font-semibold text-foreground">
            {title}
          </h2>
        </div>
        {description && (
          <p className="mt-1 pl-[15px] text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </motion.div>

      {/* Metric Cards Grid — each card fades+slides up with stagger */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 desktop:grid-cols-4">
        {React.Children.map(children, (child, i) => (
          <motion.div
            layout
            transition={metricSettleTransition}
            key={i}
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 duration-500 [animation-fill-mode:both] h-full"
            style={{ animationDelay: `${sectionDelay + 80 + i * 80}ms` }}
          >
            {child}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
