/**
 * accumulationNarrative — every word the PAC (Accumulo) feature speaks.
 *
 * Everything the tab, its dialogs and the plan's guided path print — the draft's issues
 * (`describeDraftIssue`), labels, chips, button text, eyebrows and readings alike — so no PAC
 * component carries an Italian literal of its own. Pure: no Firebase, no DOM. Money and percentages go through `formatters.ts` (the Comma
 * Rule — an Italian `Intl`, never `toFixed`); a signed figure always carries the typographic
 * minus «−», never the ASCII hyphen.
 *
 * The ledger-matching states (`LineUiState`, from `accumulationPlanMatching.ts`): a still-`planned` line is `toConfirm` once a ledger trade matches it, `late` once its
 * installment is before the current month with no match, or plain `todo` otherwise; an `executed`
 * line whose linked trade was deleted from the ledger reads `lostLink`; a sale before its month reads
 * `upcoming` («In programma», 2026-11-19). `todo`, `upcoming` and `skipped` carry no action in the tile —
 * only `toConfirm`/`executed`/`late`/`lostLink` do.
 */
import type { MonthKey } from '@/types/accumulationPlan';
import type { LineUiState } from './accumulationPlanMatching';
import type { Narrative, PageVerdictModel } from './narrative';
import type { RowAnswerMap } from '@/components/ui/row-answers';
import type { ClassTrajectoryPoint } from './accumulationPlanUtils';
import { ASSET_CLASS_LABELS, bandForTarget, type RebalanceBand } from './allocationUtils';
import { cachedFormatCurrencyEUR, formatDate, formatNumberIt, formatPercentageIt } from './formatters';
import { addMonths, monthLabelLong, parseMonthKey } from './planMonths';
import { monthWithPrepositionA } from './patrimonioNarrative';

// ─────────────────────────────────────────────────────────────────────────
// Month labels — DESIGN.md: abbreviated lowercase on a label, full name in a reading.
// ─────────────────────────────────────────────────────────────────────────

const MONTH_NAMES_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** «ott 2026» — the chart/bar label register. */
export function monthLabelShort(month: MonthKey): string {
  const { year, monthIndex } = parseMonthKey(month);
  return `${MONTH_NAMES_SHORT[monthIndex] ?? month} ${year}`;
}

// The long label lives in planMonths.ts, which the page's first load reads without these words.
export { monthLabelLong };

