'use client';

/**
 * Impostazioni › Preferenze (`generale`) — every group is a tile: eyebrow = the group, reading =
 * ONE rule-generated state line (settingsNarrative), controls below. Order: what this tab WRITES
 * first (three rows of editable tiles), then the two read-only declarations of fields other
 * pages own. Età and risk-free rate are not here: they live in Allocazione › Auto-calcolo,
 * beside the formula whose switch they unlock (2026-09-22).
 *
 * A controlled view of the `generale` slice: `slice` in, `onChange(patch)` out. What stays
 * local is ephemeral — a recipient being typed, a test send in flight, the dev dialogs.
 */

import { useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { CreateDummySnapshotModal } from '@/components/CreateDummySnapshotModal';
import { DeleteDummyDataDialog } from '@/components/DeleteDummyDataDialog';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { resolveRitaUnlockAge, DEFAULT_INPS_RETIREMENT_AGE } from '@/lib/utils/pensionUnlock';
import type { SurfaceState } from '@/lib/utils/statesNarrative';
import {
  describeAssistantPreferences,
  describeCashflowSettings,
  describeCosts,
  describeEmails,
  describeFamily,
  describeFireToggles,
  describePerformanceBase,
  describePlanParameters,
} from '@/lib/utils/settingsNarrative';
import {
  NO_SELECTION,
  parseFamilyMemberDrafts,
  type FamilyMemberDraft,
  type GeneraleSlice,
  type SettingsDeclarations,
} from '@/lib/utils/settingsDraft';
import type { ExpenseCategory } from '@/types/expenses';
import { DeclarationRow, INTERACTIVE_CONTROL_CLASS, pctLabel, runGuarded, SettingsTabPanel } from './shared';

// The assistant is a route gated by this flag; its state tile follows the same gate.
const SHOW_ASSISTANT = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';

// The words the Assistant's own popover uses for the response styles.
const ASSISTANT_STYLE_LABELS: Record<'balanced' | 'concise' | 'deep', string> = {
  balanced: 'Bilanciato',
  concise: 'Conciso',
  deep: 'Approfondito',
};

type TestEmailType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget';

// Famiglia — a local id for a member row. CoastFireTab.tsx has an identical `createLocalId`, not
// exported; duplicated here rather than introducing a cross-module import for a one-line helper.
function createFamilyMemberId(): string {
  return `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface GeneraleTabProps {
  slice: GeneraleSlice;
  onChange: (patch: Partial<GeneraleSlice>) => void;
  /** The read-only tiles' fields (FIRE's parameters, the Assistant's preferences). */
  declarations: SettingsDeclarations;
  /** For the dev-only snapshot tools. */
  ownerId: string | undefined;
  isDemo: boolean;
  expenseCategories: ExpenseCategory[];
  categoriesState: SurfaceState;
  /** Liquidità's subcategory names when its sub-targets are on, else empty — the Costi select reads Allocazione's rows. */
  cashSubCategories: string[];
  /** The Calcolo dei rendimenti footer points at the risk-free rate, which lives in Allocazione. */
  onGoToAllocazione: () => void;
}

export function GeneraleTab({
  slice,
  onChange,
  declarations,
  ownerId,
  isDemo,
  expenseCategories,
  categoriesState,
  cashSubCategories,
  onGoToAllocazione,
}: GeneraleTabProps) {
  const {
    includePrimaryResidenceInFIRE, goalBasedInvestingEnabled, goalDrivenAllocationEnabled, stampDutyEnabled,
    stampDutyRate, checkingAccountSubCategory, cashflowHistoryStartYear, laborIncomeCategoryIds, costCentersEnabled,
    expenseSplitEnabled, performanceIncludesPensionFunds, performanceIncludesExcludedAssets, performanceExcludesCash,
    pensionReturnStartMonth, monthlyEmailEnabled, quarterlyEmailEnabled, semiAnnualEmailEnabled, yearlyEmailEnabled,
    weeklyBudgetEmailEnabled, monthlyEmailRecipients, familyMembers,
  } = slice;
  const { planParams, assistantPrefs } = declarations;

  // Ephemeral — not part of the slice: a recipient being typed, a send in flight, the dev tools.
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [sendingTestEmailType, setSendingTestEmailType] = useState<TestEmailType | null>(null);
  const [dummySnapshotModalOpen, setDummySnapshotModalOpen] = useState(false);
  const [deleteDummyDataDialogOpen, setDeleteDummyDataDialogOpen] = useState(false);
  const enableTestSnapshots = process.env.NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS === 'true';

  const incomeCategories = expenseCategories.filter((cat) => cat.type === 'income');
  const laborCategoryNames = incomeCategories.filter((cat) => laborIncomeCategoryIds.includes(cat.id)).map((cat) => cat.name);
  const familyMembersForReading = parseFamilyMemberDrafts(familyMembers);
  const inpsAgeShown = planParams.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  const ritaAgeShown = resolveRitaUnlockAge(planParams);
  const anyEmailEnabled = monthlyEmailEnabled || quarterlyEmailEnabled || semiAnnualEmailEnabled || yearlyEmailEnabled || weeklyBudgetEmailEnabled;

  // Famiglia — add/update/remove a member row, each a patch of the slice.
  const addFamilyMemberRow = () => {
    onChange({
      familyMembers: [
        ...familyMembers,
        { id: createFamilyMemberId(), name: '', grossAnnualIncome: '', isFirstEmploymentPost2007: false, firstEmploymentYear: '' },
      ],
    });
  };
  const updateFamilyMemberRow = (id: string, field: keyof Omit<FamilyMemberDraft, 'id'>, value: string | boolean) => {
    onChange({ familyMembers: familyMembers.map((member) => (member.id === id ? { ...member, [field]: value } : member)) });
  };
  const removeFamilyMemberRow = (id: string) => {
    onChange({ familyMembers: familyMembers.filter((member) => member.id !== id) });
  };

  // A recipient is a draft edit like any other: it waits for «Salva».
  const addRecipient = () => {
    const email = newEmailInput.trim();
    if (email && !monthlyEmailRecipients.includes(email)) {
      onChange({ monthlyEmailRecipients: [...monthlyEmailRecipients, email] });
      setNewEmailInput('');
    }
  };

  const sendTestEmail = async (type: TestEmailType) => {
    setSendingTestEmailType(type);
    await runGuarded(async () => {
      const res = await authenticatedFetch('/api/user/monthly-email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType: type }),
      });
      if (res.ok) {
        toast.success('Email inviata ai destinatari.');
      } else {
        const resBody = await res.json().catch(() => ({}));
        toast.error(resBody.error ?? "Errore durante l'invio");
      }
    }, () => {
      toast.error("Errore durante l'invio dell'email");
    }, () => {
      setSendingTestEmailType(null);
    });
  };

  return (
    <SettingsTabPanel tab="generale" label="Preferenze">
      {/* Calcolo dei rendimenti — measurement base + pension-return start month */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
        <Tile
          eyebrow="Calcolo dei rendimenti"
          aside="Rendimenti"
          reading={describePerformanceBase({
            includesPensionFunds: performanceIncludesPensionFunds,
            includesExcludedAssets: performanceIncludesExcludedAssets,
            excludesCash: performanceExcludesCash,
            pensionReturnStartMonth,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="performanceIncludesPensionFunds" className="text-[13px] font-medium">
                  Includi i fondi pensione
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Dentro dal mese in cui i versamenti sono tracciati: TFR, datoriale e busta paga sono flussi, non rendimento
                </p>
              </div>
              <Switch
                id="performanceIncludesPensionFunds"
                checked={performanceIncludesPensionFunds}
                onCheckedChange={(checked) => onChange({ performanceIncludesPensionFunds: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="performanceIncludesExcludedAssets" className="text-[13px] font-medium">
                  Includi gli asset esclusi
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  La casa valutata a mano non si muove mai: abbassa la volatilità e alza lo Sharpe
                </p>
              </div>
              <Switch
                id="performanceIncludesExcludedAssets"
                checked={performanceIncludesExcludedAssets}
                onCheckedChange={(checked) => onChange({ performanceIncludesExcludedAssets: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="performanceExcludesCash" className="text-[13px] font-medium">
                  Liquidità fuori dalla base
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  I conti escono dai rendimenti (restano nell&apos;Allocazione); un ETF monetario ha un prezzo e resta dentro. Gli acquisti pagati dai conti diventano flussi misurati
                </p>
              </div>
              <Switch
                id="performanceExcludesCash"
                checked={performanceExcludesCash}
                onCheckedChange={(checked) => onChange({ performanceExcludesCash: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="pensionReturnStartMonth" className="text-[13px] font-medium">
                  Rendimento del fondo calcolabile da
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Vuoto = dal primo versamento registrato
                </p>
              </div>
              <Input
                id="pensionReturnStartMonth"
                type="month"
                value={pensionReturnStartMonth}
                onChange={(e) => onChange({ pensionReturnStartMonth: e.target.value })}
                className={cn('w-40 shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Le metriche si ricalcolano alla prossima visita di Rendimenti; il risk-free di Sharpe e Sortino
            si imposta in{' '}
            <button type="button" onClick={onGoToAllocazione} className={TILE_FOOTER_ACTION_CLASS}>
              Allocazione
            </button>
            .
          </div>
        </Tile>
      </div>

      {/* Costi and FIRE e obiettivi stack beside Calcolo dei rendimenti: three tiles in one
          row left ~300px empty in the two short ones (critique of 2026-09-22). Below
          `desktop:` the wrapper dissolves and each tile is a cell of its own. */}
      <div className="contents desktop:col-span-6 desktop:flex desktop:flex-col desktop:gap-3">
      {/* Costi — imposta di bollo */}
      <div className={cn(TILE_CELL_CLASS)}>
        <Tile
          eyebrow="Costi"
          aside="stima annua"
          reading={describeCosts({ stampDutyEnabled, stampDutyRate, checkingAccountSubCategory })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <Label htmlFor="stampDutyToggle" className="text-[13px] font-medium">Imposta di bollo</Label>
              <Switch
                id="stampDutyToggle"
                checked={stampDutyEnabled}
                onCheckedChange={(checked) => onChange({ stampDutyEnabled: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            {stampDutyEnabled && (
              <div className="flex items-center justify-between gap-4 py-3">
                <Label htmlFor="stampDutyRate" className="text-[13px] font-medium">Aliquota</Label>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    id="stampDutyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={stampDutyRate}
                    onChange={(e) => onChange({ stampDutyRate: parseFloat(e.target.value) || 0 })}
                    placeholder="es. 0.20"
                    className={cn('w-24 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            )}
            {stampDutyEnabled && (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">Sottocategoria conti correnti</p>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    Applica la soglia dei 5.000&nbsp;€ ai conti
                  </p>
                </div>
                {cashSubCategories.length > 0 ? (
                  <Select value={checkingAccountSubCategory} onValueChange={(value) => onChange({ checkingAccountSubCategory: value })}>
                    <SelectTrigger className={cn('w-44', INTERACTIVE_CONTROL_CLASS)} aria-label="Sottocategoria conti correnti">
                      <SelectValue placeholder="Seleziona sottocategoria…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SELECTION}>Nessuna (soglia non applicata)</SelectItem>
                      {cashSubCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-[11px] leading-[1.4] text-warning-foreground">
                    Configura le sottocategorie di Liquidità, in Allocazione, per abilitarla.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Gli asset esenti si marcano dalla scheda dello strumento, in Patrimonio.
          </div>
        </Tile>
      </div>

      {/* FIRE e obiettivi — the three toggles this page OWNS; it takes the column's slack */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:flex-1')}>
        <Tile
          eyebrow="FIRE e obiettivi"
          reading={describeFireToggles({
            includePrimaryResidenceInFIRE,
            goalBasedInvestingEnabled,
            goalDrivenAllocationEnabled,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="firePrimaryResidence" className="text-[13px] font-medium">
                  Casa nel patrimonio FIRE
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Lo standard FIRE la esclude</p>
              </div>
              <Switch
                id="firePrimaryResidence"
                checked={includePrimaryResidenceInFIRE}
                onCheckedChange={(checked) => onChange({ includePrimaryResidenceInFIRE: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="goalBasedInvesting" className="text-[13px] font-medium">
                  Obiettivi di investimento
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Attiva FIRE › Obiettivi e le assegnazioni del portafoglio
                </p>
              </div>
              <Switch
                id="goalBasedInvesting"
                checked={goalBasedInvestingEnabled}
                // Disabling the goals disables the goal-driven allocation with them.
                onCheckedChange={(checked) =>
                  onChange(checked ? { goalBasedInvestingEnabled: true } : { goalBasedInvestingEnabled: false, goalDrivenAllocationEnabled: false })
                }
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            {goalBasedInvestingEnabled && (
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <Label htmlFor="goalDrivenAllocation" className="text-[13px] font-medium">
                    Allocazione derivata dagli obiettivi
                  </Label>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    Target dal gap di ogni obiettivo, pesato per priorità (Alta 3×, Media 2×, Bassa 1×)
                  </p>
                </div>
                <Switch
                  id="goalDrivenAllocation"
                  checked={goalDrivenAllocationEnabled}
                  onCheckedChange={(checked) => onChange({ goalDrivenAllocationEnabled: checked })}
                  className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
                />
              </div>
            )}
          </div>
        </Tile>
      </div>

      </div>

      {/* Cashflow — labor income, history floor, cost centers */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
        <Tile
          eyebrow="Cashflow"
          reading={describeCashflowSettings({
            laborCategoryNames,
            historyStartYear: cashflowHistoryStartYear,
            costCentersEnabled,
            expenseSplitEnabled,
            familyMemberCount: familyMembersForReading.length,
            categoriesUnread: categoriesState === 'failed',
          })}
        >
          <div className="mt-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>Reddito da lavoro</p>
            {categoriesState === 'failed' ? (
              <p className="mt-2 text-[11px] leading-[1.4] text-destructive">
                Categorie non lette: la scelta salvata resta quella di prima.
              </p>
            ) : categoriesState === 'loading' ? null : incomeCategories.length === 0 ? (
              <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
                Nessuna categoria di tipo «Entrate»: creane una in Spese.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {incomeCategories.map((cat) => {
                  const checked = laborIncomeCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() =>
                        onChange({
                          laborIncomeCategoryIds: checked
                            ? laborIncomeCategoryIds.filter((id) => id !== cat.id)
                            : [...laborIncomeCategoryIds, cat.id],
                        })
                      }
                      className={cn(
                        'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors desktop:h-8',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-muted'
                      )}
                    >
                      {checked && (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="cashflowHistoryStartYear" className="text-[13px] font-medium">
                  Anno inizio storico cashflow
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Esclude i dati importati più vecchi dai grafici dello storico
                </p>
              </div>
              <Input
                id="cashflowHistoryStartYear"
                type="number"
                min="2000"
                max={new Date().getFullYear()}
                step="1"
                value={cashflowHistoryStartYear}
                onChange={(e) => onChange({ cashflowHistoryStartYear: parseInt(e.target.value, 10) || 2025 })}
                className={cn('w-24 shrink-0 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="costCentersEnabled" className="text-[13px] font-medium">Centri di Costo</Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Il tab appare in Cashflow, il selettore nel modulo delle spese
                </p>
              </div>
              <Switch
                id="costCentersEnabled"
                checked={costCentersEnabled}
                onCheckedChange={(checked) => onChange({ costCentersEnabled: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="expenseSplitEnabled" className="text-[13px] font-medium">Divisione delle spese</Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Il tab appare in Cashflow, e ogni voce si può marcare come personale
                </p>
              </div>
              <Switch
                id="expenseSplitEnabled"
                checked={expenseSplitEnabled}
                onCheckedChange={(checked) => onChange({ expenseSplitEnabled: checked })}
                className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
              />
            </div>
          </div>
        </Tile>
      </div>

      {/* Famiglia — one RAL/eligibility per taxpayer (the IRPEF ceiling is per person) */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
        <Tile
          eyebrow="Famiglia"
          aside={familyMembers.length === 1 ? '1 membro' : `${familyMembers.length} membri`}
          reading={describeFamily({ members: familyMembersForReading })}
        >
          {familyMembers.length > 0 && (
            <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] items-center gap-x-3 pb-1.5 desktop:grid">
              <span className={TILE_SUB_EYEBROW_CLASS}>Nome</span>
              <span className={TILE_SUB_EYEBROW_CLASS}>RAL</span>
              <span className={TILE_SUB_EYEBROW_CLASS}>Prima occupazione dopo il 2007</span>
              <span className={TILE_SUB_EYEBROW_CLASS}>Primo anno</span>
              <span aria-hidden="true" />
            </div>
          )}
          <div className="flex flex-col divide-y divide-border">
            {familyMembers.map((member) => (
              <div
                key={member.id}
                className="grid grid-cols-2 items-center gap-3 py-3 desktop:grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] desktop:gap-x-3"
              >
                <Input
                  value={member.name}
                  onChange={(e) => updateFamilyMemberRow(member.id, 'name', e.target.value)}
                  placeholder="Nome"
                  aria-label="Nome del membro"
                  disabled={isDemo}
                  className={cn('col-span-2 desktop:col-span-1', INTERACTIVE_CONTROL_CLASS)}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  value={member.grossAnnualIncome}
                  onChange={(e) => updateFamilyMemberRow(member.id, 'grossAnnualIncome', e.target.value)}
                  placeholder="RAL"
                  aria-label="Reddito annuo lordo (RAL)"
                  disabled={isDemo}
                  className={cn('text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                />
                <div className="flex items-center justify-end gap-2 desktop:justify-start">
                  <Switch
                    id={`family-firstjob-${member.id}`}
                    checked={member.isFirstEmploymentPost2007}
                    onCheckedChange={(checked) => updateFamilyMemberRow(member.id, 'isFirstEmploymentPost2007', checked)}
                    disabled={isDemo}
                    aria-label="Prima occupazione dopo il 2007"
                    className={INTERACTIVE_CONTROL_CLASS}
                  />
                  <Label htmlFor={`family-firstjob-${member.id}`} className="text-[11px] text-muted-foreground desktop:hidden">
                    Post 2007
                  </Label>
                </div>
                <Input
                  type="number"
                  value={member.firstEmploymentYear}
                  onChange={(e) => updateFamilyMemberRow(member.id, 'firstEmploymentYear', e.target.value)}
                  placeholder="anno"
                  aria-label="Anno di prima occupazione"
                  disabled={isDemo || !member.isFirstEmploymentPost2007}
                  className={cn('text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFamilyMemberRow(member.id)}
                  disabled={isDemo}
                  aria-label={`Rimuovi ${member.name || 'membro'}`}
                  className="h-10 w-10 justify-self-end shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className={familyMembers.length > 0 ? 'mt-2' : 'mt-3'}>
            <Button type="button" variant="outline" size="sm" onClick={addFamilyMemberRow} disabled={isDemo}>
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi membro
            </Button>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Colleghi un fondo pensione a un membro dalla sua scheda in Patrimonio; «Prima occupazione dopo il 2007»
            abilita il recupero del plafond di deducibilità.
          </div>
        </Tile>
      </div>

      {/* Email periodiche — toggles + recipients + manual send */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <Tile
          eyebrow="Email periodiche"
          aside={monthlyEmailRecipients.length === 1 ? '1 destinatario' : `${monthlyEmailRecipients.length} destinatari`}
          reading={describeEmails({
            monthly: monthlyEmailEnabled,
            quarterly: quarterlyEmailEnabled,
            semiAnnual: semiAnnualEmailEnabled,
            yearly: yearlyEmailEnabled,
            weeklyBudget: weeklyBudgetEmailEnabled,
            recipientCount: monthlyEmailRecipients.length,
          })}
        >
          <div className="mt-1 grid grid-cols-1 gap-x-10 desktop:grid-cols-2">
            <div className="flex flex-col divide-y divide-border">
              {([
                { id: 'monthlyEmailEnabled', label: 'Report mensile', help: "L'ultimo giorno del mese", checked: monthlyEmailEnabled },
                { id: 'quarterlyEmailEnabled', label: 'Report trimestrale', help: 'Marzo, giugno, settembre e dicembre', checked: quarterlyEmailEnabled },
                { id: 'semiAnnualEmailEnabled', label: 'Report semestrale', help: '30 giugno e 31 dicembre', checked: semiAnnualEmailEnabled },
                { id: 'yearlyEmailEnabled', label: 'Report annuale', help: 'Il 31 dicembre', checked: yearlyEmailEnabled },
                { id: 'weeklyBudgetEmailEnabled', label: 'Report budget settimanale', help: 'Ogni domenica, con lo stato dei budget', checked: weeklyBudgetEmailEnabled },
              ] as const).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor={row.id} className="text-[13px] font-medium">{row.label}</Label>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{row.help}</p>
                  </div>
                  <Switch
                    id={row.id}
                    checked={row.checked}
                    onCheckedChange={(checked) => onChange({ [row.id]: checked })}
                    disabled={isDemo}
                    className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
                  />
                </div>
              ))}
            </div>

            {anyEmailEnabled && (
              <div className="mt-4 flex flex-col desktop:mt-0 desktop:border-l desktop:border-border desktop:pl-10">
                <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pt-3')}>Destinatari</p>
                <div className="mt-2 flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@esempio.com"
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    disabled={isDemo}
                    aria-label="Nuovo destinatario"
                    className={INTERACTIVE_CONTROL_CLASS}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDemo || !newEmailInput.trim() || monthlyEmailRecipients.includes(newEmailInput.trim())}
                    onClick={addRecipient}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Aggiungi
                  </Button>
                </div>

                {monthlyEmailRecipients.length > 0 && (
                  <ul className="mt-2.5 space-y-2">
                    {monthlyEmailRecipients.map((email) => (
                      <li
                        key={email}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 py-0.5 pl-3 pr-0.5 text-sm"
                      >
                        <span className="truncate text-foreground">{email}</span>
                        {/* Removing a recipient is a draft edit like any other: it waits for «Salva». */}
                        <button
                          type="button"
                          aria-label={`Rimuovi ${email}`}
                          disabled={isDemo}
                          onClick={() => onChange({ monthlyEmailRecipients: monthlyEmailRecipients.filter((r) => r !== email) })}
                          className="ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40 desktop:h-8 desktop:w-8"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {([
                    { type: 'monthly' as const, label: 'Invia mensile ora', enabled: monthlyEmailEnabled },
                    { type: 'quarterly' as const, label: 'Invia trimestrale ora', enabled: quarterlyEmailEnabled },
                    { type: 'semiannual' as const, label: 'Invia semestrale ora', enabled: semiAnnualEmailEnabled },
                    { type: 'yearly' as const, label: 'Invia annuale ora', enabled: yearlyEmailEnabled },
                    { type: 'weekly-budget' as const, label: 'Invia report budget ora', enabled: weeklyBudgetEmailEnabled },
                  ] as const).filter(({ enabled }) => enabled).map(({ type, label }) => (
                    <Button
                      key={type}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isDemo || monthlyEmailRecipients.length === 0 || sendingTestEmailType !== null}
                      onClick={() => void sendTestEmail(type)}
                    >
                      {sendingTestEmailType === type ? (
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Invio in corso…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          {label}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-[1.45] text-muted-foreground">
                  Invia il riepilogo del periodo corrente per verificare il formato. Salva prima le impostazioni.
                </p>
              </div>
            )}
          </div>
        </Tile>
      </div>

      {/* Parametri del piano — read-only declaration; the FIRE pages stay the only write surfaces */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
        <Tile eyebrow="Parametri del piano" aside="sola lettura" reading={describePlanParameters(planParams)}>
          <div className="mt-1 flex flex-col divide-y divide-border">
            {planParams.withdrawalRate !== undefined && (
              <DeclarationRow label="Safe withdrawal rate" value={pctLabel(planParams.withdrawalRate)} />
            )}
            {planParams.plannedAnnualExpenses !== undefined && (
              <DeclarationRow
                label="Spese pianificate"
                value={`${cachedFormatCurrencyEUR(planParams.plannedAnnualExpenses, true)}/anno`}
              />
            )}
            <DeclarationRow
              label="Età pensione INPS"
              value={`${inpsAgeShown} anni${planParams.pensionInpsRetirementAge === undefined ? ' · predefinita' : ''}`}
            />
            <DeclarationRow label="RITA (sblocco fondo)" value={`${ritaAgeShown} anni`} />
            <DeclarationRow
              label="Vincolo fondo nel FIRE"
              value={planParams.respectPensionLockInFire ? 'Attivo' : 'Spento'}
              mono={false}
            />
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Si modificano dove agiscono:{' '}
            <Link href="/dashboard/fire-simulations?tab=fire" className={TILE_FOOTER_ACTION_CLASS}>
              FIRE › Calcolatore → Parametri
            </Link>
            {' '}e{' '}
            <Link href="/dashboard/fire-simulations?tab=coast" className={TILE_FOOTER_ACTION_CLASS}>
              Coast FIRE → Ipotesi
            </Link>
            .
          </div>
        </Tile>
      </div>

      {/* Assistente — read-only mirror; the popover beside the conversation is the write surface */}
      {SHOW_ASSISTANT ? (
        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
          <Tile eyebrow="Assistente" aside="sola lettura" reading={describeAssistantPreferences(assistantPrefs)}>
            <div className="mt-1 flex flex-col divide-y divide-border">
              {assistantPrefs.responseStyle !== undefined && (
                <DeclarationRow
                  label="Stile delle risposte"
                  value={ASSISTANT_STYLE_LABELS[assistantPrefs.responseStyle]}
                  mono={false}
                />
              )}
              {assistantPrefs.memoryEnabled !== undefined && (
                <DeclarationRow
                  label="Apprendimento automatico"
                  value={assistantPrefs.memoryEnabled ? 'Attivo' : 'Spento'}
                  mono={false}
                />
              )}
              {assistantPrefs.macroContextEnabled !== undefined && (
                <DeclarationRow
                  label="Contesto macro (web)"
                  value={assistantPrefs.macroContextEnabled ? 'Attivo' : 'Spento'}
                  mono={false}
                />
              )}
            </div>
            <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
              Si modificano{' '}
              <Link href="/dashboard/assistant" className={TILE_FOOTER_ACTION_CLASS}>
                dall&apos;Assistente
              </Link>
              , accanto alla conversazione.
            </div>
          </Tile>
        </div>
      ) : (
        <div className="hidden desktop:block desktop:col-span-6" aria-hidden="true" />
      )}

      {/* Development Features — clearly separated from user-facing settings, only shown in dev mode */}
      {enableTestSnapshots && (
        <div className="mt-6 border-t border-border pt-6 space-y-4 tablet:col-span-2 desktop:col-span-12">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-500" />
            <p className="text-xs uppercase tracking-widest text-orange-500">Strumenti di sviluppo</p>
          </div>
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10 dark:border-orange-900">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 p-4">
                <p className="text-sm text-orange-900 dark:text-orange-200 font-semibold">⚠️ Attenzione</p>
                <p className="text-sm text-orange-800 dark:text-orange-300 mt-1">
                  Questa sezione è visibile solo quando la variabile d&apos;ambiente{' '}
                  <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS</code>{' '}
                  è impostata su <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">true</code>.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Generazione Snapshot di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Genera snapshot mensili fittizi per testare grafici e statistiche.
                  Gli snapshot verranno salvati nella stessa collection Firebase degli snapshot reali.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setDummySnapshotModalOpen(true)}
                  className="border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Genera Snapshot di Test
                </Button>
              </div>

              <div className="space-y-3 border-t border-orange-200 dark:border-orange-800 pt-4">
                <h3 className="font-semibold text-sm text-foreground">Eliminazione Dati di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Elimina tutti i dati dummy (snapshot, spese e categorie) in un&apos;unica operazione.
                  Questa azione è irreversibile.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDummyDataDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina Tutti i Dati Dummy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {enableTestSnapshots && (
        <CreateDummySnapshotModal
          open={dummySnapshotModalOpen}
          onOpenChange={setDummySnapshotModalOpen}
          userId={ownerId || ''}
        />
      )}
      {enableTestSnapshots && (
        <DeleteDummyDataDialog
          open={deleteDummyDataDialogOpen}
          onOpenChange={setDeleteDummyDataDialogOpen}
          userId={ownerId || ''}
          onDeleted={() => {
            // Refresh page or data after deletion
            window.location.reload();
          }}
        />
      )}
    </SettingsTabPanel>
  );
}
