'use client';

/**
 * «Ipotesi», below the grid behind a disclosure: every input the Coast projection reads, as four
 * tiles — Profilo (5: the two ages, the custom expenses, the assumptions inherited from the
 * Calcolatore) · Pensioni statali (7: one editor row per pension) / Scaglioni IRPEF (5) ·
 * Modello della pensione (7: the four steps from gross nominal to net real). Configuration, not
 * a reading of the plan, so it does not earn a place in the grid (the FIRE «Parametri» precedent).
 *
 * Config-first: the disclosure opens by itself only while no age is saved, or when an unsaved
 * edit or an incomplete pension appears — the tab owns that state (`open`/`onOpenChange`) because
 * the decision has to be taken ONCE after the form has settled (doc/guide/fire.md § FIRE, What If and Goals: a `useRef`
 * seeded flag, never the transient `hasUnsavedChanges`). Every edit here is a PREVIEW — the
 * verdict and the tiles read the typed values at once — until «Salva ipotesi»: ONE save for the
 * four tiles, because the form is one document (`useCoastFireSettingsDraft` has one mutation),
 * and the trigger carries the warning dot while something is unsaved.
 *
 * The description on the trigger is the old basis line (`describeIpotesi`): the assumptions are
 * declared with the panel closed. The pension-lock switch is NOT here — it is the Calcolatore's
 * Base di calcolo control, and the description names its state.
 */

import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { CoastFireSettingsDraft } from '@/lib/hooks/useCoastFireSettingsDraft';
import {
  describePensioniStatali,
  describeProfilo,
  describeScaglioni,
  PENSION_MODEL_READING,
  type PensionDraftIssue,
} from '@/lib/utils/coastFireView';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';

const CONTROL_CLASS =
  'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

interface CoastIpotesiProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `describeIpotesi(...)` — the assumptions in one line. */
  description: string;
  draft: CoastFireSettingsDraft;
  isDemo: boolean;
  /** The last full year's expenses from the cashflow, when any. */
  detectedAnnualExpenses: number | undefined;
  withdrawalRate: number;
  includePrimaryResidence: boolean;
  /** The FIRE-eligible net worth the page runs on, and its liquid part. */
  currentNetWorth: number;
  liquidNetWorth: number;
  /** True when a locked pension fund is subtracted from `currentNetWorth`. */
  lockSubtracted: boolean;
}

