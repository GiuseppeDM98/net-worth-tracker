/**
 * Generic segmented pill control (`tablist` or `radiogroup`) with roving-tabindex keyboard
 * navigation, shared by every period/view/range toggle in the Analisi page.
 *
 * Extracted from five near-identical inline implementations (AnalisiTab's period
 * pill, ConfrontoAnnualeSection's view pill, SavingsRateTrendSection's range pill,
 * AndamentoStoricoSection's granularity/category/type-view pills) — Rule of Three
 * (DEVELOPMENT_GUIDELINES.md) plus a real accessibility gap: none of the originals
 * implemented arrow-key navigation, which a `role="tab"` implies per WAI-ARIA APG.
 *
 * Roving tabindex: only the selected tab is in the Tab order (tabIndex 0); the
 * others are -1 — and when NO option matches the value, the first one is the Tab stop, as the
 * APG asks of a radiogroup with nothing checked. ArrowLeft/ArrowRight move focus AND selection (automatic
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
  /**
   * Blocks selection changes without removing the tabs from the accessibility
   * tree (native `disabled` would). Used e.g. by the assistant while a response
   * is streaming — the period cannot change mid-answer.
   */
  disabled?: boolean;
  /**
   * `tabs` (default) exposes `tablist`/`tab` — right where the pill switches the content of a
   * panel. `radio` exposes `radiogroup`/`radio` for a pill that picks a VALUE the whole page
   * reads (an axis year, a period): a tablist with no tabpanel is a promise the DOM cannot keep.
   * Keyboard behaviour is the same in both (roving tabindex, arrows select).
   */
  semantics?: 'tabs' | 'radio';
  /** Extra classes on every option — e.g. a 44px height below `desktop:` for a pill on a phone. */
  optionClassName?: string;
}

export function SegmentedPill<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  className,
  disabled,
  semantics = 'tabs',
  optionClassName,
}: SegmentedPillProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndSelect = (index: number) => {
    if (disabled) return;
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

  const hasSelection = options.some((option) => option.value === value);

  return (
    // `max-w-full overflow-x-auto`: an unbounded option list (one per fiscal year, one per
    // decade of a pension) scrolls inside the pill instead of pushing the page sideways; the
    // scrollbar is hidden because the pill is a control, not a region.
    <div
      role={semantics === 'radio' ? 'radiogroup' : 'tablist'}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        disabled && 'opacity-50',
        className
      )}
    >
      {options.map((option, index) => {
        const isSelected = value === option.value;
        // With no match every option used to be `tabIndex=-1` and the whole control left the Tab
        // order — on Rendimenti a custom range took the page's one axis away from the keyboard
        // (2026-09-20). Identical to before whenever a value matches, which is every other caller.
        const isTabStop = hasSelection ? isSelected : index === 0;
        return (
          <button
            key={option.value}
            ref={(el) => { buttonRefs.current[index] = el; }}
            type="button"
            role={semantics === 'radio' ? 'radio' : 'tab'}
            aria-selected={semantics === 'radio' ? undefined : isSelected}
            aria-checked={semantics === 'radio' ? isSelected : undefined}
            aria-disabled={disabled || undefined}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => {
              if (!disabled) onChange(option.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'relative shrink-0 px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
              // The inactive label is the foreground at 70%, not `text-muted-foreground`: that
              // token is tuned against `--background`, and on the pill's `bg-muted` surface it
              // measured 4,34:1 in light (below AA) on the Panoramica's period pill, 2026-09-13.
              isSelected ? 'text-foreground' : 'text-foreground/70 hover:text-foreground',
              optionClassName
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
