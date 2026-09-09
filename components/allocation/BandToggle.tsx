'use client';

/**
 * BandToggle — the rebalance band as a tile aside: ±2% | ±5% | 5/25 | Personalizza.
 *
 * WHY this form: the band is the lever that reclassifies every COMPRA/VENDI/OK on the page, but
 * it is a scope, not a question — so it sits in the Bilanciamento tile's aside in the AsideToggle
 * register (11px outline buttons, `aria-pressed`, 44px tall below `desktop:`) instead of the
 * labelled panel with a help popover that `RebalanceBandControl` was. What the band drives is now
 * said in words by the reading under it («entro la soglia del ±2% sono 2 classi su 5 fuori
 * target»), so the panel's explanatory copy became redundant the moment the tile got a reading.
 *
 * The custom value keeps the old rule: a fixed band of 2 or 5 IS its preset, any other fixed
 * value is «Personalizza», and the last custom value is remembered so re-selecting the option
 * restores it (3 by default, between the two presets). The band is session-only page state —
 * nothing is persisted, so there is no Settings write and no demo-mode concern.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { AsideToggle } from '@/components/ui/aside-toggle';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';

interface BandToggleProps {
  band: RebalanceBand;
  onChange: (band: RebalanceBand) => void;
}

type BandOptionKey = '2' | '5' | 'rule525' | 'custom';

const BAND_OPTIONS: ReadonlyArray<{ value: BandOptionKey; label: string }> = [
  { value: '2', label: '±2%' },
  { value: '5', label: '±5%' },
  { value: 'rule525', label: '5/25' },
  { value: 'custom', label: 'Personalizza' },
];

const DEFAULT_CUSTOM_PP = 3;
/** Above this a band no longer classifies anything: every class is «in linea». */
const MAX_CUSTOM_PP = 50;

/** Which option is active for the band: 2 and 5 are their presets, any other fixed value is custom. */
function activeKey(band: RebalanceBand): BandOptionKey {
  if (band.type === 'rule525') return 'rule525';
  if (band.pp === 2) return '2';
  if (band.pp === 5) return '5';
  return 'custom';
}

export function BandToggle({ band, onChange }: BandToggleProps) {
  const selected = activeKey(band);
  // Remembered so «Personalizza» restores the last custom value instead of resetting to 3.
  const [customPp, setCustomPp] = useState<number>(
    band.type === 'fixed' && selected === 'custom' ? band.pp : DEFAULT_CUSTOM_PP,
  );

  const handleSelect = (key: BandOptionKey) => {
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
    const clamped = Math.min(value, MAX_CUSTOM_PP);
    setCustomPp(clamped);
    onChange({ type: 'fixed', pp: clamped });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AsideToggle options={BAND_OPTIONS} value={selected} onChange={handleSelect} ariaLabel="Soglia di ribilanciamento" />
      {selected === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_CUSTOM_PP}
            step={0.5}
            value={customPp}
            onChange={(event) => handleCustomInput(event.target.value)}
            aria-label="Soglia personalizzata in punti percentuali"
            className="h-11 w-16 px-2 font-mono tabular-nums desktop:h-7 desktop:text-[11px]"
          />
          <span className="text-[11px] text-muted-foreground">pp</span>
        </div>
      )}
    </div>
  );
}
