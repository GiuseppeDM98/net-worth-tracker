/**
 * The words of the plan's guided path (doc/guide/accumulo.md § Il percorso: creare e rivedere): each screen's
 * theme, question and help, the sales' tax line, the summary's sentences, the host's states and «Conferma»'s
 * outcomes. Pure; the figures come from lib/utils/planPath.ts and the plan's engine, the tab's sentences
 * are reused as they are (`describeStep3Summary`, `describeSaleStep`, the two warnings).
 */

import type { Asset } from '@/types/assets';
import type { MonthKey, PlanDisposal, PlanPosition } from '@/types/accumulationPlan';
import type { Narrative } from '@/lib/utils/narrative';
import {
  buildDraftPreview,
  disposalMonthIndex,
  isOpenSavedDisposal,
  proceedsOfDisposal,
  resolvePositionStates,
} from '@/lib/utils/accumulationPlanUtils';
import {
  describeDraftIssue,
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
import { roundToCents } from '@/lib/utils/cents';
import {
  planPathToDraft,
  planPathToRevision,
  previewPlanPathRevision,
  type PlanPathAnswers,
  type PlanPathContext,
  type PlanPathRevision,
  type PlanPathSale,
  type PlanPathScreen,
} from '@/lib/utils/planPath';

export const PLAN_PATH_TITLE = 'Piano di accumulo';
export const PLAN_PATH_BACK_LINK = 'Torna ad Accumulo';
export const PLAN_PATH_DEMO = "Il piano di accumulo non si crea nell'account demo.";
export const PLAN_PATH_NO_TARGETS = 'Prima imposta i target in Impostazioni › Allocazione: il piano va verso di essi.';
export const PLAN_PATH_START_REPLACES = 'Le quote che avevi scritto vengono sostituite.';
export const PLAN_PATH_CONFIRM = 'Conferma';
export const PLAN_PATH_CONFIRMING = 'Creo il piano…';
export const PLAN_PATH_REVISING = 'Rivedo il piano…';
/** The page header's description in a revision. */
export const PLAN_PATH_REVISION_DESCRIPTION = 'Rivedi il piano: le rate chiuse restano come sono.';
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
  plan: 'Dal piano com’è',
} as const;

/** «La prima rata è a dicembre 2026.» — the month after «today». */
export function firstInstalmentMonth(todayMonth: MonthKey): MonthKey {
  return addMonths(todayMonth, 1);
}