const compact = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);
const formatRate = (value: number) => `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

function Row({ label, caption, value }: { label: string; caption?: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        {caption && <span className="block text-[11px] leading-[1.4] text-muted-foreground/70">{caption}</span>}
      </span>
      <span className="shrink-0 text-right font-mono text-[14px] tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** One issue line under the pensions' reading — the incomplete ones in the warning tone, the notes muted. */
function IssueLine({ issue }: { issue: PensionDraftIssue }) {
  return (
    <p className={cn('text-[11px] leading-[1.4]', issue.kind === 'incomplete' ? 'text-warning-foreground' : 'text-muted-foreground')}>{issue.message}</p>
  );
}

export function CoastIpotesi({
  open,
  onOpenChange,
  description,
  draft,
  isDemo,
  detectedAnnualExpenses,
  withdrawalRate,
  includePrimaryResidence,
  currentNetWorth,
  liquidNetWorth,
  lockSubtracted,
}: CoastIpotesiProps) {
  const incompleteCount = new Set(draft.pensionIssues.filter((issue) => issue.kind === 'incomplete').map((issue) => issue.pensionId)).size;
  const hasCompactPensionEditor = draft.pensions.length >= 3;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      {/* No aria-label: the trigger's name is its visible text, so «Anteprima non salvata» reaches a
          screen reader too. */}
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Ipotesi</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
          {draft.hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-warning-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground" aria-hidden="true" />
              Anteprima non salvata
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {/* Profilo (5) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
            <Tile eyebrow="Profilo" aside="salvato nel profilo" reading={describeProfilo(draft.hasUnsavedChanges)} ariaLabel="Profilo Coast FIRE">
              <div className="mt-3.5 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="coastCurrentAge" className="text-[13px]">
                    Età attuale
                  </Label>
                  <Input
                    id="coastCurrentAge"
                    type="number"
                    inputMode="numeric"
                    min="18"
                    max="100"
                    step="1"
                    value={draft.userAge}
                    onChange={(event) => draft.setUserAge(event.target.value)}
                    className={CONTROL_CLASS}
                    placeholder="Es. 35"
                  />
                  <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">Da qui il capitale cresce senza nuovi versamenti.</p>
                </div>
                <div>
                  <Label htmlFor="coastRetirementAge" className="text-[13px]">
                    Età target Coast FIRE
                  </Label>
                  <Input
                    id="coastRetirementAge"
                    type="number"
                    inputMode="numeric"
                    min="18"
                    max="100"
                    step="1"
                    value={draft.retirementAge}
                    onChange={(event) => draft.setRetirementAge(event.target.value)}
                    className={CONTROL_CLASS}
                  />
                  <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">Quando il capitale deve bastare, anche se le pensioni partono dopo.</p>
                </div>
              </div>

              <div className="mt-3.5 flex items-start justify-between gap-4 border-t border-border pt-3.5">
                <div className="min-w-0">
                  <Label htmlFor="coastUseCustomExpenses" className="text-[13px] leading-normal">
                    Spese personalizzate
                  </Label>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    {draft.useCustomExpenses
                      ? 'Sostituiscono le spese rilevate.'
                      : detectedAnnualExpenses !== undefined && detectedAnnualExpenses > 0
                        ? `Spese rilevate dall'ultimo anno completo: ${compact(detectedAnnualExpenses)}. Attiva per sostituirle.`
                        : "Nessuna spesa rilevata nell'ultimo anno completo: attiva e inserisci un importo."}
                  </p>
                </div>
                <Switch
                  id="coastUseCustomExpenses"
                  checked={draft.useCustomExpenses}
                  onCheckedChange={draft.setUseCustomExpenses}
                  aria-label="Usa spese personalizzate"
                  className="mt-0.5 shrink-0"
                />
              </div>
              {draft.useCustomExpenses && (
                <div className="mt-3">
                  <Label htmlFor="coastCustomExpenses" className="text-[13px]">
                    Spese annue (€)
                  </Label>
                  <Input
                    id="coastCustomExpenses"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="100"
                    value={draft.customExpenses}
                    onChange={(event) => draft.setCustomExpenses(event.target.value)}
                    className={cn(CONTROL_CLASS, 'w-[180px]')}
                    placeholder="Es. 30000"
                  />
                </div>
              )}

              <div className="mt-3.5 flex flex-col divide-y divide-border border-t border-border">
                <Row label="SWR · casa di abitazione" caption="si modificano nei Parametri del Calcolatore" value={`${formatRate(withdrawalRate)} · ${includePrimaryResidence ? 'inclusa' : 'esclusa'}`} />
                <Row
                  label="Patrimonio FIRE"
                  caption={[lockSubtracted ? 'fondo pensione bloccato escluso' : null, `liquidi ${compact(liquidNetWorth)}`].filter((part): part is string => part !== null).join(' · ')}
                  value={compact(currentNetWorth)}
                />
              </div>

              <div className="mt-auto flex items-center gap-3 pt-4">
                <Button onClick={draft.save} disabled={isDemo || draft.isSaving} className="h-9">
                  {draft.isSaving ? 'Salvataggio…' : 'Salva ipotesi'}
                </Button>
                {draft.hasUnsavedChanges && (
                  <Button variant="ghost" size="sm" onClick={draft.resetToSaved} disabled={draft.isSaving} className="h-9">
                    Annulla
                  </Button>
                )}
                {isDemo && <span className="text-[11px] text-muted-foreground">non modificabile in demo</span>}
              </div>
            </Tile>
          </div>

          {/* Pensioni statali (7) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
            <Tile eyebrow="Pensioni statali" aside="lordo mensile nominale alla decorrenza" reading={describePensioniStatali(draft.pensions.length, incompleteCount)} ariaLabel="Pensioni statali">
              {draft.pensionIssues.length > 0 && (
                <div className="mt-2 flex flex-col gap-0.5" role="status" aria-live="polite">
                  {draft.pensionIssues.map((issue) => (
                    <IssueLine key={`${issue.pensionId}-${issue.message}`} issue={issue} />
                  ))}
                </div>
              )}

              {draft.pensions.length > 0 && (
                <div className="mt-2.5 flex flex-col divide-y divide-border">
                  {draft.pensions.map((pension, index) => (
                    <div key={pension.id} className="py-3">
                      {/* Always 2-col on mobile so inputs are paired (Name+Amount, Months+Date),
                          then one line at desktop with the delete at the end. items-start rather
                          than items-end: the hints under the fields make bottom-alignment impossible. */}
                      <div
                        className={cn(
                          'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3',
                          hasCompactPensionEditor
                            ? 'desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_150px_36px]'
                            : 'desktop:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_150px_36px]',
                        )}
                      >
                        <div>
                          <Label htmlFor={`coast-pension-label-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Nome
                          </Label>
                          <Input
                            id={`coast-pension-label-${pension.id}`}
                            value={pension.label}
                            onChange={(event) => draft.updatePension(pension.id, 'label', event.target.value)}
                            className={cn(CONTROL_CLASS, 'font-sans')}
                            placeholder={`Pensione ${index + 1}`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-gross-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Lordo mensile
                          </Label>
                          <Input
                            id={`coast-pension-gross-${pension.id}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={pension.grossMonthlyAmount}
                            onChange={(event) => draft.updatePension(pension.id, 'grossMonthlyAmount', event.target.value)}
                            className={CONTROL_CLASS}
                            placeholder="Es. 2200"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-months-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Mensilità
                          </Label>
                          <Input
                            id={`coast-pension-months-${pension.id}`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="24"
                            step="1"
                            value={pension.monthsPerYear}
                            onChange={(event) => draft.updatePension(pension.id, 'monthsPerYear', event.target.value)}
                            className={CONTROL_CLASS}
                            placeholder="13"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`coast-pension-date-${pension.id}`} className="text-[11px] text-muted-foreground">
                            Decorrenza
                          </Label>
                          <Input
                            id={`coast-pension-date-${pension.id}`}
                            type="date"
                            value={pension.startDate}
                            // Italian wall-clock today: toISOString() proposes yesterday from
                            // 22:00 CET (AGENTS → *Firebase Dates and Timezone*).
                            min={getItalyDateIso()}
                            onChange={(event) => draft.updatePension(pension.id, 'startDate', event.target.value)}
                            className={CONTROL_CLASS}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end desktop:col-span-1 desktop:pt-5">
                          {/* 44px on a phone, 36px beside the inputs at desktop. */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => draft.removePension(pension.id)}
                            aria-label={`Rimuovi ${pension.label.trim() || `Pensione ${index + 1}`}`}
                            className="h-11 w-11 desktop:h-9 desktop:w-9"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-3.5">
                <Button type="button" variant="outline" size="sm" onClick={draft.addPension} className="h-9">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Aggiungi pensione
                </Button>
                <span className="text-[11px] leading-[1.4] text-muted-foreground">Lordo stimato alla decorrenza, in euro di quell&apos;anno (nominale futuro); 13 mensilità con la tredicesima.</span>
              </div>
            </Tile>
          </div>

          {/* Scaglioni IRPEF (5) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
            <Tile eyebrow="Scaglioni IRPEF" aside="sul lordo annuo reale" reading={describeScaglioni(draft.taxBrackets.length)} ariaLabel="Scaglioni IRPEF">
              <div className="mt-2.5 flex flex-col divide-y divide-border">
                {draft.taxBrackets.map((bracket, index) => {
                  const isLast = index === draft.taxBrackets.length - 1;
                  return (
                    <div key={bracket.id} className="grid grid-cols-[minmax(0,1fr)_96px_44px] items-end gap-3 py-2.5 desktop:grid-cols-[minmax(0,1fr)_110px_36px]">
                      <div>
                        <Label htmlFor={`coast-tax-limit-${bracket.id}`} className="text-[11px] text-muted-foreground">
                          {isLast ? 'Fino a (vuoto = senza tetto)' : 'Fino a (€ annui)'}
                        </Label>
                        <Input
                          id={`coast-tax-limit-${bracket.id}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={bracket.upTo}
                          onChange={(event) => draft.updateTaxBracket(bracket.id, 'upTo', event.target.value)}
                          className={CONTROL_CLASS}
                          placeholder={isLast ? 'Senza tetto' : 'Es. 28000'}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`coast-tax-rate-${bracket.id}`} className="text-[11px] text-muted-foreground">
                          Aliquota %
                        </Label>
                        <Input
                          id={`coast-tax-rate-${bracket.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.1"
                          value={bracket.rate}
                          onChange={(event) => draft.updateTaxBracket(bracket.id, 'rate', event.target.value)}
                          className={CONTROL_CLASS}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => draft.removeTaxBracket(bracket.id)}
                        disabled={draft.taxBrackets.length === 1}
                        aria-label={`Rimuovi lo scaglione ${index + 1}`}
                        className="h-11 w-11 desktop:h-9 desktop:w-9"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-auto flex items-center gap-3 border-t border-border pt-3.5">
                <Button type="button" variant="outline" size="sm" onClick={draft.addTaxBracket} className="h-9">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Aggiungi scaglione
                </Button>
              </div>
            </Tile>
          </div>

          {/* Modello della pensione (7) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
            <Tile eyebrow="Modello della pensione" reading={PENSION_MODEL_READING} ariaLabel="Modello della pensione">
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] leading-[1.5] text-muted-foreground desktop:grid-cols-2">
                <p>
                  <strong className="font-semibold text-foreground">Importo lordo mensile.</strong> Stima dell&apos;importo alla decorrenza, in euro di quell&apos;anno (nominale futuro).
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Deflazione.</strong> Il lordo nominale diventa potere d&apos;acquisto ai prezzi di oggi con l&apos;inflazione dello scenario.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">IRPEF.</strong> Imposta sul lordo annuo reale con gli scaglioni qui accanto; il netto reale è ciò che abbatte il fabbisogno.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Decorrenza.</strong> Prima di quella data la pensione non riduce nulla: il portafoglio copre da solo.
                </p>
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
