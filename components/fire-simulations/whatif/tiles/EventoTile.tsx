'use client';

/**
 * EVENTO — «cosa succede?»: the page's input as a tile. The four events as a 2×2 group of
 * pressed buttons, then the inputs of the active one — the months and the income sources that
 * stop for a job loss (with the hit decomposed under them), a one-off amount for a purchase or a
 * windfall, two yearly deltas for a cashflow change. Every edit is applied at once and nothing is
 * saved: the tile's footer says so.
 *
 * WHY the form is a tile and not a disclosure (the canvas's proposal, chosen 2026-08-25): on
 * this tab the event IS the question — the verdict is about what is typed here — so it sits in
 * the grid beside the answer, and on a phone it is the first tile after the verdict.
 *
 * The income picker is UI-only: the pure layer receives the SUM of the ticked sources
 * (`incomeSelection.ts`), never the categories. The decomposition of the hit — the retained
 * income covers the expenses first, the portfolio pays the uncovered part — is
 * `decomposeJobLossHit` (pure, tested); the formulas printed under each row are filled with the
 * simulation's own figures so the result stays traceable.
 */

import type { ElementType } from 'react';
import { ArrowDownUp, Briefcase, Gift, ShoppingBag } from 'lucide-react';
import type { IncomeSourceCategory } from '@/lib/services/fireService';
import type { Narrative } from '@/lib/utils/narrative';
import type { JobLossHit, WhatIfEvent } from '@/lib/utils/whatIfSummary';
import type { WhatIfEventType } from '@/types/whatIf';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { categoryLeafKeys, NO_SUBCATEGORY_ID } from '@/components/fire-simulations/whatif/incomeSelection';

const CONTROL_CLASS =
  'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

const EVENTS: { type: WhatIfEventType; label: string; icon: ElementType }[] = [
  { type: 'jobLoss', label: 'Perdita di lavoro', icon: Briefcase },
  { type: 'majorPurchase', label: 'Acquisto importante', icon: ShoppingBag },
  { type: 'cashflowChange', label: 'Risparmio e spese', icon: ArrowDownUp },
  { type: 'windfall', label: 'Entrata straordinaria', icon: Gift },
];

const compact = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);

/** The typed values, one per input, kept across event switches so nothing is lost. */
export interface WhatIfEventForm {
  monthsWithoutIncome: string;
  purchaseAmount: string;
  isPrimaryResidence: boolean;
  savingsDelta: string;
  expensesDelta: string;
  windfallAmount: string;
}