export function planPathScreenCopy(screen: PlanPathScreen, context: Pick<PlanPathContext, 'todayMonth' | 'revision'>): { theme: string; question: string; help: string } {
  if (context.revision) {
    const revised = revisionScreenCopy(screen, context.revision);
    if (revised) return revised;
  }
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

/** The wording of a revision where it differs from a new plan's; null = the same screen copy. */
function revisionScreenCopy(screen: PlanPathScreen, revision: PlanPathRevision): { theme: string; question: string; help: string } | null {
  switch (screen) {
    case 'partenza':
      return { theme: 'Partenza', question: 'Da dove ripartono le quote?', help: 'Le rate già chiuse non cambiano.' };
    case 'versamento':
      return { theme: 'Versamento', question: 'Quanto versi ogni mese, da adesso?', help: 'Anche 0: il piano investe allora solo la liquidità che hai già.' };
    case 'durata': {
      const next = monthLabelLong(revision.firstMonth);
      const closed = revision.closedCount;
      const help = closed === 0 ? `La prossima rata è ${next}.` : `${closed} ${closed === 1 ? 'rata è chiusa' : 'rate sono chiuse'}; la prossima è ${next}.`;
      return { theme: 'Durata', question: 'Quanti mesi restano?', help };
    }
    case 'vendite':
      return {
        theme: 'Vendite',
        question: 'Cambi le vendite?',
        help: 'Il ricavato entra nelle rate dal mese della vendita; se alla riserva manca qualcosa, prima la ricostituisce.',
      };
    case 'riepilogo':
      return { theme: 'Riepilogo', question: 'Confermi la revisione?', help: 'Con «Conferma» il piano cambia dalla prossima rata.' };
    default:
      return null;
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

/** A revision's sale month, the plan's index k: «gennaio 2027 (6º)»; a late sale's own month «ottobre 2026 · in ritardo». */
export function describeRevisionSaleMonthOption(revision: Pick<PlanPathRevision, 'firstIndex' | 'firstMonth'>, index: number): string {
  const month = monthLabelLong(addMonths(revision.firstMonth, index - revision.firstIndex));
  return index < revision.firstIndex ? `${month} · in ritardo` : `${month} (${index}º)`;
}

/** A sale a revision cannot change, as a plain line: «ETF A · 5 quote · già venduta». */
export function describeLockedSale(name: string, disposal: PlanDisposal): string {
  const state = disposal.status === 'executed' ? 'già venduta' : disposal.status === 'skipped' ? 'saltata' : 'da confermare nel Registro';
  return `${name} · ${describeQuantity(disposal.quantity ?? null)} · ${state}`;
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

/** «tutte le quote» for every share, else «1 quota» / «n quote». */
function describeQuantity(quantity: number | null): string {
  if (quantity === null) return 'tutte le quote';
  return quantity === 1 ? '1 quota' : `${quantity} quote`;
}

function describeSaleQuantity(sale: PlanPathSale): string {
  return describeQuantity(sale.quantity);
}

export interface PlanPathSummary {
  /** `describeStep3Summary`: the plan in one line. */
  headline: Narrative;
  /** «La prima rata è a dicembre 2026: 1.500 €.»; null in a revision, whose headline says the next instalment. */
  first: string | null;
  saleSteps: string[];
  /** A revision: one line per saved or new sale that changes («tolta», «spostata a …», «nuova, …», «da a a b quote, …»). */
  changes: string[];
  sales: string[];
  taxTotal: string | null;
  warnings: string[];
  firstMonth: MonthKey;
  firstEur: number;
}

/** The summary's sentences, on the draft «Conferma» writes. */
export function buildPlanPathSummary(answers: PlanPathAnswers, context: PlanPathContext, today: Date = new Date(0)): PlanPathSummary {
  if (context.revision) return buildRevisionSummary(answers, context, context.revision, today);
  const draft = planPathToDraft(answers, context);
  const assetsById = new Map<string, Asset>(context.assets.map((asset) => [asset.id, asset]));
  const preview = buildDraftPreview({ draft, allAssets: context.assets, targets: context.targets, band: context.band, compare: context.compare, deps: context.deps, firstIndex: 1 });
  const nameOf = (assetId: string) => assetsById.get(assetId)?.name ?? assetId;

  // Coverage: L against the ideal deficit Σ max(0, target% × B − value).
  const coveragePct = liquidityCoveragePct(draft.positions, draft.disposals, preview.liquidity.L, assetsById, context);

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
    changes: [],
    sales,
    taxTotal: describePathTaxTotal(estimates.map(({ estimate }) => estimate.taxEur)),
    warnings,
    firstMonth,
    firstEur,
  };
}

/** L against the ideal deficit Σ max(0, target% × B − value); null when it covers it. */
function liquidityCoveragePct(positions: PlanPosition[], disposals: PlanDisposal[], L: number, assetsById: Map<string, Asset>, context: PlanPathContext): number | null {
  const states = resolvePositionStates(positions, assetsById, context.deps, disposals);
  const base = states.reduce((sum, state) => sum + state.currentValueEur, 0) + L;
  const deficit = states.filter((state) => !state.unpriced).reduce((sum, state) => sum + Math.max(0, (state.targetPercentage / 100) * base - state.currentValueEur), 0);
  const raw = deficit <= 0.5 ? null : Math.min(100, (L / deficit) * 100);
  return raw === null || raw >= 99.5 ? null : raw;
}

/** A revision's sale quantity in a change line: the number, «tutte le» for every share. */
function changeQuantity(quantity: number | undefined): string {
  return quantity === undefined ? 'tutte le' : String(quantity);
}

/**
 * The revision's summary from the engine's own result (`buildRevisedPlan`, never `buildDraftPreview`): the months left and the next instalment, the sale
 * steps after it, one line per sale that changes (a saved sale with new shares is ONE line, though the engine
 * sees removed + new), the tax of the new sales, the warnings on the revised plan. A refused revision says why.
 */
function buildRevisionSummary(answers: PlanPathAnswers, context: PlanPathContext, revision: PlanPathRevision, today: Date): PlanPathSummary {
  const assetsById = new Map<string, Asset>(context.assets.map((asset) => [asset.id, asset]));
  const nameOf = (assetId: string) => assetsById.get(assetId)?.name ?? assetId;
  const monthOf = (index: number) => addMonths(revision.firstMonth, index - revision.firstIndex);
  const result = previewPlanPathRevision(answers, context, today);
  if (!result.ok) {
    const reason = result.issue === 'duplicate_asset'
      ? describeDraftIssue({ code: 'duplicate_asset', label: nameOf(result.assetId) })
      : describeDraftIssue({ code: result.issue });
    return { headline: [{ text: reason }], first: null, saleSteps: [], changes: [], sales: [], taxTotal: null, warnings: [], firstMonth: revision.firstMonth, firstEur: 0 };
  }
  const { plan } = result;
  const upcoming = plan.installments.filter((installment) => installment.index >= result.firstIndex);
  const next = upcoming[0];
  const firstMonth = next?.month ?? revision.firstMonth;
  const firstEur = roundToCents((next?.lines ?? []).reduce((sum, line) => sum + line.plannedAmountEur, 0));
  const left = answers.months ?? upcoming.length;
  const headline: Narrative = [
    { text: `${left} ${left === 1 ? 'rata' : 'rate'} da ${monthLabelLong(firstMonth)}: la prossima di ` },
    { text: cachedFormatCurrencyEUR(firstEur, true), mono: true },
    { text: '.' },
  ];
  const saleSteps = listSaleSteps({ installments: upcoming, disposals: plan.disposals, firstIndex: result.firstIndex, nameOf }).map(describeSaleStep);

  const input = planPathToRevision(answers, context);
  const saved = new Map(revision.plan.disposals.filter(isOpenSavedDisposal).map((disposal) => [disposal.assetId, disposal]));
  const added = new Map(input.disposals.map((disposal) => [disposal.assetId, disposal]));
  const removed = input.removedDisposalAssetIds ?? [];
  const changes: string[] = [];
  for (const assetId of removed) {
    const before = saved.get(assetId);
    const after = added.get(assetId);
    if (after && before) {
      changes.push(`${nameOf(assetId)}: da ${changeQuantity(before.quantity)} a ${changeQuantity(after.quantity)} quote, a ${monthLabelLong(monthOf(disposalMonthIndex(after)))}.`);
    } else {
      changes.push(`${nameOf(assetId)}: tolta.`);
    }
  }
  for (const [assetId, index] of Object.entries(input.movedDisposalMonthIndexes ?? {})) {
    changes.push(`${nameOf(assetId)}: spostata a ${monthLabelLong(monthOf(index))}.`);
  }
  for (const disposal of input.disposals) {
    if (removed.includes(disposal.assetId)) continue;
    const quantity = disposal.quantity === undefined ? 'tutte le quote' : disposal.quantity === 1 ? '1 quota' : `${disposal.quantity} quote`;
    changes.push(`${nameOf(disposal.assetId)}: nuova, ${quantity} a ${monthLabelLong(monthOf(disposalMonthIndex(disposal)))}.`);
  }

  // The tax lines of the sales «Conferma» adds (a changed sale is a new one for the engine).
  const estimates = answers.sales.filter((sale) => added.has(sale.assetId)).map((sale) => ({ sale, estimate: estimateSale(sale, context) }));
  const sales = estimates.map(({ sale, estimate }) => `${nameOf(sale.assetId)}: ${describeSaleQuantity(sale)} a ${monthLabelLong(monthOf(sale.month))}, ${estimate.line}.`);

  const openDisposals = plan.disposals.filter((disposal) => disposal.status !== 'executed' && disposal.status !== 'skipped');
  const coveragePct = liquidityCoveragePct(plan.positions, openDisposals, result.liquidity.L, assetsById, context);
  const unpriced = resolvePositionStates(plan.positions, assetsById, context.deps, openDisposals).filter((state) => state.unpriced);
  const warnings: string[] = [];
  if (coveragePct !== null) warnings.push(describeInsufficientLiquidityWarning(coveragePct));
  if (unpriced.length > 0) warnings.push(describeUnpricedWarning(unpriced.map((state) => plan.positions.find((position) => position.id === state.positionId)?.label ?? state.positionId)));

  return { headline, first: null, saleSteps, changes, sales, taxTotal: describePathTaxTotal(estimates.map(({ estimate }) => estimate.taxEur)), warnings, firstMonth, firstEur };
}

/** «Conferma» after the Italian month changed: nothing written. */
export function describeMonthChanged(firstMonth: MonthKey): string {
  return `Nel frattempo è cambiato il mese: la prima rata è ora a ${monthLabelLong(firstMonth)}. Controlla il riepilogo e premi di nuovo «Conferma».`;
}

/** The draft was written, its activation failed: the next press overwrites it. */
export function describeActivationFailed(reason: string): string {
  return `Il piano è salvato ma non attivo: ${reason.replace(/[.\s]+$/, '')}. Premi di nuovo «Conferma».`;
}

/** «Piano rivisto: prossima rata a dicembre 2026, 1.500 €.»: the month and the planned total of the first revised instalment. */
export function describePlanRevised(firstMonth: MonthKey, firstEur: number): string {
  return `Piano rivisto: prossima rata a ${monthLabelLong(firstMonth)}, ${cachedFormatCurrencyEUR(firstEur, true)}.`;
}

/** «Piano attivo: prima rata a dicembre 2026, 1.500 €.» */
export function describePlanActive(firstMonth: MonthKey, firstEur: number): string {
  return `Piano attivo: prima rata a ${monthLabelLong(firstMonth)}, ${cachedFormatCurrencyEUR(firstEur, true)}.`;
}
