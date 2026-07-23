/**
 * Generic segmented pill control (role="tablist") with roving-tabindex keyboard
 * navigation, shared by every period/view/range toggle in the Analisi page.
 *
 * Extracted from five near-identical inline implementations (AnalisiTab's period
 * pill, ConfrontoAnnualeSection's view pill, SavingsRateTrendSection's range pill,
 * AndamentoStoricoSection's granularity/category/type-view pills) — Rule of Three
 * (DEVELOPMENT_GUIDELINES.md) plus a real accessibility gap: none of the originals
 * implemented arrow-key navigation, which a `role="tab"` implies per WAI-ARIA APG.
 *
 * Roving tabindex: only the selected tab is in the Tab order (tabIndex 0); the
 * others are -1. ArrowLeft/ArrowRight move focus AND selection (automatic
 * activation — appropriate for a small, always-visible segmented control where
 * the cost of activating on arrow is low, unlike a lazy-loaded tab panel).
 */
'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SegmentedPillOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedPillProps<T extends string> {
  options: ReadonlyArray<SegmentedPillOption<T>>;
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  ariaLabel: string;
  className?: string;
}

export function SegmentedPill<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  className,
}: SegmentedPillProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndSelect = (index: number) => {
    const wrapped = (index + options.length) % options.length;
    const option = options[wrapped];
    buttonRefs.current[wrapped]?.focus();
    onChange(option.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusAndSelect(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusAndSelect(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAndSelect(0);
        break;
      case 'End':
        e.preventDefault();
        focusAndSelect(options.length - 1);
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-1 rounded-full bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            ref={(el) => { buttonRefs.current[index] = el; }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'relative px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
              isSelected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isSelected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-background shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