export interface IncomeSelectionProps {
  sources: IncomeSourceCategory[];
  selected: Set<string>;
  onToggleLeaf: (key: string) => void;
  onToggleCategory: (category: IncomeSourceCategory) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

interface EventoTileProps {
  /** `describeEvent(event)`. */
  reading: Narrative;
  event: WhatIfEvent;
  eventType: WhatIfEventType;
  onEventTypeChange: (type: WhatIfEventType) => void;
  form: WhatIfEventForm;
  onFormChange: (patch: Partial<WhatIfEventForm>) => void;
  /** The job-loss picker; absent when the cashflow has no categorised income. */
  incomeSelection: IncomeSelectionProps | null;
  /** `decomposeJobLossHit(...)`; null unless a job loss with months and lost income is typed. */
  jobLossHit: JobLossHit | null;
  /** The baseline figures the cashflow inputs are applied to. */
  annualSavings: number;
  annualExpenses: number;
  /** `describeEventFooter(...)`. */
  footer: Narrative;
  className?: string;
}

// Category → subcategory checkbox tree. A category with a single (unnamed) subcategory collapses
// to one row, so users with simple income tagging don't see a redundant «Generale» sub-line.
function IncomeSourcePicker({ sources, selected, onToggleLeaf, onToggleCategory, onSelectAll, onSelectNone }: IncomeSelectionProps) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Entrate che vengono a mancare</p>
        <span className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={onSelectAll} className="text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Tutte
          </button>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <button type="button" onClick={onSelectNone} className="text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Nessuna
          </button>
        </span>
      </div>
      <ul className="mt-1 flex flex-col divide-y divide-border" aria-label="Fonti di reddito">
        {sources.map((category) => {
          const leafKeys = categoryLeafKeys(category);
          const selectedCount = leafKeys.filter((key) => selected.has(key)).length;
          const categoryState = selectedCount === 0 ? false : selectedCount === leafKeys.length ? true : 'indeterminate';
          const isSingleLeaf = category.subCategories.length === 1 && category.subCategories[0].subCategoryId === NO_SUBCATEGORY_ID;
          return (
            <li key={category.categoryId} className="py-[7px]">
              <label className="flex min-h-[30px] cursor-pointer items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Checkbox checked={categoryState} onCheckedChange={() => onToggleCategory(category)} />
                  <span className={cn('truncate text-[13px]', categoryState ? 'text-foreground' : 'text-muted-foreground')}>{category.categoryName}</span>
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">{compact(category.annualAmount)}/anno</span>
              </label>
              {!isSingleLeaf && (
                <div className="mt-1.5 flex flex-col gap-1.5 pl-7">
                  {category.subCategories.map((sub) => {
                    const key = `${category.categoryId}::${sub.subCategoryId}`;
                    return (
                      <label key={key} className="flex min-h-[28px] cursor-pointer items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Checkbox checked={selected.has(key)} onCheckedChange={() => onToggleLeaf(key)} />
                          <span className="truncate text-[13px] text-muted-foreground">{sub.subCategoryName}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground/70">{compact(sub.annualAmount)}/anno</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The hit decomposed: each effect with its formula filled with the simulation's own figures. */
function JobLossEffect({ hit, months, annualSavings, lostAnnualIncome }: { hit: JobLossHit; months: number; annualSavings: number; lostAnnualIncome: number }) {
  return (
    <div className="mt-4">
      <p className={TILE_SUB_EYEBROW_CLASS}>Effetto sul patrimonio</p>
      <dl className="mt-1 flex flex-col divide-y divide-border">
        <div className="flex items-start justify-between gap-3 py-[9px]">
          <dt className="min-w-0">
            <span className="block text-[13px] text-muted-foreground">Mancati risparmi</span>
            <span className="block font-mono text-[11px] leading-[1.4] tabular-nums text-muted-foreground/70">
              min({compact(annualSavings)}; {compact(lostAnnualIncome)}) × {months}/12
            </span>
          </dt>
          <dd className="shrink-0 font-mono text-[13px] tabular-nums text-destructive">−{compact(hit.forgoneSavings)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 py-[9px]">
          <dt className="min-w-0">
            <span className="block text-[13px] text-muted-foreground">Spese dal portafoglio</span>
            <span className="block font-mono text-[11px] leading-[1.4] tabular-nums text-muted-foreground/70">
              max({compact(lostAnnualIncome)} − {compact(annualSavings)}; 0) × {months}/12
            </span>
          </dt>
          <dd className="shrink-0 font-mono text-[13px] tabular-nums text-destructive">−{compact(hit.drawnExpenses)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-[9px]">
          <dt className="text-[13px] font-medium text-foreground">Impatto sul patrimonio</dt>
          <dd className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">−{compact(hit.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function AmountField({ id, label, value, onChange, placeholder, step, hint, min }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; step: string; hint: string; min?: string }) {
  return (
    <div>
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      <Input id={id} type="number" step={step} min={min} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={CONTROL_CLASS} />
      <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function EventoTile({ reading, event, eventType, onEventTypeChange, form, onFormChange, incomeSelection, jobLossHit, annualSavings, annualExpenses, footer, className }: EventoTileProps) {
  return (
    <Tile eyebrow="Evento" aside="applicato oggi, all'anno 0" reading={reading} ariaLabel="Evento simulato" className={className}>
      <div role="group" aria-label="Tipo di evento" className="mt-3.5 grid grid-cols-2 gap-2">
        {EVENTS.map(({ type, label, icon: Icon }) => {
          const active = type === eventType;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onEventTypeChange(type)}
              aria-pressed={active}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-md border px-3 text-left text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:min-h-10',
                active ? 'border-foreground bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="leading-tight">{label}</span>
            </button>
          );
        })}
      </div>

      {eventType === 'jobLoss' && (
        <>
          <div className="mt-4 max-w-[160px]">
            <Label htmlFor="whatIfMonthsWithoutIncome" className="text-[13px]">
              Mesi senza reddito
            </Label>
            <Input
              id="whatIfMonthsWithoutIncome"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              value={form.monthsWithoutIncome}
              onChange={(e) => onFormChange({ monthsWithoutIncome: e.target.value })}
              placeholder="Es. 6"
              className={CONTROL_CLASS}
            />
          </div>
          {incomeSelection && <IncomeSourcePicker {...incomeSelection} />}
          {jobLossHit && <JobLossEffect hit={jobLossHit} months={event.months} annualSavings={annualSavings} lostAnnualIncome={event.lostAnnualIncome} />}
        </>
      )}

      {eventType === 'majorPurchase' && (
        <div className="mt-4 flex flex-col gap-4">
          <AmountField
            id="whatIfPurchaseAmount"
            label="Importo dell'acquisto (€)"
            value={form.purchaseAmount}
            onChange={(value) => onFormChange({ purchaseAmount: value })}
            placeholder="Es. 30000"
            step="1000"
            min="0"
            hint="Esborso una tantum (anticipo casa, auto)."
          />
          <div className="flex items-start justify-between gap-4 border-t border-border pt-3.5">
            <div className="min-w-0">
              <Label htmlFor="whatIfPrimaryResidence" className="text-[13px] leading-normal">
                È l&apos;abitazione principale
              </Label>
              <p className="text-[11px] leading-[1.4] text-muted-foreground">Se sì, in genere è esclusa dal patrimonio FIRE: l&apos;impatto resta pieno.</p>
            </div>
            <Switch id="whatIfPrimaryResidence" checked={form.isPrimaryResidence} onCheckedChange={(checked) => onFormChange({ isPrimaryResidence: checked })} className="mt-0.5 shrink-0" />
          </div>
        </div>
      )}

      {eventType === 'cashflowChange' && (
        <div className="mt-4 flex flex-col gap-4">
          <AmountField
            id="whatIfSavingsDelta"
            label="Variazione del risparmio annuo (€)"
            value={form.savingsDelta}
            onChange={(value) => onFormChange({ savingsDelta: value })}
            placeholder="Es. -6000"
            step="500"
            hint={`Negativo = risparmi di meno. Oggi ${compact(annualSavings)} l'anno${event.savingsDelta !== 0 ? `, diventa ${compact(event.savingsAfter)}` : ''}.`}
          />
          <AmountField
            id="whatIfExpensesDelta"
            label="Variazione delle spese annue (€)"
            value={form.expensesDelta}
            onChange={(value) => onFormChange({ expensesDelta: value })}
            placeholder="Es. 3000"
            step="500"
            hint={`Positivo = nuova spesa ricorrente, alza anche il numero FIRE. Oggi ${compact(annualExpenses)} l'anno${event.expensesDelta !== 0 ? `, diventa ${compact(event.expensesAfter)}` : ''}.`}
          />
        </div>
      )}

      {eventType === 'windfall' && (
        <div className="mt-4">
          <AmountField
            id="whatIfWindfallAmount"
            label="Importo dell'entrata (€)"
            value={form.windfallAmount}
            onChange={(value) => onFormChange({ windfallAmount: value })}
            placeholder="Es. 50000"
            step="1000"
            min="0"
            hint="Entrata una tantum (eredità, bonus, vendita)."
          />
        </div>
      )}

      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">{footer.map((segment) => segment.text).join('')}</p>
    </Tile>
  );
}
