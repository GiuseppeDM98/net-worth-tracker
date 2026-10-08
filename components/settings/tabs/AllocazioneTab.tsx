'use client';

/**
 * Impostazioni › Allocazione — the total as a tile, the formula's state, the editable target
 * list at the tile's cadence. The default tab, always mounted by the page (Radix still unmounts
 * its content while another tab is open).
 *
 * A controlled view of the `allocazione` slice: `slice` in, `onChange(patch)` for the root fields
 * (age, rate, the switch, the cash pair) and `onClassChange(assetClass, patch)` for a class row.
 * The numbers (total, the formula's pair, the first broken rule) are the draft module's pure
 * functions; the words are settingsNarrative's. Nothing is held here but the focus «Salva»
 * asked for: `pendingFocus` names a field, the view focuses it an animation frame after the
 * commit that opened its group and showed this tab, and says so (`onFocusConsumed`).
 */

import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/services/chartService';
import { isTargetTotalValid } from '@/lib/utils/allocationTargetValidation';
import { describeAllocationTotal, describeAutoCalc, describeClassTargets } from '@/lib/utils/settingsNarrative';
import {
  findSliceTargetProblem,
  resolveFormulaSplit,
  SETTINGS_CLASS_ORDER,
  sumClassTargets,
  sumOtherClassTargets,
  type AllocazioneSlice,
  type AssetClassDraft,
} from '@/lib/utils/settingsDraft';
import type { AssetClass } from '@/types/assets';
import { AllocationClassEditor } from '@/components/settings/allocation/AllocationClassEditor';
import { DeclarationRow, INTERACTIVE_CONTROL_CLASS, pctLabel, SettingsTabPanel } from './shared';

export interface AllocazioneTabProps {
  slice: AllocazioneSlice;
  onChange: (patch: Partial<Omit<AllocazioneSlice, 'classes'>>) => void;
  onClassChange: (assetClass: AssetClass, patch: Partial<AssetClassDraft>) => void;
  /** The field «Salva» wants focused (its group already open in `slice`), or `null`. */
  pendingFocus: string | null;
  onFocusConsumed: () => void;
}

