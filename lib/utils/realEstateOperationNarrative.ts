/**
 * Patrimonio › Compravendita — every sentence the path speaks (owner, 2026-10-21): the question and the
 * help of each screen, why a screen cannot advance yet, the rows of the summary, the verdict of a
 * confirmed run, and the labels of the defaults in Impostazioni › Spese. No component writes a sentence.
 *
 * Imports from `formatters`, never `chartService` (AGENTS.md → Italian Localization).
 */

import { MONTH_NAMES } from '@/lib/constants/months';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { RealEstateCostKind, RealEstateOperationAnswers, RealEstateOperationScreen } from '@/types/realEstateOperation';
import {
  addMonthsIso,
  COST_NOTE,
  dateOfIso,
  figuresOf,
  instalmentOf,
  isValidIso,
  loanMonths,
  loansFinancing,
  propertyValueToday,
  resolveCategoryChoice,
  type PlanStep,
  type RealEstatePlanContext,
} from '@/lib/utils/realEstateOperationPlan';
import { REAL_ESTATE_COST_TYPES } from '@/types/realEstateOperation';
import { costKindsOf } from '@/lib/utils/realEstateOperationDraft';

const eur = (value: number) => cachedFormatCurrencyEUR(value);

/** «21 ottobre 2026». */
export function formatIsoDay(iso: string): string {
  if (!isValidIso(iso)) return iso;
  const date = dateOfIso(iso);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
}

