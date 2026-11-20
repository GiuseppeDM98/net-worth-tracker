/**
 * The words of the plan's guided path (doc/guide/accumulo.md § Creare un piano: il percorso): each screen's
 * theme, question and help, the sales' tax line, the summary's sentences, the host's states and «Conferma»'s
 * outcomes. Pure; the figures come from lib/utils/planPath.ts and the plan's engine, the editor's sentences
 * are reused as they are (`describeStep3Summary`, `describeSaleStep`, the two warnings).
 */

import type { Asset } from '@/types/assets';
import type { MonthKey } from '@/types/accumulationPlan';
import type { Narrative } from '@/lib/utils/narrative';
import {
  buildDraftPreview,
  proceedsOfDisposal,
  resolvePositionStates,
} from '@/lib/utils/accumulationPlanUtils';
import {
  describeInsufficientLiquidityWarning,
  describePlanPastReview,
  describeSaleStep,
  describeStep3Summary,
  describeUnpricedWarning,
} from '@/lib/utils/accumulationNarrative';
import { listSaleSteps, summarizeBuyingInstalments } from '@/lib/utils/accumuloSummary';
import { planEndsAfterReview } from '@/lib/utils/accumuloMonth';
import { candidateSaleTaxPerEuro } from '@/lib/utils/saleTax';
import { addMonths, monthLabelLong } from '@/lib/utils/planMonths';
import { cachedFormatCurrencyEUR, formatCurrency } from '@/lib/utils/formatters';
import { planPathToDraft, type PlanPathAnswers, type PlanPathContext, type PlanPathSale, type PlanPathScreen } from '@/lib/utils/planPath';

export const PLAN_PATH_TITLE = 'Piano di accumulo';
export const PLAN_PATH_BACK_LINK = 'Torna ad Accumulo';
export const PLAN_PATH_DEMO = "Il piano di accumulo non si crea nell'account demo.";
export const PLAN_PATH_NO_TARGETS = 'Prima imposta i target in Impostazioni › Allocazione: il piano va verso di essi.';
export const PLAN_PATH_ACTIVE = 'Hai già un piano di accumulo attivo.';
export const PLAN_PATH_START_REPLACES = 'Le quote che avevi scritto vengono sostituite.';
export const PLAN_PATH_CONFIRM = 'Conferma';
export const PLAN_PATH_CONFIRMING = 'Creo il piano…';
export const PLAN_PATH_NEXT = 'Avanti';
export const PLAN_PATH_DONE_FOOTER = 'Ogni mese lo trovi in Allocazione › Accumulo.';
export const PLAN_PATH_REDISTRIBUTE = 'Ridistribuisci il resto';
export const PLAN_PATH_ADD = 'Aggiungi uno strumento';
export const PLAN_PATH_NEW_INSTRUMENT = 'Nuovo strumento…';

export const PLAN_PATH_START_LABELS = {
  draft: 'Dalla bozza che avevi',
  seed: 'Dai pesi che hai appena calcolato',
  model: 'Dal portafoglio modello',
  today: 'Dai pesi di oggi',
  zero: 'Da zero: le scrivo io',
} as const;

/** «La prima rata è a dicembre 2026.» — the month after «today». */
export function firstInstalmentMonth(todayMonth: MonthKey): MonthKey {
  return addMonths(todayMonth, 1);
}

export function planPathScreenCopy(screen: PlanPathScreen, context: Pick<PlanPathContext, 'todayMonth'>): { theme: string; question: string; help: string } {
  switch (screen) {
    case 'partenza':
      return { theme: 'Partenza', question: 'Da dove partono le quote?', help: 'Puoi cambiare ogni quota più avanti.' };
    case 'versamento':
      return { theme: 'Versamento', question: 'Quanto versi ogni mese?', help: 'Anche 0: il piano investe allora solo la liquidità che hai già.' };
    case 'durata':
      return { theme: 'Durata', question: 'Per quanti mesi?', help: `La prima rata è a ${monthLabelLong(firstInstalmentMonth(context.todayMonth))}.` };
    case 'conto':
      return { theme: 'Conto', question: 'Da quale conto escono i soldi?', help: 'Il piano compra con la liquidità di questi conti e con quello che versi.' };
    case 'riserva':
      return { theme: 'Riserva', question: 'Quanto deve restare sul conto?', help: 'Il piano non scende mai sotto questa cifra: se oggi sei sotto, prima la ricostituisce.' };
    case 'vendite':
      return {
        theme: 'Vendite',
        question: 'Vuoi vendere qualcosa?',
        help: 'Il ricavato entra nelle rate dal mese della vendita; se alla riserva manca qualcosa, prima la ricostituisce.',
      };
    case 'strumenti':
      return { theme: 'Strumenti', question: 'Che cosa compra il piano?', help: "Una quota a 0 tiene lo strumento dov'è: il piano non lo compra e non lo vende." };
    case 'riepilogo':
      return { theme: 'Riepilogo', question: 'Confermi il piano?', help: 'Con «Conferma» il piano parte: la prima rata la trovi in Allocazione › Accumulo.' };
  }
}