export function AllocazioneTab({ slice, onChange, onClassChange, pendingFocus, onFocusConsumed }: AllocazioneTabProps) {
  const { userAge, riskFreeRate, autoCalculate, cashUseFixedAmount, cashFixedAmount, classes } = slice;

  // The pending focus, consumed after the commit that opened the group and showed the tab (an
  // animation frame later, so the scroll lands on the field's final position). The dispatch
  // runs inside the frame callback, never in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!pendingFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById(pendingFocus);
      if (field) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        field.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        field.focus({ preventScroll: true });
      }
      onFocusConsumed();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFocus, onFocusConsumed]);

  const total = sumClassTargets(slice);
  const isValidTotal = isTargetTotalValid(total);
  // Derived, read-only target leverage = Σtarget / 100 (mirrors deriveTargetLeverageRatio). Shown
  // when the user has actually set leverage (> 1); the app never stores a manual leverage input.
  const derivedTargetLeverage = total > 0 ? total / 100 : 1;
  const hasTargetLeverage = derivedTargetLeverage > 1.005;

  // ── Reading-line inputs (numbers from the draft module, words from settingsNarrative) ──
  const formulaSplit = resolveFormulaSplit(slice);
  const otherClassTotal = sumOtherClassTargets(slice);
  const classesWithSubcategories = SETTINGS_CLASS_ORDER.filter(
    (assetClass) => classes[assetClass]?.subCategoryEnabled && (classes[assetClass]?.subTargets.length ?? 0) > 0
  ).length;
  const classesWithTarget = Object.values(classes).filter((draft) => draft && draft.targetPercentage > 0).length;
  // The first rule «Salva» would refuse, stated live in the Target per classe reading.
  const targetProblem = findSliceTargetProblem(slice);

  return (
    <SettingsTabPanel tab="allocazione" label="Allocazione">
      {/* Allocazione target — the plan's one number */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
        <Tile
          eyebrow="Allocazione target"
          aside="capitale investito"
          reading={describeAllocationTotal({
            total,
            isValid: isValidTotal,
            leverageRatio: derivedTargetLeverage,
            hasLeverage: hasTargetLeverage,
            cashUseFixedAmount,
            cashFixedAmount,
          })}
        >
          <div className="mt-3.5 flex items-end gap-3">
            <p
              className={cn(
                'font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums',
                isValidTotal ? 'text-foreground' : 'text-destructive'
              )}
            >
              {pctLabel(total)}
            </p>
            {hasTargetLeverage && (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[12px] font-medium tabular-nums">
                Leva {formatNumber(derivedTargetLeverage, 2)}×
              </span>
            )}
            {cashUseFixedAmount && (
              <span className="pb-0.5 text-[11px] text-muted-foreground">esclusa liquidità fissa</span>
            )}
          </div>
          <div className="mt-3.5 flex flex-col divide-y divide-border">
            <DeclarationRow label="Classi con target > 0" value={`${classesWithTarget} su ${SETTINGS_CLASS_ORDER.length}`} />
            <DeclarationRow
              label="Sottocategorie configurate"
              value={classesWithSubcategories === 1 ? '1 classe' : `${classesWithSubcategories} classi`}
            />
            {!isValidTotal && (
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-[13px] text-destructive">Residuo da allocare</span>
                <span className="font-mono text-[13px] font-semibold tabular-nums text-destructive">
                  {pctLabel(Math.abs(100 - total))}
                </span>
              </div>
            )}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Le percentuali si applicano al patrimonio ribilanciabile: gli asset «esclusi dal ribilanciamento» non
            entrano. Per escludere un asset (casa, fondo pensione) usa il suo ruolo in Patrimonio, non un target qui.
          </div>
        </Tile>
      </div>

      {/* Auto-calcolo — the formula's switch WITH the two inputs it reads. They used to live
          in Preferenze › Profilo, and the switch stayed disabled until a field on another tab
          was filled in: a dependency the reader had to remember (critique of 2026-09-22). */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
        <Tile
          eyebrow="Auto-calcolo Azioni / Obbligazioni"
          reading={describeAutoCalc({
            enabled: autoCalculate,
            userAge,
            riskFreeRate,
            equityPct: formulaSplit?.equityPercentage,
            bondsPct: formulaSplit?.bondsPercentage,
            otherTotal: otherClassTotal,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="userAge" className="text-[13px] font-medium">Età</Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">In anni compiuti</p>
              </div>
              <Input
                id="userAge"
                type="number"
                min="0"
                max="120"
                value={userAge || ''}
                onChange={(e) => onChange({ userAge: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="anni"
                className={cn('w-24 shrink-0 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="riskFreeRate" className="text-[13px] font-medium">Risk-free rate</Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Il rendimento del{' '}
                  <a
                    href="https://www.investing.com/rates-bonds/italy-10-year-bond-yield"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={TILE_FOOTER_ACTION_CLASS}
                  >
                    BTP 10 anni
                  </a>
                  ; vale anche per Sharpe e Sortino
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  id="riskFreeRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={riskFreeRate || ''}
                  onChange={(e) => onChange({ riskFreeRate: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="tasso"
                  className={cn('w-24 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="autoCalculate" className="text-[13px] font-medium">Calcolo automatico</Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Formula di{' '}
                  <a
                    href="https://www.youtube.com/channel/UCNp1e5n6rlnfm5aWbHe3cJw"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={TILE_FOOTER_ACTION_CLASS}
                  >
                    The Bull
                  </a>
                  : 125 {'−'} età {'−'} (tasso {'×'} 5) = % Azioni
                </p>
              </div>
              <Switch
                id="autoCalculate"
                checked={autoCalculate}
                onCheckedChange={(checked) => onChange({ autoCalculate: checked })}
                disabled={userAge === undefined || riskFreeRate === undefined}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Le altre classi scalano dalle Azioni; le Obbligazioni prendono il residuo.
          </div>
        </Tile>
      </div>

      {/* Target per classe — the editable list at the tile's cadence */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <Tile
          eyebrow="Target per classe"
          aside={
            <span className="font-mono tabular-nums">
              totale {pctLabel(total)}
              {cashUseFixedAmount && ' (esclusa liquidità)'}
            </span>
          }
          reading={describeClassTargets({
            classCount: SETTINGS_CLASS_ORDER.length,
            withSubcategories: classesWithSubcategories,
            problem: targetProblem,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            {SETTINGS_CLASS_ORDER.map((assetClass) => {
              const draft = classes[assetClass];
              if (!draft) return null;
              return (
                <AllocationClassEditor
                  key={assetClass}
                  assetClass={assetClass}
                  draft={draft}
                  isAutoCalculated={autoCalculate && (assetClass === 'equity' || assetClass === 'bonds')}
                  cash={
                    assetClass === 'cash'
                      ? {
                          useFixedAmount: cashUseFixedAmount,
                          fixedAmount: cashFixedAmount,
                          onUseFixedAmount: (value) => onChange({ cashUseFixedAmount: value }),
                          onFixedAmount: (value) => onChange({ cashFixedAmount: value }),
                        }
                      : undefined
                  }
                  onChange={(patch) => onClassChange(assetClass, patch)}
                />
              );
            })}
          </div>
          <TileMethodNote
            subject="Target per classe"
            summary="«Salva» controlla il totale (almeno 100%) e ogni gruppo di sottocategorie (esattamente 100%)."
          >
            <span>Sopra il 100% il totale è una leva target: 110% vuol dire leva 1,10×.</span>
            <span>
              La liquidità come importo fisso in euro esce dal budget percentuale: le altre classi si applicano al
              patrimonio che resta.
            </span>
            <span>
              Le sottocategorie sono percentuali della loro classe; con «Abilita sottocategorie» spento la classe resta
              un blocco unico. Lo stesso vale per gli asset specifici dentro una sottocategoria.
            </span>
            <span>I target arrivano in Allocazione con «Salva», non prima.</span>
          </TileMethodNote>
        </Tile>
      </div>
    </SettingsTabPanel>
  );
}