/** «ottobre 2046». */
export function formatIsoMonth(iso: string): string {
  if (!isValidIso(iso)) return iso;
  const date = dateOfIso(iso);
  return `${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
}

/** The page's header line and the path's one-line purpose. */
export const COMPRAVENDITA_DESCRIPTION = 'Registra l’acquisto o la vendita di una casa: caparra, rogito, mutuo, polizze e costi, un evento alla volta.';

/** Under a life policy's «Assicurato»: what the choice does, and the shape without a household. */
export const LIFE_POLICY_INSURED_HINT = 'Con la Divisione accesa, i premi di una polizza personale sono suoi («Spesa di»); una CPI legata alla casa resta in comune.';
export const LIFE_POLICY_NO_MEMBERS_HINT = 'Per scegliere l’assicurato aggiungi i componenti della famiglia in Impostazioni › Generale; senza, la polizza prende il suo numero.';

/** Under a life policy's «Legata alla casa». */
export const LIFE_POLICY_LINK_HINT = 'Una CPI del mutuo: alla vendita la casa propone di fermarla. Una polizza personale resta libera.';

/** The label each cost row carries on the costs screen and in Impostazioni › Spese. */
export const REAL_ESTATE_COST_LABELS: Record<RealEstateCostKind, string> = {
  agency: 'Agenzia',
  notary: 'Notaio',
  purchaseTaxes: 'Imposte d’acquisto (registro o IVA, ipotecaria e catastale)',
  mortgageCosts: 'Istruttoria e perizia del mutuo',
  mortgageTax: 'Imposta sostitutiva sul mutuo',
  homeInsurance: 'Polizza scoppio e incendio',
  lifeInsurance: 'Polizza vita / CPI',
  mortgageInstalment: 'Rata e estinzione del mutuo',
  insuranceLoanInstalment: 'Rata del prestito di una polizza',
  saleCertificates: 'Certificazioni e pratiche (APE, conformità)',
  capitalGainsTax: 'Imposta sulla plusvalenza',
  payoffCosts: 'Costi dell’estinzione (penale, interessi del periodo)',
  insuranceRefund: 'Rimborso di una polizza',
};

/** The words of a screen: its eyebrow, its question, its help line. */
export interface ScreenCopy {
  eyebrow: string;
  question: string;
  help: string;
}

export function screenCopy(screen: RealEstateOperationScreen, answers: RealEstateOperationAnswers): ScreenCopy {
  const purchase = answers.kind === 'purchase';
  const preliminare = answers.event === 'preliminare';
  switch (screen) {
    case 'operazione':
      return {
        eyebrow: 'Operazione',
        question: 'Che cosa è successo?',
        help: 'Un percorso per evento: al preliminare registri caparra e agenzia, al rogito il resto. Ogni voce vale dal giorno in cui è successa.',
      };
    case 'immobile':
      return {
        eyebrow: 'Immobile',
        question: purchase ? (preliminare ? 'Quale casa compri, e a quanto?' : 'Quale casa hai comprato, e a quanto?') : 'Quale casa vendi, e a quanto?',
        help: purchase
          ? 'Il valore della casa sarà il prezzo pattuito: imposte, notaio e agenzia sono spese, non valore.'
          : 'Il prezzo è quello dell’atto. Se è diverso dal valore registrato, il percorso lo dice prima della vendita.',
      };
    case 'caparra':
      return {
        eyebrow: 'Caparra',
        question: purchase ? 'Quanto hai versato di caparra, e da quale conto?' : 'Quanto hai ricevuto di caparra, e su quale conto?',
        help: purchase
          ? 'Non è una spesa: è patrimonio che cambia forma. Il conto scende, la casa sale dello stesso importo.'
          : 'Non è un’entrata: è patrimonio che cambia forma. La casa scende, il conto sale dello stesso importo.',
      };
    case 'saldo':
      return {
        eyebrow: 'Rogito',
        question: purchase ? 'Da quale conto paghi il resto del prezzo?' : 'Su quale conto ricevi il resto del prezzo?',
        help: purchase
          ? 'Il saldo è il prezzo meno quanto la casa vale già (le caparre) e meno il mutuo, che la banca versa al venditore.'
          : 'Il saldo è il prezzo meno le caparre già ricevute e meno il mutuo che la banca dell’acquirente chiude: dopo il rogito la casa vale zero e resta in Patrimonio come «Azzerato».',
      };
    case 'rivaluta':
      return {
        eyebrow: 'Valore',
        question: 'Il prezzo non è il valore registrato.',
        help: 'Prima della vendita il valore della casa va al prezzo: la differenza è una rivalutazione (o una svalutazione), una riga a parte nel riepilogo.',
      };
    case 'mutuo':
      return {
        eyebrow: 'Mutuo',
        question: 'Hai acceso un mutuo?',
        help: 'Il mutuo diventa un prestito collegato alla casa; la rata, una serie mensile che ne riduce il debito per la quota capitale.',
      };
    case 'polizze':
      return {
        eyebrow: 'Polizze',
        question: 'Quali polizze vengono con la casa?',
        help: 'Scoppio e incendio, e le polizze vita o CPI: pagate subito, mensili, o con un prestito che le finanzia.',
      };
    case 'estinzione':
      return {
        eyebrow: 'Mutuo',
        question: 'Estingui il mutuo con la vendita?',
        help: 'La banca dell’acquirente chiude il debito con parte del prezzo: il prestito va a zero («Estinto»), il valore della casa scende dello stesso importo e sul conto arriva il resto. Non è una spesa: è patrimonio che cambia forma. Penale e interessi del periodo vanno tra i costi.',
      };
    case 'serie':
      return {
        eyebrow: 'Serie',
        question: 'Quali voci in calendario si fermano dopo il rogito?',
        help: 'Le voci successive al rogito delle serie spuntate vengono cancellate. Sono proposte le serie legate alla casa e quelle che ne rimborsano i prestiti; una serie si lega alla casa dal suo menu, «Collega la serie a un immobile».',
      };
    case 'costi':
      return {
        eyebrow: 'Costi',
        question: preliminare ? 'Hai pagato l’agenzia?' : purchase ? 'Quanto sono costati il rogito e il mutuo?' : 'Quanto è costata la vendita?',
        help: 'Ogni costo è una spesa nella sua categoria, dal conto dell’operazione e alla data dell’evento. Lascia vuoto ciò che non c’è.',
      };
    case 'centro':
      return {
        eyebrow: 'Centro di costo',
        question: 'Raccogli i costi in un centro?',
        help: 'Un centro somma i costi dell’operazione (non i trasferimenti né le rate): sai quanto è costata davvero.',
      };
    case 'riepilogo':
      return {
        eyebrow: 'Riepilogo',
        question: 'Ecco cosa verrà scritto.',
        help: 'Nulla è stato scritto finora. «Conferma» registra tutto, in quest’ordine; ogni voce poi si modifica dalla sua pagina.',
      };
  }
}

/** Why `screen` cannot advance yet, or null when it can. */
export function describeScreenBlock(screen: RealEstateOperationScreen, answers: RealEstateOperationAnswers, context: RealEstatePlanContext): string | null {
  const figures = figuresOf(answers, context);
  const positive = (value: number | null) => value !== null && value > 0;
  switch (screen) {
    case 'operazione':
      if (!isValidIso(answers.eventDateIso)) return 'Scegli la data dell’evento.';
      if (answers.eventDateIso > context.todayIso) return 'Registra l’evento il giorno in cui avviene, o dopo: la data è nel futuro.';
      return null;
    case 'immobile': {
      if (answers.kind === 'sale' && !answers.propertyId) return 'Scegli la casa che vendi.';
      if (answers.kind === 'purchase' && !answers.propertyId && !answers.propertyName.trim()) return 'Dai un nome alla casa.';
      if (!positive(answers.price)) return 'Scrivi il prezzo pattuito.';
      if (answers.kind === 'purchase' && (answers.price ?? 0) < figures.valueToday) return `Il prezzo è sotto quanto la casa vale già (${eur(figures.valueToday)}).`;
      if (answers.kind === 'purchase' && answers.ownership.mode === 'member' && !answers.ownership.memberId) return 'Scegli l’intestatario.';
      if (answers.kind === 'purchase' && answers.ownership.mode === 'shares') {
        const total = answers.ownership.shares.reduce((sum, share) => sum + (share.percent ?? 0), 0);
        if (Math.abs(total - 100) > 0.01) return `Le quote sommano a ${total}%: devono fare 100%.`;
      }
      return null;
    }
    case 'caparra':
      if (!answers.accountId) return 'Scegli il conto.';
      if (!positive(answers.depositAmount)) return 'Scrivi l’importo della caparra.';
      if (answers.kind === 'sale' && (answers.depositAmount ?? 0) > propertyValueToday(answers, context) + 0.005) return `La caparra supera il valore della casa (${eur(propertyValueToday(answers, context))}).`;
      return null;
    case 'saldo':
      if (!answers.accountId) return 'Scegli il conto.';
      if (answers.kind === 'sale' && (answers.depositsReceived ?? 0) < 0) return 'Le caparre ricevute non possono essere negative.';
      if (answers.kind === 'sale' && figures.saleBalance <= 0) return 'Le caparre coprono già tutto il prezzo: controlla gli importi.';
      if (answers.kind === 'purchase' && figures.purchaseBalance < -0.005) return `Caparre e mutuo superano il prezzo di ${eur(-figures.purchaseBalance)}: controlla gli importi.`;
      return null;
    case 'rivaluta':
      return null;
    case 'mutuo': {
      if (!answers.hasMortgage) return null;
      const loan = answers.mortgage;
      if (!positive(loan.principal)) return 'Scrivi l’importo del mutuo.';
      if (figures.purchaseBalance < -0.005) return `Il mutuo supera quanto resta da pagare della casa (${eur((answers.price ?? 0) - figures.valueToday)}).`;
      if (loan.ratePct === null || loan.ratePct < 0) return 'Scrivi il TAN (0 se non ci sono interessi).';
      if (!positive(loan.years) || loanMonths(loan) > 360) return 'Scrivi la durata in anni, al massimo 30.';
      if (!isValidIso(loan.firstInstalmentIso)) return 'Scegli la data della prima rata.';
      if (!resolveCategoryChoice(answers.mortgageCategory, context.categories, REAL_ESTATE_COST_TYPES.mortgageInstalment)) return 'Scegli la categoria delle rate (di tipo debito).';
      return null;
    }
    case 'polizze': {
      const home = answers.homeInsurance;
      if (home.mode !== 'none') {
        if (!positive(home.amount)) return 'Scrivi il premio della polizza scoppio e incendio.';
        if (home.mode === 'monthly' && (!positive(home.months) || (home.months ?? 0) > 360 || !isValidIso(home.firstIso))) return 'Scrivi da quando e per quanti mesi (al massimo 360) si paga la polizza scoppio e incendio.';
        if (!resolveCategoryChoice(home.category, context.categories, REAL_ESTATE_COST_TYPES.homeInsurance)) return 'Scegli la categoria della polizza scoppio e incendio.';
      }
      for (const [index, policy] of answers.lifePolicies.entries()) {
        const which = `polizza vita ${index + 1}`;
        if (context.familyMembers.length > 0 && !context.familyMembers.some((member) => member.id === policy.insuredMemberId)) return `Scegli chi assicura la ${which}.`;
        if (!positive(policy.amount)) return `Scrivi il premio della ${which}.`;
        if (policy.mode === 'monthly' && (!positive(policy.months) || (policy.months ?? 0) > 360 || !isValidIso(policy.firstIso))) return `Scrivi da quando e per quanti mesi (al massimo 360) si paga la ${which}.`;
        if (policy.mode === 'financed') {
          if (policy.loan.ratePct === null || policy.loan.ratePct < 0) return `Scrivi il TAN del prestito della ${which}.`;
          if (!positive(policy.loan.years) || loanMonths(policy.loan) > 360) return `Scrivi la durata del prestito della ${which}, al massimo 30 anni.`;
          if (!isValidIso(policy.loan.firstInstalmentIso)) return `Scegli la prima rata del prestito della ${which}.`;
          if (!resolveCategoryChoice(answers.lifeLoanCategory, context.categories, REAL_ESTATE_COST_TYPES.insuranceLoanInstalment)) return 'Scegli la categoria delle rate del prestito (di tipo debito).';
        } else if (!resolveCategoryChoice(answers.lifeCategory, context.categories, REAL_ESTATE_COST_TYPES.lifeInsurance)) {
          return 'Scegli la categoria delle polizze vita.';
        }
      }
      return null;
    }
    case 'estinzione': {
      const included = answers.payoffs.filter((payoff) => payoff.include);
      for (const payoff of included) {
        const loan = context.assets.find((asset) => asset.id === payoff.loanId);
        if (!positive(payoff.amount)) return `Scrivi quanto estingui di ${loan?.name ?? 'questo prestito'}.`;
        if (loan && (payoff.amount ?? 0) > loan.quantity + 0.005) return `${loan.name} ha ${eur(loan.quantity)} di debito: l’estinzione non può superarlo.`;
      }
      if (figures.saleNet < -0.005) return `Il debito supera quanto resta del prezzo (${eur(figures.saleBalance)}): estingui la differenza dal Cashflow, con «Estinzione anticipata».`;
      return null;
    }
    case 'serie':
      return null;
    case 'costi':
      for (const kind of costKindsOf(answers)) {
        const cost = answers.costs[kind];
        if (cost && positive(cost.amount) && !resolveCategoryChoice(cost.category, context.categories, REAL_ESTATE_COST_TYPES[kind])) {
          return `Scegli la categoria di «${REAL_ESTATE_COST_LABELS[kind]}».`;
        }
      }
      return null;
    case 'centro':
      if (answers.costCenter.mode === 'new' && !answers.costCenter.name.trim()) return 'Dai un nome al centro.';
      if (answers.costCenter.mode === 'existing' && !context.costCenters.some((center) => center.id === answers.costCenter.existingId)) return 'Scegli il centro.';
      return null;
    case 'riepilogo':
      return null;
  }
}

/** The «Rivaluta» screen's sentence: from what, to what, by how much. */
export function describeSaleAdjustment(answers: RealEstateOperationAnswers, context: RealEstatePlanContext, propertyName: string): string {
  const { valueToday, saleBalance, saleAdjustment } = figuresOf(answers, context);
  const direction = saleAdjustment > 0 ? 'sale' : 'scende';
  return `${propertyName} è registrata a ${eur(valueToday)} e la vendi per ${eur(saleBalance)}${(answers.depositsReceived ?? 0) > 0 ? ' oltre alle caparre' : ''}: prima della vendita il suo valore ${direction} di ${eur(Math.abs(saleAdjustment))}.`;
}

/** The rogito's balance in a sentence: what leaves (purchase) or reaches (sale) the account, and why. */
export function describeBalance(answers: RealEstateOperationAnswers, context: RealEstatePlanContext): string {
  const figures = figuresOf(answers, context);
  if (answers.kind === 'sale') {
    const payoff = figures.salePayoff > 0 ? ` e meno ${eur(figures.salePayoff)} di mutuo, che la banca dell’acquirente chiude` : '';
    return `Sul conto entrano ${eur(Math.max(0, figures.saleNet))}: il prezzo meno le caparre già ricevute${payoff}.`;
  }
  const already = figures.valueToday > 0 ? ` meno ${eur(figures.valueToday)} già nella casa` : '';
  const mortgage = answers.hasMortgage ? ` e ${eur(answers.mortgage.principal ?? 0)} di mutuo` : '';
  return `Dal conto escono ${eur(Math.max(0, figures.purchaseBalance))}: il prezzo${already}${mortgage}.`;
}

/** The line under the mortgage's fields: the instalment and the last one. */
export function describeMortgageInstalment(answers: RealEstateOperationAnswers): string | null {
  const loan = answers.mortgage;
  const months = loanMonths(loan);
  const instalment = instalmentOf(loan);
  if (!(instalment > 0) || months === 0 || !isValidIso(loan.firstInstalmentIso)) return null;
  const typed = loan.instalmentOverride !== null && loan.instalmentOverride > 0;
  return `${months} rate da ${eur(instalment)}${typed ? ' (scritta da te)' : ' (piano alla francese)'}, dalla prima del ${formatIsoDay(loan.firstInstalmentIso)}.`;
}

/** Names the plan needs to speak: the accounts and loans by id. */
export interface PlanNames {
  assetName: (id: string) => string;
  propertyName: string;
  costCenterName: string | null;
}

const refName = (ref: { id: string } | { ref: string; name?: string } | undefined, names: PlanNames): string => {
  if (!ref) return '';
  if ('id' in ref) return names.assetName(ref.id);
  if (ref.name) return ref.name;
  if (ref.ref === 'property') return names.propertyName;
  if (ref.ref === 'mortgage') return `Mutuo ${names.propertyName}`;
  return 'Prestito della polizza';
};

/** One row of the summary: what a step writes, in a sentence. */
export function describePlanStep(step: PlanStep, names: PlanNames): string {
  switch (step.kind) {
    case 'createCostCenter':
      return `Crea il centro di costo «${step.name}».`;
    case 'createProperty':
      return `Crea l’immobile «${step.name}»${step.isPrimaryResidence ? ', la casa in cui vivi (fuori dall’Allocazione e dal FIRE)' : ''}, a valore zero: lo alzano i trasferimenti sotto.`;
    case 'createLoan':
      return step.financesProperty
        ? `Crea il prestito «${step.name}» di ${eur(step.principal)} al TAN ${formatRate(step.ratePct)}, collegato a ${names.propertyName}.`
        : `Crea il prestito «${step.name}» di ${eur(step.principal)} al TAN ${formatRate(step.ratePct)}: ha pagato il premio, le rate lo rimborsano.`;
    case 'adjustProperty':
      return step.reason === 'mortgage'
        ? `Il valore di ${names.propertyName} sale di ${eur(step.delta)}: il mutuo che la banca versa al venditore.`
        : `${step.delta > 0 ? 'Rivaluta' : 'Svaluta'} ${names.propertyName} di ${eur(Math.abs(step.delta))}, al prezzo di vendita.`;
    case 'row': {
      const { row } = step;
      const center = row.inCostCenter && names.costCenterName ? ` · centro «${names.costCenterName}»` : '';
      const category = row.category.subCategoryName ? `${row.category.categoryName} › ${row.category.subCategoryName}` : row.category.categoryName;
      if (row.type === 'transfer') {
        return `Trasferimento di ${eur(row.amount)} da ${refName(row.account, names)} a ${refName(row.destination, names)}, il ${formatIsoDay(row.dateIso)} (${row.notes.split(' · ')[0].toLowerCase()}).`;
      }
      if (row.months && row.months > 0) {
        return `Serie di ${row.months} voci mensili da ${eur(row.amount)} dal ${formatIsoDay(row.dateIso)}, in ${category}${row.loan ? `, che riducono il debito di ${refName(row.loan, names)}` : ''}${row.property ? `, legata a ${refName(row.property, names)}` : ''} (${row.notes}).`;
      }
      if (row.isPayoff) return `Estinzione di ${eur(row.amount)} di ${refName(row.loan, names)} da ${refName(row.account, names)}, il ${formatIsoDay(row.dateIso)}, in ${category}.`;
      const verb = row.type === 'income' ? 'Entrata' : 'Spesa';
      return `${verb} di ${eur(row.amount)} — ${row.notes.split(' · ')[0]} — in ${category}, ${row.type === 'income' ? 'su' : 'da'} ${refName(row.account, names)} il ${formatIsoDay(row.dateIso)}${center}${row.property ? `, legata a ${refName(row.property, names)}` : ''}.`;
    }
    case 'payOffWithSale':
      return `Estingue ${step.loanName} con ${eur(step.amount)} del prezzo: il debito va a zero e il valore di ${names.propertyName} scende dello stesso importo. Nessuna spesa: è patrimonio che cambia forma.`;
    case 'stopSeries': {
      const { series } = step;
      const what = series.notes ? `«${series.notes}» (${series.categoryLabel}, ${eur(series.amount)})` : `«${series.categoryLabel}» da ${eur(series.amount)}`;
      const count = series.rows.length === 1 ? 'la voce' : `le ${series.rows.length} voci`;
      return `Ferma la serie ${what}: cancella ${count} dopo il rogito.`;
    }
  }
}

function formatRate(ratePct: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 3 }).format(ratePct / 100);
}

/** The verdict of a confirmed run: what it recorded, and where to see it. */
export function describeDone(answers: RealEstateOperationAnswers, propertyName: string, writes: number): string {
  const what =
    answers.kind === 'purchase'
      ? answers.event === 'preliminare' ? 'Preliminare d’acquisto registrato' : 'Rogito d’acquisto registrato'
      : answers.event === 'preliminare' ? 'Preliminare di vendita registrato' : 'Vendita registrata';
  return `${what}: ${propertyName}, ${writes} ${writes === 1 ? 'scrittura' : 'scritture'}.`;
}

/** The refusal when a write fails halfway: what landed, what did not, what to do. */
export function describePartialFailure(done: number, total: number, failedStep: string): string {
  return `Mi sono fermato al passo ${done + 1} di ${total} («${failedStep}»): i ${done} passi prima sono stati scritti, gli altri no. Controlla Patrimonio e Cashflow prima di riprovare: un nuovo «Conferma» riscriverebbe anche quelli già fatti.`;
}

/** The note of a cost row, for the costs screen: what the row will say. */
export function costNote(kind: RealEstateCostKind, propertyName: string): string {
  return `${COST_NOTE[kind]} · ${propertyName}`;
}

/** Whether the sale's property is financed: the estinzione screen's opening count. */
export function describeLoansToPayOff(propertyId: string, context: RealEstatePlanContext): string {
  const loans = loansFinancing(propertyId, context.assets);
  if (loans.length === 0) return 'Nessun prestito finanzia questa casa.';
  return loans.map((loan) => `${loan.name}: ${eur(loan.quantity)} di debito`).join(' · ');
}

/** The mortgage's last instalment month, for the polizze screen's default. */
export function describeMortgageEnd(answers: RealEstateOperationAnswers): string | null {
  const months = loanMonths(answers.mortgage);
  if (!answers.hasMortgage || months === 0 || !isValidIso(answers.mortgage.firstInstalmentIso)) return null;
  return formatIsoMonth(addMonthsIso(answers.mortgage.firstInstalmentIso, months - 1));
}