/** «Oggi» for a trajectory's baseline point (index 0 of an active plan), else the short label. */
export function trajectoryPointLabel(point: MonthKey | 'baseline'): string {
  return point === 'baseline' ? 'Oggi' : monthLabelShort(point);
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────
// Signed figures — typographic minus, never the ASCII hyphen.
// ─────────────────────────────────────────────────────────────────────────

/** «+3,4 pp» / «−1,3 pp» / «0,0 pp». */
export function formatSignedPp(value: number, decimals = 1): string {
  const amount = formatNumberIt(Math.abs(value), decimals);
  if (value < -1e-9) return `−${amount} pp`;
  if (value > 1e-9) return `+${amount} pp`;
  return `${amount} pp`;
}

/** «+19,00 €» / «−19,00 €» / «0,00 €». */
export function formatSignedCurrency(value: number): string {
  const amount = cachedFormatCurrencyEUR(Math.abs(value));
  if (value < -0.005) return `−${amount}`;
  if (value > 0.005) return `+${amount}`;
  return amount;
}

/** «X, Y e Z» — the Italian serial list, no Oxford comma (mirrors `dialogNarrative.ts`). */
function listInItalian(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export type DraftIssueCode =
  | 'weights_sum'
  | 'weight_negative'
  | 'duplicate_asset'
  | 'buy_not_member'
  | 'position_not_tradable'
  | 'source_not_cash'
  | 'source_missing'
  | 'unassigned_tradable'
  | 'months_range'
  | 'negative_amount'
  | 'no_positions'
  | 'disposal_full_on_position'
  | 'disposal_quantity'
  | 'nothing_to_revise'
  | 'plan_moved'
  | 'sale_month_range'
  | 'sale_month_out'
  | 'swap_target';

/** What `validateDraftAgainstAssets` knows about a finding — enough to phrase it, not the final `DraftIssue`. */
export type DraftIssueContext =
  | { code: 'weights_sum'; sum: number }
  | { code: 'weight_negative'; label: string }
  | { code: 'duplicate_asset'; label: string }
  | { code: 'buy_not_member'; label: string }
  | { code: 'position_not_tradable'; label: string }
  | { code: 'source_not_cash'; label: string }
  | { code: 'source_missing' }
  | { code: 'unassigned_tradable'; label: string }
  | { code: 'months_range' }
  | { code: 'negative_amount' }
  | { code: 'no_positions' }
  | { code: 'disposal_full_on_position'; label: string }
  | { code: 'disposal_quantity'; label: string }
  | { code: 'nothing_to_revise' }
  | { code: 'plan_moved' }
  | { code: 'sale_month_range' }
  | { code: 'sale_month_out'; label: string }
  | { code: 'swap_target'; label: string };

/** One Italian sentence per `DraftIssue` code. */
export function describeDraftIssue(context: DraftIssueContext): string {
  switch (context.code) {
    case 'weights_sum':
      return `La somma dei pesi delle posizioni è ${formatPercentageIt(context.sum)}: deve essere 100%.`;
    case 'weight_negative':
      return `Il peso di «${context.label}» è negativo: deve essere maggiore o uguale a zero.`;
    case 'duplicate_asset':
      return `«${context.label}» compare in più di una posizione (o anche in una vendita): ogni asset può comparire una sola volta nel piano.`;
    case 'buy_not_member':
      return `Lo strumento d'acquisto di «${context.label}» non fa parte del gruppo: scegli un membro della posizione.`;
    case 'position_not_tradable':
      return `«${context.label}» non è negoziabile: solo gli asset tradable possono entrare nel piano.`;
    case 'source_not_cash':
      return `«${context.label}» non è un conto di liquidità: scegli un conto sorgente di classe Liquidità.`;
    case 'source_missing':
      return 'Un conto del piano non c\'è più: scegli di nuovo da quale conto comprare.';
    case 'unassigned_tradable':
      return `«${context.label}» ha un valore ma non è né in una posizione né in una vendita: assegnalo o escludilo.`;
    case 'months_range':
      return 'La durata deve essere un numero intero tra 1 e 60 mesi.';
    case 'negative_amount':
      return `La riserva e l'entrata mensile stimata non possono essere negative.`;
    case 'no_positions':
      return 'Il piano non ha nessuna posizione: aggiungine almeno una.';
    case 'disposal_full_on_position':
      return `«${context.label}» è una posizione del piano: vendi solo una parte delle quote, oppure toglila dalle posizioni.`;
    case 'disposal_quantity':
      return `Le quote da vendere di «${context.label}» devono essere un numero intero maggiore di zero.`;
    case 'nothing_to_revise':
      return 'Non c\'è nessuna rata da rivedere: tutte hanno già righe eseguite o saltate.';
    case 'plan_moved':
      return 'Il piano è cambiato mentre lo rivedevi: ricarica la pagina.';
    case 'sale_month_range':
      return 'Una vendita può andare solo a una rata che la revisione riscrive: scegli un mese dalla prima rata rivista in poi.';
    case 'sale_month_out':
      return `La vendita di «${context.label}» è fissata oltre l’ultima rata: scegli un mese del piano.`;
    case 'swap_target':
      return `La vendita di «${context.label}» reinveste in uno strumento che il piano non compra: scegline uno del piano.`;
    default:
      return 'Il piano non è valido.';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Tile chrome — every label that is not a full sentence.
// ─────────────────────────────────────────────────────────────────────────

export const ACCUMULO_TILE_EYEBROW = 'Accumulo';
export const ACCUMULO_MONTH_TILE_EYEBROW = 'Questo mese';
export const ACCUMULO_MONTH_TILE_DRAFT_EYEBROW = 'Piano in bozza';
export const ACCUMULO_MONTH_TILE_DONE_EYEBROW = 'Piano concluso';

export const ACCUMULO_ACTION_CREATE_PLAN = 'Crea piano';
export const ACCUMULO_ACTION_DELETE_DRAFT = 'Elimina bozza';
export const ACCUMULO_ACTION_DELETE_DRAFT_VERB = 'eliminare la bozza';
/** The draft view's link to the guided path, which continues the draft (2026-11-20). */
export const ACCUMULO_ACTION_CONTINUE = 'Continua';
export const ACCUMULO_ACTION_ACTIVATE = 'Attiva piano';
export const ACCUMULO_ACTION_REGISTER = 'Registra';
export const ACCUMULO_ACTION_REVISE = 'Rivedi il piano';
export const ACCUMULO_ACTION_KEEP_AS_IS = 'Lascia così';
export const ACCUMULO_ACTION_CALENDAR = 'Calendario';
export const ACCUMULO_ACTION_STOP = 'Interrompi';
export const ACCUMULO_ACTION_STOP_VERB = 'interrompere il piano';
export const ACCUMULO_ACTION_CLOSE = 'Chiudi piano';
export const ACCUMULO_ACTION_CLOSE_VERB = 'chiudere il piano';
/** Piani conclusi, on a plan interrupted under 30 days ago while no other is open. */
export const ACCUMULO_ACTION_REACTIVATE = 'Riattiva';
export const ACCUMULO_ACTION_REACTIVATE_VERB = 'riattivare il piano';
export const ACCUMULO_REACTIVATE_REFUSED =
  'Questo piano non si può riattivare: è stato interrotto da più di 30 giorni, è già concluso o c\u2019è un altro piano aperto.';
/** The service's refusal when the account already has a plan in draft or active (the lock, 2026-11-12). */
export const ACCUMULO_ONE_OPEN_PLAN =
  'Esiste già un piano di accumulo in bozza o attivo: chiudilo prima di crearne un altro.';
/** Column header of the closed-plans table for the reactivate action (visually empty). */
export const ACCUMULO_REACTIVATE_COLUMN = 'Azioni';
export const ACCUMULO_ACTION_SAVE = 'Salva';
export const ACCUMULO_ACTION_CANCEL = 'Annulla';

export const ACCUMULO_DRAFT_BOX_LIQUIDITY = 'Liquidità da spendere';
export const ACCUMULO_DRAFT_BOX_DISPOSALS = 'Vendite fuori piano';
export const ACCUMULO_DRAFT_BOX_INFLOWS = 'Entrate stimate';
export const ACCUMULO_DRAFT_BOX_POSITIONS = 'Posizioni';

export const ACCUMULO_DONE_BOX_EXECUTED = 'Eseguite';
export const ACCUMULO_DONE_BOX_RESIDUAL = 'Liquidità residua';
export const ACCUMULO_DONE_BOX_DRIFT = 'Scostamento medio';

/** A line's status as the tile shows it — the matching engine's `LineUiState`. */
export const ACCUMULO_LINE_STATUS_LABEL: Record<LineUiState, string> = {
  todo: 'Da fare',
  toConfirm: 'Da confermare',
  executed: 'Registrato',
  late: 'In ritardo',
  skipped: 'Saltata',
  lostLink: 'Collegamento perso',
  upcoming: 'In programma',
};

/** «Questo mese» in the review month the Consulente indicated (`isPlanReviewDue`): a note, not a warning. */
export const ACCUMULO_REVIEW_DUE_NOTE =
  'Il Consulente ha indicato questo mese per rivedere il piano: guarda se quote e rata vanno ancora bene.';

/** «Da luglio la rata sale a 1800 €: entra il ricavato di Fondo X.» — one sentence per month with a later sale (`listSaleSteps`). */
export function describeSaleStep(input: { month: MonthKey; instalmentEur: number; names: string[] }): string {
  return `Da ${monthLabelLong(input.month, false)} la rata sale a ${cachedFormatCurrencyEUR(input.instalmentEur, true)}: `
    + `entra il ricavato di ${input.names.join(', ')}${input.names.at(-1)?.endsWith('.') ? '' : '.'}`;
}

/**
 * Questo mese's header aside: «ottobre 2026 · rata 3 di 12» over the months that buy, «dicembre 2026 · solo riserva,
 * prima rata a febbraio» on a month that only refills the reserve (owner, 2026-11-19; `locateOpenMonth`).
 */
export function describeMonthTileAside(
  month: MonthKey,
  place: { kind: 'instalment'; ordinal: number; total: number } | { kind: 'refill' | 'swap'; firstBuyingMonth: MonthKey | undefined },
): string {
  if (place.kind === 'instalment') return `${monthLabelLong(month)} · rata ${place.ordinal} di ${place.total}`;
  // The year once the first instalment is 12 months away or more: the month alone names the next one (owner, 2026-11-20).
  const yearNeeded = place.firstBuyingMonth !== undefined && place.firstBuyingMonth >= addMonths(month, 12);
  const first = place.firstBuyingMonth ? `, prima rata a ${monthLabelLong(place.firstBuyingMonth, yearNeeded)}` : '';
  return `${monthLabelLong(month)} · ${place.kind === 'swap' ? 'scambio' : 'solo riserva'}${first}`;
}

/** The calendar's month: «Solo riserva» with no line to buy (owner, 2026-11-19), never «Registrato». */
export const ACCUMULO_REFILL_MONTH_LABEL = 'Solo riserva';
export const ACCUMULO_SWAP_TODO_LABEL = 'Scambio da fare';

export function describeInstallmentStatus(lines: ReadonlyArray<{ status: string; swap?: boolean }>): string {
  if (lines.length === 0) return ACCUMULO_REFILL_MONTH_LABEL;
  if (lines.every((line) => line.status !== 'planned')) return ACCUMULO_LINE_STATUS_LABEL.executed;
  // A month with only a swap's purchase is no instalment: «Scambio da fare» (owner, 2026-11-20).
  return lines.every((line) => line.swap) ? ACCUMULO_SWAP_TODO_LABEL : ACCUMULO_LINE_STATUS_LABEL.todo;
}
/** «Trovato nel Registro: 24 quote, 3134 €» under a line waiting for the reader's confirmation. */
export function describeMatchNote(quantity: number, amountEur: number): string {
  return `Trovato nel Registro: ${formatNumberIt(quantity, 0)} quote, ${cachedFormatCurrencyEUR(amountEur)}`;
}
export const ACCUMULO_ACTION_MARK_EXECUTED = 'Segna eseguita';
export const ACCUMULO_ACTION_SKIP = 'Salta';
export const ACCUMULO_ACTION_UNDO_EXECUTED = 'Segna da rifare';
export const ACCUMULO_ACTION_CONFIRM = 'Conferma';
export const ACCUMULO_ACTION_IGNORE_MATCH = 'Ignora';
export const ACCUMULO_ACTION_UNLINK = 'Scollega';
export const ACCUMULO_ACTION_REVIEW = 'Rivedi';
export const ACCUMULO_MANUAL_QUANTITY_LABEL = 'Quantità';
export const ACCUMULO_MANUAL_AMOUNT_LABEL = 'Importo (€)';
export const ACCUMULO_DISPOSALS_SECTION_TITLE = 'Vendite fuori piano';
/** A swap's purchase, under the sales that pay it (owner, 2026-11-20). */
export const ACCUMULO_SWAP_ROW_PREFIX = 'Con il ricavato: ';
/** The key under the strip's title: what the fill, the hairline and the ring on each track are. */
export const ACCUMULO_CLASS_STRIP_LEGEND = 'barra oggi · tacca target · anello a fine piano';

// ─────────────────────────────────────────────────────────────────────────
// ONE «rata»: the month's installment, and the average that names its first month
// ─────────────────────────────────────────────────────────────────────────

export interface InstallmentAverageInput {
  /** Σ of every installment's planned lines ÷ the number of installments. */
  averageEur: number;
  /** Σ of the FIRST installment's planned lines. */
  firstEur: number;
  firstMonth: MonthKey;
}

/** The same sentence as segments: only the amounts are mono (2026-11-20 — the words in mono read as a figure). */
function describeInstallmentAverageNarrative(input: InstallmentAverageInput): Narrative {
  const average = cachedFormatCurrencyEUR(input.averageEur, true);
  const first = cachedFormatCurrencyEUR(input.firstEur, true);
  if (average === first) return [{ text: average, mono: true }, { text: ' al mese' }];
  return [
    { text: 'in media ' },
    { text: average, mono: true },
    { text: ` al mese; la prima, ${monthLabelLong(input.firstMonth, false)}, ` },
    { text: first, mono: true },
  ];
}

export interface ReserveWarningReading {
  sourceCashEur: number;
  reserveEur: number;
  belowReserve: boolean;
  /** Present only when the recalibration would reduce the upcoming installment. */
  reducedInstallment?: { monthKey: MonthKey; suggestedTotalEur: number };
}

/** `null` when there is nothing to warn about — the caller renders no warning block at all. */
export function describeReserveWarning(input: ReserveWarningReading): Narrative | null {
  if (!input.belowReserve && !input.reducedInstallment) return null;

  const segments: Narrative = [
    { text: 'Liquidità nei conti sorgente ' },
    { text: cachedFormatCurrencyEUR(input.sourceCashEur), mono: true },
    { text: ' contro ' },
    { text: cachedFormatCurrencyEUR(input.reserveEur), mono: true },
    { text: ' di riserva: la riserva non si tocca' },
  ];

  if (input.reducedInstallment) {
    segments.push(
      { text: ', quindi la rata di ' },
      { text: monthLabelLong(input.reducedInstallment.monthKey) },
      { text: ' è ridotta a ' },
      { text: cachedFormatCurrencyEUR(input.reducedInstallment.suggestedTotalEur), mono: true },
      { text: '.' },
    );
  } else {
    segments.push({ text: '.' });
  }

  return segments;
}

/** The consequence sentence a failed read of the plan hands to `describeReadFailure`. */
export function describeAccumulationReadFailure(): string {
  return 'Non riesco a leggere il piano di accumulo. Gli altri numeri della pagina non dipendono da questo.';
}

// ─────────────────────────────────────────────────────────────────────────
// Class strip and the months bar
// ─────────────────────────────────────────────────────────────────────────

export interface ClassStripItemInput {
  label: string;
  /** The class's actual weight today — the absolute figure the strip now leads with (owner's
   *  call, 2026-09-20: absolute values primary, the drift a secondary, smaller line). */
  currentPct: number;
  targetPct: number;
  currentDriftPp: number;
  finalDriftPp: number;
  outOfBandNow: boolean;
  /** The first month (short label) the class re-enters band, when it currently sits outside it. */
  reentersAt?: string;
}

export interface ClassStripItem {
  label: string;
  /** «98,6%» — the class's share today, the row's prominent figure. */
  current: string;
  /** «target 95,0%» — beside it, in the same mono column register. */
  target: string;
  /** «+3,4 pp oggi → +1,3 pp a fine piano» — the same story as a relative delta, meant smaller. */
  secondary: string;
  /** «rientra in banda a giugno», only when `outOfBandNow` and a re-entry month is known. */
  note?: string;
  outOfBandNow: boolean;
}

export function describeClassStripItem(input: ClassStripItemInput): ClassStripItem {
  const current = formatPercentageIt(input.currentPct, 1);
  const target = `target ${formatPercentageIt(input.targetPct, 1)}`;
  const secondary = `${formatSignedPp(input.currentDriftPp)} oggi → ${formatSignedPp(input.finalDriftPp)} a fine piano`;
  const note = input.outOfBandNow && input.reentersAt ? `rientra in banda a ${input.reentersAt}` : undefined;
  return { label: input.label, current, target, secondary, note, outOfBandNow: input.outOfBandNow };
}

export interface AccumulationOutcomeFooterInput {
  maxDrift: { label: string; deltaPp: number } | null;
  residualEur: number;
  /** the reserve the plan keeps; named as intact only when the accounts still cover it. */
  reserve?: { eur: number; intact: boolean };
}

/** The tile's pinned footer: the plan's worst projected drift and what is left unspent. */
export function describeAccumulationOutcomeFooter(input: AccumulationOutcomeFooterInput): Narrative {
  const segments: Narrative = [{ text: 'A fine piano: ' }];
  if (input.maxDrift) {
    segments.push(
      { text: 'scostamento massimo ' },
      { text: formatSignedPp(input.maxDrift.deltaPp), mono: true },
      { text: ` su ${input.maxDrift.label}` },
    );
  } else {
    segments.push({ text: 'nessuno scostamento misurabile' });
  }
  segments.push(
    { text: ' · liquidità residua ' },
    { text: cachedFormatCurrencyEUR(input.residualEur), mono: true },
  );
  if (input.reserve && input.reserve.eur > 0 && input.reserve.intact) {
    segments.push({ text: ' · riserva di ' }, { text: cachedFormatCurrencyEUR(input.reserve.eur, true), mono: true }, { text: ' intatta' });
  }
  return segments;
}

export interface MonthsBarCaptionInput {
  startMonth: MonthKey;
  endMonth: MonthKey;
  closedCount: number;
  totalMonths: number;
}

/** «ott 2026 · 2 di 12 rate chiuse · set 2027» under the tile's month bar. */
export function describeMonthsBarCaption(input: MonthsBarCaptionInput): string {
  return `${monthLabelShort(input.startMonth)} · ${input.closedCount} di ${input.totalMonths} rate chiuse · ${monthLabelShort(input.endMonth)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// `ClassDriftChart`
// ─────────────────────────────────────────────────────────────────────────

/** The shaded ±band caption above the chart — named once, since `rule525` varies per class. */
export function describeDriftChartBand(bandPp: number, tightestLabel: string | null): string {
  const pp = formatNumberIt(bandPp, 1);
  return tightestLabel ? `banda ±${pp} pp (più stretta: ${tightestLabel})` : `banda ±${pp} pp`;
}

export interface ClassDriftChartAriaLine {
  label: string;
  startDriftPp: number;
  finalDriftPp: number;
}

/** The chart's `aria-label`: one clause per class, from where it starts to where it lands. */
export function describeClassDriftChartAriaLabel(input: { classLines: ClassDriftChartAriaLine[] }): string {
  if (input.classLines.length === 0) return 'Traiettoria delle classi verso il target.';
  const clauses = input.classLines.map(
    (line) => `${line.label} da ${formatSignedPp(line.startDriftPp)} a ${formatSignedPp(line.finalDriftPp)}`,
  );
  return `Scostamento dal target per classe, da oggi a fine piano: ${listInItalian(clauses)}.`;
}

// ─────────────────────────────────────────────────────────────────────────
// The plan path's summary (components/allocation/piano/) and the plan/model rows of Questo mese
// ─────────────────────────────────────────────────────────────────────────

/** The summary's reading, the plan in one line: «5 rate: in media 5905 € al mese; la prima, ottobre, 5800 € · copre il 98% del piano · leva a fine piano 1,27×». */
export function describeStep3Summary(input: {
  months: number;
  averageEur: number;
  firstEur: number;
  firstMonth: MonthKey;
  coveragePct: number | null;
  leverageRatio: number;
}): Narrative {
  const parts: Narrative = [
    { text: `${input.months} ${input.months === 1 ? 'rata' : 'rate'}: ` },
    ...describeInstallmentAverageNarrative({ averageEur: input.averageEur, firstEur: input.firstEur, firstMonth: input.firstMonth }),
  ];
  if (input.coveragePct !== null) parts.push({ text: ` · copre il ${formatPercentageIt(input.coveragePct, 0)} del piano` });
  if (input.leverageRatio > 1.01) parts.push({ text: ` · leva a fine piano ${formatNumberIt(input.leverageRatio, 2)}×` });
  return parts;
}

/** A row the path's «Nuovo strumento…» just created, until the assets are read again. */
export const ACCUMULO_STEP2_PENDING_ASSET_LABEL = 'Nuovo asset';

/** The summary writes the plan's weights into the model portfolio in the same action. */
export const ACCUMULO_STEP3_UPDATE_MODEL = 'Aggiorna anche il portafoglio modello';

/** The plan and the model no longer say the same (the row in Questo mese). */
export function describePlanModelDivergence(count: number): string {
  return `Il piano differisce dal portafoglio modello su ${count} strument${count === 1 ? 'o' : 'i'}.`;
}

/** The row's door: the path's revision with the model's quotas (`?da=modello`). */
export const ACCUMULO_ACTION_REVIEW_FROM_MODEL = 'Rivedi dal modello';

export function describeInsufficientLiquidityWarning(coveragePct: number): string {
  return `La liquidità stimata copre il ${formatPercentageIt(coveragePct, 0)} del piano: alcune posizioni restano sotto target anche a fine piano.`;
}

export function describeUnpricedWarning(labels: string[]): string {
  const who = listInItalian(labels);
  return labels.length === 1
    ? `${who} non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.`
    : `${who} non hanno un prezzo disponibile: non ricevono acquisti finché non li aggiorni.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Secondary modals
// ─────────────────────────────────────────────────────────────────────────

export function describeAccumuloModalEyebrow(planName: string): string {
  return `Accumulo · ${planName}`;
}

export const ACCUMULO_CALENDAR_TITLE = 'Calendario';

/** «misurato il 10/01» under a closed installment's row. */
export function describeMeasuredOn(date: Date): string {
  return `misurato il ${formatDate(date)}`;
}

export const ACCUMULO_ACTION_APPLY = 'Applica';

/** The note «Registra» pre-fills on the ledger trade. */
export function describeRegisterNote(planName: string, installmentIndex: number, totalMonths: number): string {
  return `PAC «${planName}», rata ${installmentIndex} di ${totalMonths}`;
}

export function describeRegisterSaleNote(planName: string): string {
  return `PAC «${planName}», vendita`;
}

export interface RecalibrationLineReading {
  label: string;
  plannedQuantity: number;
  suggestedQuantity: number;
}

export interface RecalibrationReadingInput {
  lines: RecalibrationLineReading[];
  plannedTotalEur: number;
  suggestedTotalEur: number;
}

const COUNT_WORDS = ['zero', 'un', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici'];

/**
 * Questo mese's reading (render, view 1): what the open month asks, and that registering from here
 * closes the line. «Quattro acquisti per 3134 €. Registrali da qui: l'operazione va nel Registro e la
 * riga si chiude da sola.» `null` when no line of the month is open.
 */
/** Questo mese in a month with no line (2026-11-17): the reserve refilling, or a share below one quota. */
export function describeQuietMonthReading(input: { refilling: boolean; nextMonth: MonthKey | undefined }): Narrative {
  const next = input.nextMonth ? monthWithPrepositionA(parseMonthKey(input.nextMonth).monthIndex + 1) : null;
  if (input.refilling) {
    return [{ text: 'Questo mese non c’è nulla da comprare: le entrate restano sui conti finché la liquidità non torna alla riserva.' + (next ? ' La prima rata è ' + next + '.' : '') }];
  }
  return [{ text: 'Questo mese non c’è nulla da comprare: la quota del mese passa alla prossima rata' + (next ? ', ' + next : '') + '.' }];
}

export function describeMonthReading(openCount: number, openAmountEur: number): Narrative | null {
  if (openCount <= 0) return null;
  const count = COUNT_WORDS[openCount] ?? String(openCount);
  const one = openCount === 1;
  return [
    { text: `${capitalize(count)} acquist${one ? 'o' : 'i'} per ` },
    { text: cachedFormatCurrencyEUR(openAmountEur, true), mono: true },
    { text: `. Registrali da qui: l'operazione va nel Registro e la riga si chiude da sola.`.replace('Registrali', one ? 'Registralo' : 'Registrali') },
  ];
}

/**
 * The recalibration notice: «I prezzi sono cambiati dall'attivazione: con quelli di oggi
 * la rata compra 9 VWCE invece di 10 e 2 AVWS in più (−95,20 €).»
 */
export function describePriceChangeNotice(input: RecalibrationReadingInput): Narrative {
  const totalDeltaEur = input.suggestedTotalEur - input.plannedTotalEur;
  const changed = input.lines
    .filter((line) => line.suggestedQuantity !== line.plannedQuantity)
    // The biggest moves first; the notice names at most three, the rest is counted.
    .sort((a, b) => Math.abs(b.suggestedQuantity - b.plannedQuantity) - Math.abs(a.suggestedQuantity - a.plannedQuantity));
  const parts = changed.slice(0, 3).map((line) =>
    line.suggestedQuantity < line.plannedQuantity
      ? `${line.suggestedQuantity} ${line.label} invece di ${line.plannedQuantity}`
      : `${line.suggestedQuantity - line.plannedQuantity} ${line.label} in più`,
  );
  if (changed.length > 3) parts.push(`altre ${changed.length - 3} righe che cambiano`);
  if (parts.length === 0) return [{ text: 'La rata resta come pianificata.' }];
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
  return [
    { text: `I prezzi sono cambiati dall'attivazione: con quelli di oggi la rata compra ${joined} (` },
    { text: formatSignedCurrency(totalDeltaEur), mono: true },
    { text: ').' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// Traiettoria mese per mese e rientro in banda
// ─────────────────────────────────────────────────────────────────────────

const BAND_REENTRY_SUFFIX = 'se i prezzi restano quelli di oggi';

function reentryLabel(point: ClassTrajectoryPoint, draft: boolean): string {
  if (draft || point.month === 'baseline') return `mese ${point.index}`;
  return monthLabelLong(point.month, false);
}

/**
 * «Nella banda: Liquidità da gennaio, Obbligazioni da marzo. Da marzo tutto il piano è in banda,
 * se i prezzi restano quelli di oggi.» For every class outside the band at `fromIndex`, the first
 * later point where its drift is back inside `bandForTarget`. A class that never comes back is
 * named apart («Obbligazioni resta fuori banda fino alla fine del piano.»); a plan with every
 * class already inside says so. `draft` names a month by its number («dal mese 6»): a draft has
 * no calendar the reader has seen yet.
 */
export function describeBandReentry(
  trajectory: ClassTrajectoryPoint[],
  fromIndex: number,
  band: RebalanceBand,
  options: { draft?: boolean } = {},
): string {
  const draft = options.draft ?? false;
  const from = trajectory.find((point) => point.index === fromIndex);
  if (!from) return '';
  const inBand = (entry: { driftPp: number; targetPct: number }) => Math.abs(entry.driftPp) <= bandForTarget(band, entry.targetPct) + 1e-9;

  const back: { label: string; point: ClassTrajectoryPoint }[] = [];
  const never: string[] = [];
  for (const [assetClass, entry] of Object.entries(from.byClass)) {
    if (!entry || inBand(entry)) continue;
    const label = ASSET_CLASS_LABELS[assetClass] ?? assetClass;
    const reentry = trajectory.find((point) => {
      if (point.index <= fromIndex) return false;
      const later = point.byClass[assetClass as keyof typeof point.byClass];
      return !!later && inBand(later);
    });
    if (reentry) back.push({ label, point: reentry });
    else never.push(label);
  }
  if (back.length === 0 && never.length === 0) return 'Tutte le classi sono già in banda.';

  back.sort((a, b) => a.point.index - b.point.index);
  const parts: string[] = [];
  if (back.length > 0) {
    parts.push(`Nella banda: ${back.map((item) => `${item.label} ${draft ? 'dal' : 'da'} ${reentryLabel(item.point, draft)}`).join(', ')}.`);
  }
  if (never.length > 0) {
    parts.push(
      never.length === 1
        ? `${never[0]} resta fuori banda fino alla fine del piano.`
        : `${listInItalian(never)} restano fuori banda fino alla fine del piano.`,
    );
  } else {
    const last = back[back.length - 1];
    parts.push(`${draft ? 'Dal' : 'Da'} ${reentryLabel(last.point, draft)} tutto il piano è in banda, ${BAND_REENTRY_SUFFIX}.`);
  }
  return parts.join(' ');
}

/** The chart's reading row: «ottobre 2026 · Azioni −1,8 pp · Obbligazioni +0,4 pp». */
export function describeDriftReading(
  point: ClassTrajectoryPoint,
  band: RebalanceBand,
): { when: string; items: { label: string; text: string; outOfBand: boolean }[] } {
  const when = point.month === 'baseline' ? 'oggi' : `${monthLabelLong(point.month)}${point.source === 'measured' ? '' : ' · previsto'}`;
  const items = Object.entries(point.byClass).flatMap(([assetClass, entry]) => {
    if (!entry) return [];
    const label = ASSET_CLASS_LABELS[assetClass] ?? assetClass;
    const outOfBand = Math.abs(entry.driftPp) > bandForTarget(band, entry.targetPct) + 1e-9;
    return [{ label, text: `${label} ${formatSignedPp(entry.driftPp)}`, outOfBand }];
  });
  return { when, items };
}

// ─────────────────────────────────────────────────────────────────────────
// Verdetto della scheda Accumulo
// ─────────────────────────────────────────────────────────────────────────

export type AccumuloVerdictInput =
  /** `reserveEur` is kept on the accounts; `otherCashEur` is the cash class outside them (a money-market fund). */
  | { state: 'none'; sourceCashEur: number; reserveEur: number; otherCashEur?: number; hasModel: boolean }
  /** `firstEur`: the first instalment when a later sale makes the instalments differ (2026-11-19); null = even. */
  | { state: 'draft'; months: number; monthlyEur: number; startMonth: MonthKey; firstEur?: number | null }
  /** Active, before its first month (2026-11-12): nothing to buy yet. `todayYear` is the Italian year of today. */
  | { state: 'scheduled'; startMonth: MonthKey; firstMonth: MonthKey; firstInstalmentEur: number; lineCount: number; months: number; todayYear: number; swapMonth?: MonthKey; swapNames?: string[] }
  /** Active, a month with no line (2026-11-17): the reserve refilling, or a share below one quota. */
  | { state: 'quiet'; monthKey: MonthKey; nextMonth?: MonthKey; installmentIndex: number; months: number; refilling: boolean }
  | {
      state: 'active';
      monthKey: MonthKey;
      installmentTotalEur: number;
      lineCount: number;
      executedCount: number;
      toConfirmCount: number;
      lateCount: number;
      /** Every line of the open installment is closed (executed or skipped). */
      installmentClosed: boolean;
      installmentIndex: number;
      months: number;
      investedEur: number;
      planTotalEur: number;
      /** `describeBandReentry`, or empty when there is no trajectory. */
      reentry: string;
      /** A month that is no rata (2026-11-20): only a swap, or nothing to buy beside late lines; absent = a rata. */
      kind?: 'swap' | 'none';
      /** With `kind`: the month of the next rata. */
      nextMonth?: MonthKey;
    }
  | { state: 'done'; investedEur: number; totalEur: number };

const mono = (text: string) => ({ text, mono: true });

/** «Il perché · il rientro nella banda»: what stands behind the first sentence below `desktop:`. */
export const ACCUMULO_REST_LABEL = 'il rientro nella banda';

/** The lead of the verdict's sentence: up to its first full stop, when a second sentence follows (`splitVerdict`). */
function cutAtFirstSentence(sentence: Narrative, restLabel: string | null): Pick<PageVerdictModel, 'leadLength' | 'restLabel'> {
  if (restLabel === null) return {};
  const leadLength = sentence.findIndex((segment) => segment.text.endsWith('.')) + 1;
  if (leadLength <= 0 || leadLength >= sentence.length) return {};
  return { leadLength, restLabel };
}

/** The Accumulo tab's verdict: one headline, one sentence, a tone. */
export function describeAccumuloVerdict(input: AccumuloVerdictInput): PageVerdictModel {
  if (input.state === 'none') {
    const target = input.hasModel ? 'verso il portafoglio modello' : 'verso i pesi che scegli';
    // The allocation's cash quota is not spendable (owner, 2026-11-17): the sentence names what is beyond it.
    // The figures printed are the whole cash class and the quota; the difference is the same on the accounts.
    const beyondEur = input.sourceCashEur - input.reserveEur;
    const other = input.otherCashEur ?? 0;
    const sentence: Narrative =
      input.sourceCashEur <= 0.005
        ? [{ text: `Non hai liquidità nei conti: un piano la spende in rate mensili ${target}.` }]
        : input.reserveEur <= 0
          ? [
              { text: 'Nei conti di liquidità hai ' },
              mono(cachedFormatCurrencyEUR(input.sourceCashEur, true)),
              { text: `: un piano li spende in rate mensili ${target}.` },
            ]
          : beyondEur > 0.005
            ? [
                { text: "Oltre la quota di liquidità dell'allocazione (" },
                mono(cachedFormatCurrencyEUR(input.reserveEur + other, true)),
                { text: '), nella liquidità hai ' },
                mono(cachedFormatCurrencyEUR(beyondEur, true)),
                { text: `: un piano li spende in rate mensili ${target}.` },
              ]
            : [
                ...withinQuotaHead(input.sourceCashEur + other, input.reserveEur + other),
                { text: 'le entrate mensili la riportano alla quota prima che un piano compri.' },
              ];
    return { headline: 'Nessun piano di accumulo aperto.', tone: 'neutral', sentence };
  }

  if (input.state === 'draft') {
    return {
      // With a later sale the instalments differ: «N rate da X €» would be false, the first one is named instead.
      headline: input.firstEur !== undefined && input.firstEur !== null
        ? `Bozza pronta: ${input.months} ${input.months === 1 ? 'rata' : 'rate'} da ${monthLabelLong(input.startMonth, false)}, la prima di ${cachedFormatCurrencyEUR(input.firstEur, true)}.`
        : `Bozza pronta: ${input.months} ${input.months === 1 ? 'rata' : 'rate'} da ${cachedFormatCurrencyEUR(input.monthlyEur, true)} da ${monthLabelLong(input.startMonth, false)}.`,
      tone: 'neutral',
      sentence: [{ text: 'Attivala per fissare il calendario.' }],
    };
  }

  if (input.state === 'scheduled') {
    const { year, monthIndex } = parseMonthKey(input.startMonth);
    const when = `${monthWithPrepositionA(monthIndex + 1)}${year === input.todayYear ? '' : ` ${year}`}`;
    const first = parseMonthKey(input.firstMonth);
    const firstWhen = input.firstMonth === input.startMonth ? '' : `, ${monthWithPrepositionA(first.monthIndex + 1)}${first.year === input.todayYear ? '' : ` ${first.year}`}`;
    return {
      headline: `Il piano parte ${when}: prima rata di ${cachedFormatCurrencyEUR(input.firstInstalmentEur, true)} in ${input.lineCount} ${input.lineCount === 1 ? 'acquisto' : 'acquisti'}${firstWhen}.`,
      tone: 'neutral',
      sentence: [{
        text: input.swapMonth && input.swapNames?.length
          ? `${input.months} ${input.months === 1 ? 'rata' : 'rate'}; ${monthWithPrepositionA(parseMonthKey(input.swapMonth).monthIndex + 1)} lo scambio: il ricavato delle vendite compra ${input.swapNames.join(' e ')}.`
          : `${input.months} ${input.months === 1 ? 'rata' : 'rate'}; fino ad allora non c’è nulla da comprare.`,
      }],
    };
  }

  if (input.state === 'quiet') {
    const inMonth = monthWithPrepositionA(parseMonthKey(input.monthKey).monthIndex + 1);
    const next = input.nextMonth ? monthWithPrepositionA(parseMonthKey(input.nextMonth).monthIndex + 1) : null;
    const headline = input.refilling
      ? inMonth.charAt(0).toUpperCase() + inMonth.slice(1) + ' le entrate riportano la liquidità alla riserva' + (next ? ': la prima rata è ' + next : '') + '.'
      : 'Niente da comprare ' + inMonth + (next ? ': la prossima rata è ' + next : '') + '.';
    return {
      headline,
      tone: 'neutral',
      sentence: [{ text: `Rata ${input.installmentIndex} di ${input.months}: fino ad allora non c’è nulla da comprare.` }],
    };
  }

  if (input.state === 'done') {
    return {
      headline: `Piano concluso: investiti ${cachedFormatCurrencyEUR(input.investedEur, true)} su ${cachedFormatCurrencyEUR(input.totalEur, true)}.`,
      tone: 'positive',
      sentence: [{ text: 'Chiudilo per aprirne un altro.' }],
    };
  }

  const parts: string[] = [];
  if (input.lineCount > 0 && input.executedCount === input.lineCount) {
    parts.push('tutti registrati');
  } else {
    if (input.executedCount > 0) parts.push(`${input.executedCount} ${input.executedCount === 1 ? 'registrato' : 'registrati'}`);
    if (input.toConfirmCount > 0) parts.push(`${input.toConfirmCount} da confermare`);
  }
  let headline = input.kind === 'none'
    ? `Niente da comprare ${monthWithPrepositionA(parseMonthKey(input.monthKey).monthIndex + 1)}`
    : `${input.kind === 'swap' ? 'Scambio' : 'Rata'} di ${monthLabelLong(input.monthKey, false)}: ${cachedFormatCurrencyEUR(input.installmentTotalEur, true)} in ${input.lineCount} ${input.lineCount === 1 ? 'acquisto' : 'acquisti'}`;
  if (parts.length > 0) headline += `, ${parts.length === 2 ? `${parts[0]} e ${parts[1]}` : parts[0]}`;
  if (input.lateCount > 0) headline += `, ${input.lateCount} in ritardo`;
  headline += '.';

  const next = input.nextMonth ? parseMonthKey(input.nextMonth) : null;
  const sentence: Narrative = [
    {
      text: input.kind
        ? next
          ? `Prima rata ${monthWithPrepositionA(next.monthIndex + 1)} ${next.year}, investiti finora `
          : 'Investiti finora '
        : `Rata ${input.installmentIndex} di ${input.months}, investiti finora `,
    },
    mono(cachedFormatCurrencyEUR(input.investedEur, true)),
    { text: ' su ' },
    mono(cachedFormatCurrencyEUR(input.planTotalEur, true)),
    { text: '.' },
    // The band re-entry is a sentence of its own: below `desktop:` it goes behind «Il perché» (The
    // Binding-Clause Rule). The first sentence restates ONE strip cell, «Investito», so it is not a
    // lead of length 0.
    ...(input.reentry ? ([{ text: ` ${input.reentry}` }] as Narrative) : []),
  ];
  const tone = input.lateCount > 0 ? 'warning' : input.installmentClosed ? 'positive' : 'neutral';
  return { headline, tone, sentence, ...cutAtFirstSentence(sentence, input.reentry ? ACCUMULO_REST_LABEL : null) };
}

// ─────────────────────────────────────────────────────────────────────────
// Stato vuoto della scheda Accumulo e tile «Classi del piano»
// ─────────────────────────────────────────────────────────────────────────

export const ACCUMULO_EMPTY_DOES_TITLE = 'Cosa fa';
export const ACCUMULO_EMPTY_DOES: readonly string[] = [
  'Divide liquidità ed entrate in rate mensili, a quote intere.',
  'Tiene intatta la riserva che scegli.',
  'Vende al primo mese gli strumenti che lasci fuori, anche solo in parte.',
  'Riconosce gli acquisti nel Registro e ti chiede solo di confermare.',
  'Ricalcola la rata quando i prezzi cambiano, se lo accetti.',
  'Mostra mese per mese come si muovono le classi, leva compresa.',
];
export const ACCUMULO_EMPTY_DOESNT_TITLE = 'Cosa non fa';
export const ACCUMULO_EMPTY_DOESNT: readonly string[] = [
  'Non vende gli strumenti del piano per ribilanciare: per quello c’è Ribilancia.',
  'Non manda ordini al broker e non conta le commissioni.',
  'Un piano alla volta, al massimo 60 mesi.',
  'Non sceglie strumenti che non hai indicato: puoi aggiungerli da valutare.',
];
export const ACCUMULO_EMPTY_ASIDE = 'nessun piano aperto';
export const ACCUMULO_ACTION_OPEN_MODEL = 'Apri il portafoglio modello';

/** «12 rate da 3208 € con 10.000 € di riserva, dai pesi di oggi.» — or why there is nothing to show. */
export function describeAccumuloPreview(
  preview: { months: number; reserveEur: number; monthlyEur: number; inflowEur?: number; weightsFrom?: 'today' | 'model' } | null,
  /** The reserve the preview used (the allocation's cash quota): named when there is no preview. */
  reserveEur = 0,
): Narrative {
  if (!preview) {
    const tail = ' non resta liquidità da spendere, o nessuno strumento è acquistabile: crea il piano per scegliere riserva ed entrate.';
    return reserveEur > 0
      ? [
          { text: "Con la quota di liquidità dell'allocazione (" },
          { text: cachedFormatCurrencyEUR(reserveEur, true), mono: true },
          { text: ') da tenere,' + tail },
        ]
      : [{ text: 'Non resta liquidità da spendere, o nessuno strumento è acquistabile: crea il piano per scegliere riserva ed entrate.' }];
  }
  return [
    { text: `${preview.months} rate da ` },
    { text: cachedFormatCurrencyEUR(preview.monthlyEur, true), mono: true },
    { text: ' con ' },
    { text: cachedFormatCurrencyEUR(preview.reserveEur, true), mono: true },
    { text: ` di riserva, ${preview.weightsFrom === 'model' ? 'dal portafoglio modello' : 'dai pesi di oggi'}` },
    ...((preview.inflowEur ?? 0) > 0
      ? ([{ text: ' e ' }, { text: cachedFormatCurrencyEUR(preview.inflowEur as number, true), mono: true }, { text: ' al mese di entrate.' }] as Narrative)
      : ([{ text: ' e senza entrate mensili.' }] as Narrative)),
  ];
}

/** The empty tile's reading: «Nei conti di liquidità hai 36.500 €. Un piano di accumulo li
 *  spende in rate mensili verso i pesi di oggi, a quote intere, e ti dice ogni mese cosa comprare.» */
/** «Nei conti hai X €, entro la quota di liquidità dell'allocazione (Y €)» — the head of the within-quota readings. */
function withinQuotaHead(cashEur: number, quotaEur: number): Narrative {
  return [
    { text: 'Nella liquidità hai ' },
    { text: cachedFormatCurrencyEUR(cashEur, true), mono: true },
    { text: ", entro la quota dell'allocazione (" },
    { text: cachedFormatCurrencyEUR(quotaEur, true), mono: true },
    { text: '): ' },
  ];
}

/**
 * The empty tile's reading. The allocation's cash quota is not spendable, and the inflows first bring
 * the cash back to it (owner, 2026-11-17): within the quota the reading says how many months that takes.
 * `context` reads the case with no preview (nothing would be bought in the preview's months).
 */
export function describeAccumuloIntro(
  preview: { cashEur: number; reserveEur: number; refillMonths?: number; otherCashEur?: number; weightsFrom?: 'today' | 'model' } | null,
  context?: { reserveEur: number; cashEur: number; inflowEur: number; otherCashEur?: number },
): Narrative {
  if (!preview) {
    const otherCtx = context?.otherCashEur ?? 0;
    if (context && context.reserveEur > 0 && context.cashEur + otherCtx > 0.005 && context.cashEur - context.reserveEur <= 0.005) {
      const head = withinQuotaHead(context.cashEur + otherCtx, context.reserveEur + otherCtx);
      if (context.inflowEur <= 0) {
        return [...head, { text: 'senza entrate mensili non resta nulla da investire.' }];
      }
      const refill = Math.ceil((context.reserveEur - context.cashEur) / context.inflowEur - 1e-9);
      return [
        ...head,
        { text: 'con ' },
        { text: cachedFormatCurrencyEUR(context.inflowEur, true), mono: true },
        { text: ' al mese di entrate tornano alla quota in ' + refill + (refill === 1 ? ' mese' : ' mesi') + ', e solo dopo un piano compra.' },
      ];
    }
    return describeAccumuloPreview(null, (context?.reserveEur ?? 0) + otherCtx);
  }
  const other = preview.otherCashEur ?? 0;
  const toward = preview.weightsFrom === 'model' ? 'verso il portafoglio modello' : 'verso i pesi di oggi';
  if (preview.reserveEur > 0 && preview.cashEur - preview.reserveEur <= 0.005) {
    const refill = preview.refillMonths ?? 0;
    return [
      ...withinQuotaHead(preview.cashEur + other, preview.reserveEur + other),
      {
        text:
          (refill > 0 ? (refill === 1 ? 'le entrate del primo mese' : 'le entrate dei primi ' + refill + ' mesi') + ' la riportano alla quota, poi ' : '') +
          'un piano di accumulo investe il resto ' + toward + ', a quote intere, e ti dice ogni mese cosa comprare.',
      },
    ];
  }
  if (preview.reserveEur > 0) {
    return [
      { text: "Oltre la quota di liquidità dell'allocazione (" },
      { text: cachedFormatCurrencyEUR(preview.reserveEur + other, true), mono: true },
      { text: ') hai ' },
      { text: cachedFormatCurrencyEUR(preview.cashEur - preview.reserveEur, true), mono: true },
      { text: `. Un piano di accumulo li spende in rate mensili ${toward}, a quote intere, e ti dice ogni mese cosa comprare.` },
    ];
  }
  return [
    { text: 'Nei conti di liquidità hai ' },
    { text: cachedFormatCurrencyEUR(preview.cashEur, true), mono: true },
    {
      text: `. Un piano di accumulo li spende in rate mensili ${toward}, a quote intere, e ti dice ogni mese cosa comprare.`,
    },
  ];
}

/** The preview box's lead: «Con una riserva di 10.000 € e 1000 € al mese, 12 rate da 3208 € porterebbero:» */
export function describeAccumuloPreviewLead(preview: { months: number; reserveEur: number; monthlyEur: number; inflowEur?: number; refillMonths?: number; otherCashEur?: number }): Narrative {
  const inflow = preview.inflowEur ?? 0;
  const refill = preview.refillMonths ?? 0;
  const quotaEur = preview.reserveEur + (preview.otherCashEur ?? 0);
  return [
    ...(quotaEur > 0
      ? ([{ text: "Con la quota di liquidità dell'allocazione (" }, { text: cachedFormatCurrencyEUR(quotaEur, true), mono: true }, { text: ')' }] as Narrative)
      : ([{ text: 'Con una riserva di ' }, { text: cachedFormatCurrencyEUR(0, true), mono: true }] as Narrative)),
    ...(inflow > 0
      ? ([{ text: ' e ' }, { text: cachedFormatCurrencyEUR(inflow, true), mono: true }, { text: ' al mese' }] as Narrative)
      : ([{ text: ' e senza entrate mensili' }] as Narrative)),
    ...(refill > 0 ? ([{ text: ', dopo ' + refill + (refill === 1 ? ' mese' : ' mesi') + ' per ricostituirla' }] as Narrative) : []),
    { text: `, ${preview.months} rate da ` },
    { text: cachedFormatCurrencyEUR(preview.monthlyEur, true), mono: true },
    { text: ' porterebbero:' },
  ];
}

export const ACCUMULO_CLASSES_TILE_EYEBROW = 'Classi del piano';
export const ACCUMULO_CLASSES_TILE_ASIDE = 'scostamento dal target, mese per mese';

// ─────────────────────────────────────────────────────────────────────────
// Piani conclusi and the suggested monthly inflow
// ─────────────────────────────────────────────────────────────────────────

export const ACCUMULO_CLOSED_PLANS_EYEBROW = 'Piani conclusi';
export const ACCUMULO_CLOSED_PLANS_COLUMNS: readonly string[] = ['Piano', 'Periodo', 'Rate', 'Investito', 'Scostamento finale'];
/** «2 piani» / «1 piano» beside the tile's eyebrow. */
export function describeClosedPlansAside(count: number): string {
  return `${count} ${count === 1 ? 'piano' : 'piani'}`;
}

export interface ClosedPlanReadingInput {
  name: string;
  startMonth: MonthKey;
  endMonth: MonthKey;
  closedCount: number;
  totalMonths: number;
  interrupted: boolean;
  investedEur: number;
  plannedEur: number;
  /** The largest final drift, or `null` when the plan never closed a month. */
  finalDrift: { label: string; driftPp: number } | null;
}

function wholeEuro(value: number): string {
  return `${formatNumberIt(Math.round(value), 0)} €`;
}

/** «gen 2026 – giu 2026» */
export function describeClosedPlanPeriod(startMonth: MonthKey, endMonth: MonthKey): string {
  return `${monthLabelShort(startMonth)} – ${monthLabelShort(endMonth)}`;
}

/** «6 / 6» or «2 / 3 · interrotto». */
export function describeClosedPlanInstallments(closedCount: number, totalMonths: number, interrupted: boolean): string {
  const base = `${closedCount} / ${totalMonths}`;
  return interrupted && closedCount < totalMonths ? `${base} · interrotto` : base;
}

/** «24.318 € su 24.500 €» */
export function describeClosedPlanInvested(investedEur: number, plannedEur: number): string {
  return `${wholeEuro(investedEur)} su ${wholeEuro(plannedEur)}`;
}

/** «+0,6 pp su Azioni», «—» when no month was ever measured. */
export function describeClosedPlanDrift(drift: { label: string; driftPp: number } | null): string {
  return drift ? `${formatSignedPp(drift.driftPp)} su ${drift.label}` : '—';
}

/**
 * The monthly inflow a draft may suggest: the MEDIAN of the last full months' savings (owner,
 * 2026-11-12; `useMonthlySavingsMedian`), floored to the ten. `null` = no suggestion — under three
 * months of data, a failed read, or a median that is not a saving: the field stays empty, never «0 €».
 */
export function suggestMonthlyInflow(medianEur: number | null | undefined): number | null {
  if (medianEur === null || medianEur === undefined || medianEur <= 0) return null;
  return Math.floor(medianEur / 10) * 10;
}

/** «Il tuo risparmio mensile mediano degli ultimi 12 mesi è di 1.200 €.» — the months the median spans (3 to 12). */
export function describeSuggestedInflow(suggestedEur: number, months: number): string {
  return `Il tuo risparmio mensile mediano degli ultimi ${months} mesi è di ${cachedFormatCurrencyEUR(suggestedEur, true)}.`;
}

/** The note of «Questo mese» and of the path's summary when the plan ends after the Consulente's review date (2026-11-12). */
export function describePlanPastReview(reviewByIso: string): string {
  return `Il piano finisce dopo la revisione dell'allocazione (${formatDate(new Date(`${reviewByIso.slice(0, 10)}T12:00:00`))}): rivedilo quando rivedi i target.`;
}

// ─────────────────────────────────────────────────────────────────────────
// La composizione sul telefono
// ─────────────────────────────────────────────────────────────────────────

/**
 * The ids of the tab's cells below `desktop:` (`useMobileSections`, The Closed-Row Rule). `mese` is THE
 * tile — Questo mese, or the empty state — and never closes (The First-Screen Rule): it is among the ids
 * only as the target of the strip's first cell. Re-exported by `accumuloSummary.ts`.
 */
export const ACCUMULO_SECTION_IDS = {
  mese: 'acc-mese',
  modello: 'acc-modello',
  classi: 'acc-classi',
  criteri: 'acc-criteri',
  conclusi: 'acc-conclusi',
} as const;

/** What a CLOSED row says beside its eyebrow: words, never a figure (The Closed-Row Rule). */
export const ACCUMULO_CLOSED_ASIDES = {
  [ACCUMULO_SECTION_IDS.modello]: 'pesi per strumento',
  [ACCUMULO_SECTION_IDS.classi]: 'scostamento mese per mese',
  [ACCUMULO_SECTION_IDS.criteri]: 'cosa chiedi al modello',
  [ACCUMULO_SECTION_IDS.conclusi]: 'piani chiusi e interrotti',
} as const;

/** The Portafoglio modello row with no saved model says so beside its eyebrow instead of the usual words. */
export const ACCUMULO_MODEL_MISSING_ASIDE = 'nessun modello salvato';

export interface AccumuloClosedAnswersInput {
  /** `comparePlanToModel(...).count` with an active plan and a saved model; `null` otherwise. */
  modelDifferenceCount: number | null;
  /** The saved model rests on another basis: its row keeps the words «superato». Absent = fresh. */
  modelStale?: boolean;
  /** `selectClassStripRows(...)` at the cursor's month, `[]` without a trajectory. */
  classRows: { outOfBandNow: boolean; reentryMonth?: MonthKey | 'baseline' }[];
  /** The plan's first month: where a `baseline` re-entry reads. */
  planStartMonth: MonthKey | null;
  /** The number of criteria the saved objectives ask the model, `0` when off. */
  criteriaCount: number;
  /** The most recently closed plan's last month, `null` without a closed plan. */
  lastClosedMonth: MonthKey | null;
}

/**
 * What each closed row answers in the landscape index (the rows' `RowAnswers`): one short phrase with at
 * most ONE figure that the strip, THE tile and the verdict's first sentence do not print; `null` where the
 * row keeps its words. Months and counts read from the figures the tiles already hold.
 */
export function describeAccumuloClosedAnswers(input: AccumuloClosedAnswersInput): RowAnswerMap {
  const outNow = input.classRows.filter((row) => row.outOfBandNow);
  const everyReenters = outNow.length > 0 && outNow.every((row) => !!row.reentryMonth);
  const lastReentry = everyReenters
    ? outNow.map((row) => (row.reentryMonth === 'baseline' ? input.planStartMonth : (row.reentryMonth as MonthKey))).filter((month): month is MonthKey => !!month).sort().pop()
    : undefined;
  return {
    [ACCUMULO_SECTION_IDS.modello]:
      input.modelDifferenceCount === null || input.modelStale
        ? null
        : [{ text: input.modelDifferenceCount === 0 ? 'allineato al piano' : `differisce su ${input.modelDifferenceCount} ${input.modelDifferenceCount === 1 ? 'strumento' : 'strumenti'}` }],
    [ACCUMULO_SECTION_IDS.classi]: lastReentry ? [{ text: `rientro a ${monthLabelLong(lastReentry, false)}` }] : null,
    [ACCUMULO_SECTION_IDS.criteri]: input.criteriaCount > 0 ? [{ text: `${input.criteriaCount} ${input.criteriaCount === 1 ? 'criterio' : 'criteri'}` }] : null,
    [ACCUMULO_SECTION_IDS.conclusi]: input.lastClosedMonth ? [{ text: `ultimo a ${monthLabelLong(input.lastClosedMonth, false)}` }] : null,
  };
}

// ---------------------------------------------------------------------------
// «Dal Consulente» — the corrections on a plan the Consulente's «Applica» created (2026-11-20)
// ---------------------------------------------------------------------------

export const ACCUMULO_ADVISOR_NOTES_EYEBROW = 'Dal Consulente';
/** The notes shown before the rest folds. */
export const ACCUMULO_ADVISOR_NOTES_VISIBLE = 3;
export function describeMoreAdvisorNotes(count: number): string {
  return `Altre ${count}`;
}
