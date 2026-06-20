/**
 * RebalanceBandControl — tunable drift tolerance (B4).
 *
 * The ±2 p.p. threshold is baked into the server's `action`; here the user can widen,
 * tighten, or switch to the classic "5/25 rule" (rebalance at 5 p.p. absolute OR 25%
 * relative, whichever is tighter). Changing it re-derives every COMPRA/VENDI/OK across
 * the page — hero verdict, plan, and breakdown chips — via `applyRebalanceBand`.
 *
 * Band is session-only state owned by the page (default ±2% = current behaviour); it is
 * not persisted, so there is no Settings write and no demo-mode concern.
 *
 * Segmented pill = DESIGN.md "Segmented Pill Control, Variant B (text tabs)".
 */
'use client';

import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';

interface RebalanceBandControlProps {
  band: RebalanceBand;
  onChange: (band: RebalanceBand) => void;
}

type OptionKey = '2' | '5' | 'rule525' | 'custom';

const OPTIONS: { key: OptionKey; label: string }[] = [
  { key: '2', label: '±2%' },
  { key: '5', label: '±5%' },
  { key: 'rule525', label: '5/25' },
  { key: 'custom', label: 'Personalizza' },
];

/** Which pill is active for the current band. A fixed band of 2 or 5 maps to its preset;
 *  any other fixed value is "custom". */
function activeKey(band: RebalanceBand): OptionKey {
  if (band.type === 'rule525') return 'rule525';
  if (band.pp === 2) return '2';
  if (band.pp === 5) return '5';
  return 'custom';
}

export function RebalanceBandControl({ band, onChange }: RebalanceBandControlProps) {
  const reducedMotion = useReducedMotion();
  const layoutId = useId();
  const selected = activeKey(band);
  // Remember the last custom value so re-selecting "Personalizza" restores it.
  const [customPp, setCustomPp] = useState<number>(
    band.type === 'fixed' && band.pp !== 2 && band.pp !== 5 ? band.pp : 3
  );

  const handleSelect = (key: OptionKey) => {
    switch (key) {
      case '2':
        onChange({ type: 'fixed', pp: 2 });
        break;
      case '5':
        onChange({ type: 'fixed', pp: 5 });
        break;
      case 'rule525':
        onChange({ type: 'rule525' });
        break;
      case 'custom':
        onChange({ type: 'fixed', pp: customPp });
        break;
    }
  };

  const handleCustomInput = (raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    const clamped = Math.min(value, 50);
    setCustomPp(clamped);
    onChange({ type: 'fixed', pp: clamped });
  };

  return (
    <div className="flex flex-col gap-x-4 gap-y-3 rounded-xl border border-border bg-muted/30 px-4 py-3 desktop:flex-row desktop:items-center desktop:justify-between">
      {/* Label + what it drives — so the lever that reclassifies the whole page is visible. */}
      <div className="flex items-start gap-1.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Soglia di ribilanciamento
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  aria-label="Cosa significa la soglia di ribilanciamento"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="max-w-[280px] text-sm leading-relaxed">
                La soglia decide quando una classe è &quot;fuori target&quot;: oltre lo scostamento
                indicato scatta COMPRA o VENDI. La regola 5/25 usa 5 punti assoluti oppure il 25%
                relativo al target, a seconda di quale sia più stringente.
              </PopoverContent>
            </Popover>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Decide quando una classe diventa COMPRA o VENDI nel verdetto e nel piano.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="tablist"
        aria-label="Soglia di ribilanciamento"
        className="flex items-center gap-1 rounded-lg bg-muted p-1"
      >
        {OPTIONS.map((option) => {
          const isActive = selected === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelect(option.key)}
              className={cn(
                'relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId={`band-pill-${layoutId}`}
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>

      {selected === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={50}
            step={0.5}
            value={customPp}
            onChange={(e) => handleCustomInput(e.target.value)}
            aria-label="Soglia personalizzata in punti percentuali"
            className="h-8 w-20 font-mono text-sm tabular-nums"
          />
          <span className="text-xs text-muted-foreground">p.p.</span>
        </div>
      )}
      </div>
    </div>
  );
}