/** «La tua allocazione chiede 10.000 € di liquidità; 5.000 € sono già altrove.» */
export function describePathReserveSource(quotaEur: number, otherCashEur: number): string {
  return `La tua allocazione chiede ${cachedFormatCurrencyEUR(quotaEur, true)} di liquidità; ${cachedFormatCurrencyEUR(otherCashEur, true)} sono già altrove.`;
}

export function describePathReserveReset(reserveEur: number): string {
  return `Torna a ${cachedFormatCurrencyEUR(reserveEur, true)}`;
}

export function describePathSuggestionButton(suggestionEur: number): string {
  return `Usa ${cachedFormatCurrencyEUR(suggestionEur, true)}`;
}

/** «gennaio 2027 (2º)»: a sale's month in the select. */
export function describeSaleMonthOption(todayMonth: MonthKey, index: number): string {
  return `${monthLabelLong(addMonths(todayMonth, index))} (${index}º)`;
}

/** «60 quote · 6.000 €» */
export function describeSellableHolding(quantity: number, valueEur: number): string {
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 4 }).format(quantity)} quote · ${cachedFormatCurrencyEUR(valueEur, true)}`;
}

/** A sale's proceeds and its estimated tax (null = not estimable), on today's price. */
export function estimateSale(sale: PlanPathSale, context: PlanPathContext): { proceedsEur: number; taxEur: number | null; line: string } {
  const asset = context.assets.find((candidate) => candidate.id === sale.assetId);
  const proceedsEur = proceedsOfDisposal(
    { assetId: sale.assetId, ...(sale.quantity === null ? {} : { quantity: sale.quantity }), estimatedProceedsEur: 0, status: 'planned' },
    asset,
    context.deps
  );
  const tax = candidateSaleTaxPerEuro(sale.assetId, context.holdings);
  const proceeds = `circa ${cachedFormatCurrencyEUR(proceedsEur, true)}`;
  if (tax.kind === 'exempt') return { proceedsEur, taxEur: 0, line: `${proceeds} · esente` };
  if (tax.kind === 'taxed') {
    const taxEur = Math.round(proceedsEur * tax.perEuro * 100) / 100;
    return { proceedsEur, taxEur, line: `${proceeds} · tasse stimate ${cachedFormatCurrencyEUR(taxEur, true)}` };
  }
  return {
    proceedsEur,
    taxEur: null,
    line: `${proceeds} · tasse non stimabili: ${tax.reason === 'rate' ? "manca l'aliquota" : 'manca il costo fiscale'}`,
  };
}

/** «Tasse stimate delle vendite: 120 €, senza 1 vendita non stimabile» — the wording of the Consulente's plan stage. */
export function describePathTaxTotal(taxes: ReadonlyArray<number | null>): string | null {
  const estimable = taxes.filter((tax): tax is number => tax !== null);
  if (estimable.length === 0) return null;
  const total = estimable.reduce((sum, tax) => sum + tax, 0);
  const unknown = taxes.length - estimable.length;
  const without = unknown === 0 ? '' : unknown === 1 ? ', senza 1 vendita non stimabile' : `, senza ${unknown} vendite non stimabili`;
  return `Tasse stimate delle vendite: ${formatCurrency(Math.round(total * 100) / 100)}${without}`;
}

function describeSaleQuantity(sale: PlanPathSale): string {
  if (sale.quantity === null) return 'tutte le quote';
  return sale.quantity === 1 ? '1 quota' : `${sale.quantity} quote`;
}

export interface PlanPathSummary {
  /** `describeStep3Summary`: the plan in one line. */
  headline: Narrative;
  /** «La prima rata è a dicembre 2026: 1.500 €.» */
  first: string;
  saleSteps: string[];
  sales: string[];
  taxTotal: string | null;
  warnings: string[];
  firstMonth: MonthKey;
  firstEur: number;
}

/** The summary's sentences, on the draft «Conferma» writes: what the editor's preview showed. */
export function buildPlanPathSummary(answers: PlanPathAnswers, context: PlanPathContext): PlanPathSummary {
  const draft = planPathToDraft(answers, context);
  const assetsById = new Map<string, Asset>(context.assets.map((asset) => [asset.id, asset]));
  const preview = buildDraftPreview({ draft, allAssets: context.assets, targets: context.targets, band: context.band, compare: context.compare, deps: context.deps, firstIndex: 1 });
  const nameOf = (assetId: string) => assetsById.get(assetId)?.name ?? assetId;

  // Coverage, as the editor measures it: L against the ideal deficit Σ max(0, target% × B − value).
  const states = resolvePositionStates(draft.positions, assetsById, context.deps, draft.disposals);
  const base = states.reduce((sum, state) => sum + state.currentValueEur, 0) + preview.liquidity.L;
  const deficit = states.filter((state) => !state.unpriced).reduce((sum, state) => sum + Math.max(0, (state.targetPercentage / 100) * base - state.currentValueEur), 0);
  const rawCoverage = deficit <= 0.5 ? null : Math.min(100, (preview.liquidity.L / deficit) * 100);
  const coveragePct = rawCoverage === null || rawCoverage >= 99.5 ? null : rawCoverage;

  const buying = summarizeBuyingInstalments(preview.schedule.installments, preview.liquidity.refillMonths);
  const firstMonth = buying?.firstMonth ?? preview.schedule.installments[0]?.month ?? draft.startMonth;
  const firstEur = buying?.firstEur ?? 0;
  const headline = describeStep3Summary({
    months: buying?.count ?? preview.schedule.installments.length,
    firstEur,
    firstMonth,
    averageEur: buying?.averageEur ?? 0,
    coveragePct,
    leverageRatio: preview.outcome.leverageRatio,
  });

  const saleSteps = listSaleSteps({ installments: preview.schedule.installments, disposals: draft.disposals, firstIndex: 1, nameOf }).map(describeSaleStep);
  const estimates = answers.sales.map((sale) => ({ sale, estimate: estimateSale(sale, context) }));
  const sales = estimates.map(
    ({ sale, estimate }) => {
      const swap = draft.disposals.find((disposal) => disposal.assetId === sale.assetId)?.reinvestAssetId;
      const buys = swap === undefined ? '' : `; con il ricavato compri ${nameOf(swap)}`;
      return `${nameOf(sale.assetId)}: ${describeSaleQuantity(sale)} a ${monthLabelLong(addMonths(context.todayMonth, sale.month))}, ${estimate.line}${buys}.`;
    }
  );

  const warnings: string[] = [];
  if (coveragePct !== null) warnings.push(describeInsufficientLiquidityWarning(coveragePct));
  if (preview.unpricedPositionIds.length > 0) {
    warnings.push(describeUnpricedWarning(preview.unpricedPositionIds.map((id) => draft.positions.find((position) => position.id === id)?.label ?? id)));
  }
  if (context.reviewByIso && planEndsAfterReview(draft, context.reviewByIso)) warnings.push(describePlanPastReview(context.reviewByIso));

  return {
    headline,
    first: `La prima rata è a ${monthLabelLong(firstMonth)}: ${cachedFormatCurrencyEUR(firstEur, true)}.`,
    saleSteps,
    sales,
    taxTotal: describePathTaxTotal(estimates.map(({ estimate }) => estimate.taxEur)),
    warnings,
    firstMonth,
    firstEur,
  };
}

/** «Conferma» after the Italian month changed: nothing written. */
export function describeMonthChanged(firstMonth: MonthKey): string {
  return `Nel frattempo è cambiato il mese: la prima rata è ora a ${monthLabelLong(firstMonth)}. Controlla il riepilogo e premi di nuovo «Conferma».`;
}

/** The draft was written, its activation failed: the next press overwrites it. */
export function describeActivationFailed(reason: string): string {
  return `Il piano è salvato ma non attivo: ${reason.replace(/[.\s]+$/, '')}. Premi di nuovo «Conferma».`;
}

/** «Piano attivo: prima rata a dicembre 2026, 1.500 €.» */
export function describePlanActive(firstMonth: MonthKey, firstEur: number): string {
  return `Piano attivo: prima rata a ${monthLabelLong(firstMonth)}, ${cachedFormatCurrencyEUR(firstEur, true)}.`;
}
