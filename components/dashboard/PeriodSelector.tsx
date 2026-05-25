'use client';

import { motion } from 'framer-motion';

const PERIODS = ['1M', '3M', '6M', 'YTD', '1A', '3A', 'All'] as const;
export type SparklinePeriod = typeof PERIODS[number];

interface PeriodSelectorProps {
  value: SparklinePeriod;
  onChange: (p: SparklinePeriod) => void;
}

/**
 * Period selector pill for the hero sparkline.
 * Framer Motion layoutId="period-pill" produces a spring-animated
 * sliding background pill (spring 400/35 — same as all other tab pickers in the app).
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div role="tablist" className="flex bg-muted rounded-lg p-[3px] gap-px">
      {PERIODS.map(p => (
        <button
          key={p}
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className="relative flex-1 py-[5px] rounded-md text-[10.5px] font-medium
            text-muted-foreground aria-selected:text-foreground transition-colors duration-150"
        >
          {value === p && (
            <motion.div
              layoutId="period-pill"
              className="absolute inset-0 bg-card rounded-md shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
          <span className="relative z-10">{p}</span>
        </button>
      ))}
    </div>
  );
}
