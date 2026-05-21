'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { metricSettleTransition } from '@/lib/utils/motionVariants';

interface MetricSectionProps {
  title: string;
  description?: string;
  /** Optional eyebrow label rendered above the title in uppercase. */
  eyebrow?: string;
  /** Full-width dominant value block rendered above the flat list. */
  hero?: ReactNode;
  /** Flat list rows (MetricCard instances). Rendered inside a divided Card. */
  children?: ReactNode;
  className?: string;
  /** Section entrance stagger index (0-based). */
  sectionIndex?: number;
}

/**
 * MetricSection — Trade Republic hierarchy container.
 *
 * Layout: eyebrow (optional) → title + description → hero block → Card with divide-y rows.
 * No side-stripe accent. No card-in-a-grid layout.
 */
export function MetricSection({
  title,
  description,
  eyebrow,
  hero,
  children,
  className,
  sectionIndex = 0,
}: MetricSectionProps) {
  const sectionDelay = sectionIndex * 120;

  return (
    <motion.div
      transition={metricSettleTransition}
      className={cn('mt-10', className)}
    >
      {/* Section header */}
      <motion.div
        layout="position"
        transition={metricSettleTransition}
        className="mb-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-4 duration-500 [animation-fill-mode:both]"
        style={{ animationDelay: `${sectionDelay}ms` }}
      >
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </motion.div>

      {/* Card container: hero block at top, flat rows below divided by border */}
      <motion.div
        layout="position"
        transition={metricSettleTransition}
        className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 duration-500 [animation-fill-mode:both]"
        style={{ animationDelay: `${sectionDelay + 80}ms` }}
      >
        <Card className="overflow-hidden">
          {hero && (
            <div className="border-b border-border">
              {hero}
            </div>
          )}
          {children && (
            <div className="divide-y divide-border">
              {children}
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}
