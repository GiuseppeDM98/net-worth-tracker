/**
 * The sentences of the plan's tick on «Applica» (the summary, the instruments to create). Apart from
 * allocationAdviceNarrative.ts because Allocazione's page imports that module whole on its first load, and these
 * are read only by the lazy tick (2026-11-20, perf:budget: the swap's and the bond's sentences cost the page
 * 1,4 KB gz there — doc/guide/velocita.md § Il ratchet e il tetto alzato).
 */
import { formatCurrency, formatDate, formatNumberIt } from '@/lib/utils/formatters';
import { bondUnitPriceEur } from '@/lib/utils/bondPricing';
import { monthLabelLong } from '@/lib/utils/planMonths';
import type { AdvicePlanBuild, NewInstrumentPricing } from '@/lib/utils/advicePlan';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The tick's line (2026-11-20): months, first month, inflow, the first instalment that buys, the
 * instruments to create, the sales with the TOTAL of their estimated taxes (no per-sale figure).
 */
export function describeAdvicePlanSummary(build: Pick<AdvicePlanBuild, 'draft' | 'preview' | 'toCreate' | 'reconciled' | 'firstIndex'>): string {
  const { draft } = build;
  const installments = build.preview.schedule.installments;
  // A swap's purchase is no instalment (owner, 2026-11-20): the first rata is the first month the rates buy.
  const totals = installments.map((installment) => installment.lines.filter((line) => !line.swap).reduce((sum, line) => sum + line.plannedAmountEur, 0));
  const firstAt = totals.findIndex((total) => total > 0);
  const first = firstAt >= 0 ? totals[firstAt] : 0;
  let line = `${count(draft.months, 'mese', 'mesi')} da ${monthLabelLong(draft.startMonth)}, ${formatCurrency(draft.liquidity.monthlyInflowEur)} al mese: prima rata ${formatCurrency(first)}`;
  // The first purchase later than the plan's first month (owner, 2026-11-20): its month, and the months that
  // refill the reserve before it when they are the reason.
  if (firstAt > 0) {
    line += ` a ${monthLabelLong(build.preview.schedule.installments[firstAt].month)}`;
    const refill = build.preview.liquidity?.refillMonths ?? 0;
    if (refill > 0) line += `, dopo ${count(refill, 'mese', 'mesi')} che ${refill === 1 ? 'ricostituisce' : 'ricostituiscono'} la riserva`;
  }
  line += swapClauses(build);
  if (build.toCreate.length > 0) line += `, ${count(build.toCreate.length, 'strumento', 'strumenti')} da creare`;
  const sales = build.reconciled.rows.filter((row) => row.action === 'sell');
  if (sales.length > 0) {
    const taxes = sales.map((row) => row.estimatedTaxEur).filter((tax): tax is number => typeof tax === 'number');
    const unknown = sales.length - taxes.length;
    const n = count(sales.length, 'vendita', 'vendite');
    if (taxes.length === 0) line += `, ${n} con tasse non stimabili`;
    else line += `, ${n} con tasse stimate ${formatCurrency(taxes.reduce((sum, tax) => sum + tax, 0))}${unknown > 0 ? `, non stimabili su ${unknown}` : ''}`;
  }
  return `${line}.`;
}

/** «, scambio a dicembre 2026: vendi X e Y e compri Z», one per bought instrument and month the schedule really buys. */
function swapClauses(build: Pick<AdvicePlanBuild, 'draft' | 'preview' | 'reconciled' | 'firstIndex'>): string {
  const installments = build.preview.schedule.installments;
  const soldName = (assetId: string) =>
    build.reconciled.instruments.find((instrument) => instrument.assetId === assetId)?.name
    ?? build.draft.positions.find((position) => position.buyAssetId === assetId)?.label
    ?? '';
  const groups = new Map<string, { month: string; bought: string; sold: string[] }>();
  for (const disposal of build.draft.disposals) {
    if (!disposal.reinvestAssetId) continue;
    const installment = installments[(disposal.monthIndex ?? build.firstIndex) - build.firstIndex];
    // An unpriced target bought nothing: the sale went to the plan's money, the click's notes say so.
    if (!installment?.lines.some((line) => line.swap && line.assetId === disposal.reinvestAssetId)) continue;
    const key = `${installment.month}:${disposal.reinvestAssetId}`;
    const bought = build.draft.positions.find((position) => position.buyAssetId === disposal.reinvestAssetId)?.label ?? '';
    const group = groups.get(key) ?? { month: installment.month, bought, sold: [] };
    group.sold.push(soldName(disposal.assetId));
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => `, scambio a ${monthLabelLong(group.month)}: vendi ${group.sold.join(' e ')} e compri ${group.bought}`)
    .join('');
}

/** One line per instrument the click creates: its listing and price, or why it has none. */
export function describeNewInstrument(name: string, pricing: NewInstrumentPricing): string {
  switch (pricing.kind) {
    case 'priced':
      return `${name} · ${pricing.quote.symbol} · ${formatCurrency(pricing.quote.price, pricing.quote.currency)} · ${formatDate(new Date(pricing.quote.quotedAt))}`;
    case 'bond': {
      if (pricing.pricePct === null) return `${name} · titolo di Stato: il prezzo arriva al primo aggiornamento. Completa nominale, cedola e scadenza in Patrimonio.`;
      const quote = `Borsa Italiana ${formatNumberIt(pricing.pricePct, 2)}`;
      const unit = bondUnitPriceEur(pricing);
      if (!pricing.indexed) return `${name} · titolo di Stato · ${quote}: ${formatNumberIt(unit ?? 0, 3)} € per euro di nominale. Completa cedola e scadenza in Patrimonio.`;
      if (unit === null) return `${name} · BTP€i · ${quote}, senza il coefficiente di indicizzazione: scrivilo qui sotto perché il piano lo compri da subito.`;
      return `${name} · BTP€i · ${quote} × coefficiente ${(pricing.coefficient ?? 1).toLocaleString('it-IT', { maximumFractionDigits: 6 })}: ${formatNumberIt(unit, 3)} € per euro di nominale. Completa cedola, scadenza e coefficienti in Patrimonio.`;
    }
    case 'unpriced':
      return pricing.reason === 'no-symbol'
        ? `${name} · senza ticker né prezzo: completalo in Patrimonio perché il piano lo compri.`
        : `${name} · senza prezzo: nessun listino ha un prezzo degli ultimi 5 giorni. Il piano lo compra quando gli dai un ticker in Patrimonio.`;
  }
}
