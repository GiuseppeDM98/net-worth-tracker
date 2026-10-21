/**
 * accumulationNarrative — every word the PAC (Accumulo) feature speaks (doc/pac-ate.md §10.5).
 *
 * Session S1 seeded only `describeDraftIssue` (`accumulationPlanSchema.ts` §6). Session S4 adds
 * everything the tile, its three-step editor and its two secondary modals print — labels, chips,
 * button text, eyebrows and readings alike — so no PAC component carries an Italian literal of its
 * own. Pure: no Firebase, no DOM. Money and percentages go through `formatters.ts` (the Comma
 * Rule — an Italian `Intl`, never `toFixed`); a signed figure always carries the typographic
 * minus «−», never the ASCII hyphen.
 *
 * Session S5 adds the ledger-matching states (`LineUiState`, from `accumulationPlanMatching.ts`
 * §9): a still-`planned` line is `toConfirm` once a ledger trade matches it, `late` once its
 * installment is before the current month with no match, or plain `todo` otherwise; an `executed`
 * line whose linked trade was deleted from the ledger reads `lostLink`. `todo` and `skipped` carry
 * no action in the tile — only `toConfirm`/`executed`/`late`/`lostLink` do (doc/pac-ate.md §10.2
 * punto 4).
 */
import type { MonthKey } from '@/types/accumulationPlan';
import type { LineUiState } from './accumulationPlanMatching';
import type { Narrative, PageVerdictModel } from './narrative';
import type { RowAnswerMap } from '@/components/ui/row-answers';
import type { ClassTrajectoryPoint } from './accumulationPlanUtils';
import { ASSET_CLASS_LABELS, bandForTarget, type RebalanceBand } from './allocationUtils';
import { cachedFormatCurrencyEUR, formatDate, formatNumberIt, formatPercentageIt } from './formatters';

// ─────────────────────────────────────────────────────────────────────────
// Month labels — DESIGN.md: abbreviated lowercase on a label, full name in a reading.
// ─────────────────────────────────────────────────────────────────────────

const MONTH_NAMES_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];
const MONTH_NAMES_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function parseMonthKey(month: MonthKey): { year: number; monthIndex: number } {
  const [yearStr, monthStr] = month.split('-');
  return { year: Number(yearStr), monthIndex: Number(monthStr) - 1 };
}

/** «ott 2026» — the chart/bar label register. */
export function monthLabelShort(month: MonthKey): string {
  const { year, monthIndex } = parseMonthKey(month);
  return `${MONTH_NAMES_SHORT[monthIndex] ?? month} ${year}`;
}

/** «ottobre 2026» (or «ottobre» with `withYear: false`) — the prose/reading register. */
export function monthLabelLong(month: MonthKey, withYear = true): string {
  const { year, monthIndex } = parseMonthKey(month);
  const name = MONTH_NAMES_LONG[monthIndex] ?? month;
  return withYear ? `${name} ${year}` : name;
}

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
  | 'unassigned_tradable'
  | 'months_range'
  | 'negative_amount'
  | 'no_positions'
  | 'disposal_full_on_position'
  | 'disposal_quantity'
  | 'nothing_to_revise'
  | 'sale_month_range';

/** What `validateDraftAgainstAssets` knows about a finding — enough to phrase it, not the final `DraftIssue`. */
export type DraftIssueContext =
  | { code: 'weights_sum'; sum: number }
  | { code: 'weight_negative'; label: string }
  | { code: 'duplicate_asset'; label: string }
  | { code: 'buy_not_member'; label: string }
  | { code: 'position_not_tradable'; label: string }
  | { code: 'source_not_cash'; label: string }
  | { code: 'unassigned_tradable'; label: string }
  | { code: 'months_range' }
  | { code: 'negative_amount' }
  | { code: 'no_positions' }
  | { code: 'disposal_full_on_position'; label: string }
  | { code: 'disposal_quantity'; label: string }
  | { code: 'nothing_to_revise' }
  | { code: 'sale_month_range' };

/** One Italian sentence per §6 code. */
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
    case 'sale_month_range':
      return 'Una vendita può andare solo a una rata che la revisione riscrive: scegli un mese dalla prima rata rivista in poi.';
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
export const ACCUMULO_ACTION_EDIT = 'Modifica';
export const ACCUMULO_ACTION_ACTIVATE = 'Attiva piano';
export const ACCUMULO_ACTION_REGISTER = 'Registra';
export const ACCUMULO_ACTION_REVISE = 'Rivedi il piano';
export const ACCUMULO_ACTION_KEEP_AS_IS = 'Lascia così';
export const ACCUMULO_ACTION_CALENDAR = 'Calendario';
export const ACCUMULO_ACTION_STOP = 'Interrompi';
export const ACCUMULO_ACTION_STOP_VERB = 'interrompere il piano';
export const ACCUMULO_ACTION_CLOSE = 'Chiudi piano';
export const ACCUMULO_ACTION_CLOSE_VERB = 'chiudere il piano';
/** AL12 (D-AL2): Piani conclusi, on a plan interrupted under 30 days ago while no other is open. */
export const ACCUMULO_ACTION_REACTIVATE = 'Riattiva';
export const ACCUMULO_ACTION_REACTIVATE_VERB = 'riattivare il piano';
export const ACCUMULO_REACTIVATE_REFUSED =
  'Questo piano non si può riattivare: è stato interrotto da più di 30 giorni, è già concluso o c\u2019è un altro piano aperto.';
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

/** A line's status as the tile shows it — the matching engine's `LineUiState` (§9). */
export const ACCUMULO_LINE_STATUS_LABEL: Record<LineUiState, string> = {
  todo: 'Da fare',
  toConfirm: 'Da confermare',
  executed: 'Registrato',
  late: 'In ritardo',
  skipped: 'Saltata',
  lostLink: 'Collegamento perso',
};

/** Questo mese's header aside: «ottobre 2026 · rata 3 di 12» (render, view 1). */
export function describeMonthTileAside(month: MonthKey, installmentIndex: number, totalMonths: number): string {
  return `${monthLabelLong(month)} · rata ${installmentIndex} di ${totalMonths}`;
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
export const ACCUMULO_CLASS_STRIP_TITLE = 'Classi del piano';
/** The key under the strip's title: what the fill, the hairline and the ring on each track are. */
export const ACCUMULO_CLASS_STRIP_LEGEND = 'barra oggi · tacca target · anello a fine piano';

// ─────────────────────────────────────────────────────────────────────────
// Tile readings
// ─────────────────────────────────────────────────────────────────────────

/** No open plan: names the cash the reader could put to work. */
export function describeAccumulationNone(sourceCashEur: number): Narrative {
  if (sourceCashEur <= 0.005) {
    return [
      {
        text: 'Nessun piano di accumulo. Non hai liquidità nei conti: un piano la ripartisce in rate mensili verso i pesi che scegli, senza vendere ciò che tieni.',
      },
    ];
  }
  return [
    { text: 'Nessun piano di accumulo. Nei conti di liquidità ci sono ' },
    { text: cachedFormatCurrencyEUR(sourceCashEur), mono: true },
    { text: ': un piano li ripartisce in rate mensili verso i pesi che scegli, senza vendere ciò che tieni.' },
  ];
}

export interface AccumulationDraftReading {
  /** Σ of `computeTotalPurchases`, the whole plan's euro. */
  totalEur: number;
  months: number;
  startMonth: MonthKey;
}

/** A `draft` plan: what it would move, from when, and that nothing is proposed yet. */
export function describeAccumulationDraft(input: AccumulationDraftReading): Narrative {
  const monthlyEur = input.months > 0 ? input.totalEur / input.months : 0;
  return [
    { text: 'Bozza: ' },
    { text: cachedFormatCurrencyEUR(input.totalEur), mono: true },
    { text: ' in ' },
    { text: `${input.months}`, mono: true },
    { text: input.months === 1 ? ' rata da ' : ' rate da ' },
    { text: monthLabelLong(input.startMonth) },
    { text: ', ' },
    { text: cachedFormatCurrencyEUR(monthlyEur), mono: true },
    { text: ' al mese. Non è ancora attivo: nessuna rata viene proposta finché non lo attivi.' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// AL13 — ONE «rata»: the month's installment, and the average that names its first month
// ─────────────────────────────────────────────────────────────────────────

export interface InstallmentAverageInput {
  /** Σ of every installment's planned lines ÷ the number of installments. */
  averageEur: number;
  /** Σ of the FIRST installment's planned lines. */
  firstEur: number;
  firstMonth: MonthKey;
}

/**
 * «in media 4455 € al mese; la prima, ottobre, 4207 €» — the average and the first month said together, so
 * the editor never shows two different figures under the one word «rata». When they coincide to the euro
 * the second half is dropped.
 */
export function describeInstallmentAverage(input: InstallmentAverageInput): string {
  const average = cachedFormatCurrencyEUR(input.averageEur, true);
  const first = cachedFormatCurrencyEUR(input.firstEur, true);
  if (average === first) return `${average} al mese`;
  return `in media ${average} al mese; la prima, ${monthLabelLong(input.firstMonth, false)}, ${first}`;
}

/** Step 1 has no weights yet, so no installment: only the liquidity split evenly over the months (L ÷ N). */
export const ACCUMULO_STEP1_L_MONTHLY_NOTE = 'La rata di ogni mese dipende dai pesi che scegli al passo successivo.';

export interface AccumulationActiveReading {
  monthKey: MonthKey;
  /** Σ of the current installment's lines (planned + executed amounts). */
  installmentTotalEur: number;
  /** Lines with a non-zero quantity in the current installment. */
  lineCount: number;
  executedCount: number;
  /** Planned, not yet executed — includes the current month's and any late one. */
  todoCount: number;
  /** The class/position furthest from its plan target right now; absent when nothing is off. */
  furthestDrift: { label: string; deltaPp: number } | null;
}

/** An `active` plan's current month: what moves, how much of it already has, and the drift. */
export function describeAccumulationActive(input: AccumulationActiveReading): Narrative {
  const segments: Narrative = [
    { text: `Rata di ${monthLabelLong(input.monthKey, false)}: ` },
    { text: cachedFormatCurrencyEUR(input.installmentTotalEur), mono: true },
    { text: ' in ' },
    { text: `${input.lineCount}`, mono: true },
    { text: input.lineCount === 1 ? ' acquisto' : ' acquisti' },
  ];

  const clauses: Narrative[] = [];
  if (input.executedCount > 0) {
    clauses.push([
      { text: `${input.executedCount}`, mono: true },
      { text: input.executedCount === 1 ? ' già eseguito' : ' già eseguiti' },
    ]);
  }
  if (input.todoCount > 0) {
    clauses.push([{ text: `${input.todoCount}`, mono: true }, { text: ' da eseguire' }]);
  }
  if (clauses.length === 1) {
    segments.push({ text: ', ' }, ...clauses[0]);
  } else if (clauses.length === 2) {
    segments.push({ text: ', ' }, ...clauses[0], { text: ' e ' }, ...clauses[1]);
  }
  segments.push({ text: '.' });

  if (input.furthestDrift) {
    if (Math.abs(input.furthestDrift.deltaPp) < 0.5) {
      segments.push({ text: ' Sei in linea col calendario.' });
    } else {
      segments.push(
        { text: ' Sei a ' },
        { text: formatSignedPp(input.furthestDrift.deltaPp), mono: true },
        { text: ` dal previsto su ${input.furthestDrift.label}.` },
      );
    }
  }

  return segments;
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

export interface AccumulationDoneReading {
  closedCount: number;
  totalInstallments: number;
  investedEur: number;
  totalEur: number;
  maxDrift: { label: string; deltaPp: number } | null;
}

/** A finished `active` plan, before the owner closes it (D8/D11's last word). */
export function describeAccumulationDone(input: AccumulationDoneReading): Narrative {
  const segments: Narrative = [
    { text: 'Piano concluso: ' },
    { text: `${input.closedCount}`, mono: true },
    { text: input.closedCount === 1 ? ' rata su ' : ' rate su ' },
    { text: `${input.totalInstallments}`, mono: true },
    { text: ', ' },
    { text: cachedFormatCurrencyEUR(input.investedEur), mono: true },
    { text: ' investiti su ' },
    { text: cachedFormatCurrencyEUR(input.totalEur), mono: true },
    { text: '.' },
  ];

  if (input.maxDrift) {
    segments.push(
      { text: ' Il peso più lontano dal target è ' },
      { text: input.maxDrift.label },
      { text: ', a ' },
      { text: formatSignedPp(input.maxDrift.deltaPp), mono: true },
      { text: '.' },
    );
  }

  return segments;
}

/** The consequence sentence a failed read of the plan hands to `describeReadFailure`. */
export function describeAccumulationReadFailure(): string {
  return 'Non riesco a leggere il piano di accumulo. Gli altri numeri della pagina non dipendono da questo.';
}

// ─────────────────────────────────────────────────────────────────────────
// Class strip (D11) and the months bar
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
  /** M6: the reserve the plan keeps; named as intact only when the accounts still cover it. */
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
// `ClassDriftChart` (§10.6)
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
// Editor (`AccumulationPlanDialog`) chrome
// ─────────────────────────────────────────────────────────────────────────

export function describeAccumuloDialogEyebrow(step: 1 | 2 | 3, revise = false): string {
  return `${revise ? 'Rivedi il piano' : 'Piano di accumulo'} · Passo ${step} di 3`;
}

/** «Rivedi il piano» step 1 asks for the months LEFT, not the length (RP4, RP8). */
export const ACCUMULO_STEP1_REMAINING_MONTHS = 'Mesi restanti';
export const ACCUMULO_ACTION_SAVE_REVISION = 'Salva la revisione';
export const ACCUMULO_STEP1_REVISE_NOTE =
  'Le rate già eseguite, saltate o collegate restano com’erano: la revisione riscrive dalla prima rata intatta, con i conti, i gruppi e le vendite non ancora eseguite che scegli qui.';

/** The dialog's reading under each step's title (it no longer repeats the title). */
export const ACCUMULO_STEP_READINGS: Record<1 | 2, string> = {
  1: 'Scegli i conti da cui prendere i soldi, la riserva da non toccare e quanto aggiungi ogni mese.',
  2: 'Scegli dove deve arrivare ogni strumento a fine piano: il pannello mostra dove porta.',
};

/** Step 3's reading, the plan in one line: «5 rate: in media 5905 € al mese; la prima, ottobre, 5800 € · copre il 98% del piano · leva a fine piano 1,27×». */
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
    { text: describeInstallmentAverage({ averageEur: input.averageEur, firstEur: input.firstEur, firstMonth: input.firstMonth }), mono: true },
  ];
  if (input.coveragePct !== null) parts.push({ text: ` · copre il ${formatPercentageIt(input.coveragePct, 0)} del piano` });
  if (input.leverageRatio > 1.01) parts.push({ text: ` · leva a fine piano ${formatNumberIt(input.leverageRatio, 2)}×` });
  return parts;
}

export const ACCUMULO_STEP3_WEIGHTS_COLUMNS: readonly string[] = ['Strumento', 'Oggi → fine piano', 'Target', 'Scarto'];

export const ACCUMULO_STEP_TITLES: Record<1 | 2 | 3, string> = {
  1: 'Da dove arriva la liquidità',
  2: 'Dove deve arrivare il portafoglio',
  3: 'Anteprima del piano',
};

export const ACCUMULO_ACTION_BACK = 'Indietro';
export const ACCUMULO_ACTION_NEXT = 'Avanti';
export const ACCUMULO_ACTION_SAVE_DRAFT = 'Salva bozza';

// Step 1 — Liquidità
export const ACCUMULO_STEP1_SOURCE_ACCOUNTS = 'Conti sorgente';
export const ACCUMULO_STEP1_NAME = 'Nome del piano';
export const ACCUMULO_STEP1_SELECT_ALL = 'Seleziona tutti';
export const ACCUMULO_STEP1_SELECT_NONE = 'Nessuno';
export const ACCUMULO_STEP1_NO_CASH_ACCOUNTS = 'Nessun conto di liquidità disponibile come fonte.';
export const ACCUMULO_STEP1_RESERVE = 'Riserva da non toccare (€)';
export const ACCUMULO_STEP1_INFLOW = 'Entrata mensile stimata (€)';
export const ACCUMULO_STEP1_MONTHS = 'Durata (mesi)';
export const ACCUMULO_STEP1_START_MONTH = 'Prima rata';
export const ACCUMULO_STEP1_L_HEADLINE = 'Liquidità stimata';
export const ACCUMULO_STEP1_L_SOURCE = 'Conti sorgente';
export const ACCUMULO_STEP1_L_RESERVE = '− Riserva';
export const ACCUMULO_STEP1_L_DISPOSALS = '+ Vendite fuori piano';
export const ACCUMULO_STEP1_L_AVAILABLE = 'Liquidità da spendere';
export function describeStep1InflowsLabel(months: number): string {
  return `+ Entrate nei ${months} mesi`;
}
export const ACCUMULO_STEP1_L_MONTHLY = 'Liquidità per mese';

// Step 2 — Target
export const ACCUMULO_STEP2_COL_INSTRUMENT = 'Strumento';
export const ACCUMULO_STEP2_COL_CURRENT_WEIGHT = 'Oggi';
export const ACCUMULO_STEP2_COL_TARGET = 'Target';
export const ACCUMULO_STEP2_COL_KEEP_OR_SELL = 'Tieni o vendi';
export const ACCUMULO_STEP2_COL_TO_BUY = 'Da comprare';
export const ACCUMULO_STEP2_COL_PER_MONTH = 'Al mese';
export const ACCUMULO_STEP2_TOGGLE_IN_PLAN = 'Tieni';
export const ACCUMULO_STEP2_TOGGLE_SELL = 'Vendi';
export const ACCUMULO_STEP2_SELL_SHARES = 'Vendi quote';
export const ACCUMULO_STEP2_ALREADY_SELLING = 'già in vendita';
export const ACCUMULO_STEP2_FROM_LABEL = 'Parti da';
export const ACCUMULO_STEP2_FROM_PLAN = 'Piano attuale';
/** One line under «Parti da»: what the active source put in the Target column. «Oggi» is the share
 *  among the plan's instruments, so «Pesi di oggi» reads as target = oggi. */
export const ACCUMULO_STEP2_FROM_HINT: Record<'plan' | 'today', string> = {
  plan: 'I pesi salvati nel piano, com’erano quando l’hai aperto.',
  today: 'Target = Oggi: i nuovi soldi mantengono le proporzioni di adesso tra gli strumenti del piano.',
};
export const ACCUMULO_STEP2_FROM_TODAY = 'Pesi di oggi';
export const ACCUMULO_STEP2_REDISTRIBUTE = 'Distribuisci il resto';
export const ACCUMULO_ACTION_GROUP_PROXY = 'Raggruppa due strumenti';
export const ACCUMULO_ACTION_GROUP_CANCEL = 'Annulla raggruppamento';
export const ACCUMULO_STEP2_GROUP_NO_BUY = 'non riceve acquisti';
export const ACCUMULO_STEP2_SALE_PROCEEDS = 'ricavo al mese 1';
export const ACCUMULO_STEP2_GROUP_HINT = 'Scegli gli strumenti da raggruppare: dividono un solo peso e si compra solo uno dei due.';
export function describeStep2Shares(quantity: number): string {
  return `${formatNumberIt(quantity, 0)} quote`;
}
export const ACCUMULO_ACTION_UNGROUP = 'Separa';
export const ACCUMULO_STEP2_BUY_ASSET_PROMPT = 'Strumento d’acquisto';
export const ACCUMULO_ACTION_NEW_ASSET = '+ Nuovo asset';

/** AL9 «Sostituisci»: the instrument that buys changes, the old one stays in the group. */
export const ACCUMULO_ACTION_REPLACE = 'Sostituisci';
export const ACCUMULO_ACTION_REPLACE_CANCEL = 'Annulla';
export const ACCUMULO_STEP2_REPLACE_PROMPT = 'Compra al suo posto';
export const ACCUMULO_STEP2_REPLACE_PLACEHOLDER = 'Scegli lo strumento';
export const ACCUMULO_STEP2_REPLACE_HINT =
  'Il nuovo strumento riceve gli acquisti con lo stesso peso; quello di prima resta nel gruppo con le sue quote e non ne riceve più. «Separa» rimette le cose come prima.';

/** AL10 «Aggiungi uno strumento»: also the ones with no shares yet, the mai comprati first. */
export const ACCUMULO_STEP2_ADD_ASSET_LABEL = 'Aggiungi uno strumento';
export const ACCUMULO_STEP2_ADD_ASSET_PLACEHOLDER = 'Strumenti fuori dal piano';
export function describeAddableAsset(input: { name: string; ticker: string; held: boolean; neverBought: boolean }): string {
  const tag = input.neverBought ? ' · mai comprato' : input.held ? '' : ' · senza quote';
  return `${input.name}${input.ticker && input.ticker !== input.name ? ` (${input.ticker})` : ''}${tag}`;
}

/** AL11: a saved sale not yet executed can move to another month of the revised calendar. */
export const ACCUMULO_STEP2_SALE_MONTH = 'Vendi a';
export const ACCUMULO_STEP2_SALE_NOT_EXECUTED = 'salvata, non eseguita';
export const ACCUMULO_STEP2_TOTAL_LABEL = 'Totale';
export const ACCUMULO_STEP2_FOOTNOTE = 'Peso di mercato, non esposizione: la leva si vede al passo 3.';
export const ACCUMULO_STEP2_NO_TRADABLE_ASSETS = 'Nessuno strumento negoziabile in portafoglio: aggiungine uno per iniziare.';
export const ACCUMULO_STEP2_PENDING_ASSET_LABEL = 'Nuovo asset';
export const ACCUMULO_STEP2_BUY_ASSET_CONFIRM = 'Conferma gruppo';

/** «Mancano 3,00 punti per arrivare al 100%» / «Hai 2,00 punti in più»; '' when the total is 100. */
export function describeWeightsTotal(sum: number): string {
  const diff = 100 - sum;
  if (Math.abs(diff) <= 0.01) return '';
  return diff > 0
    ? `Mancano ${formatNumberIt(diff, 2)} punti per arrivare al 100%`
    : `Hai ${formatNumberIt(-diff, 2)} punti in più`;
}

// Step 3 — Anteprima
export const ACCUMULO_STEP3_COL_MONTH = 'Mese';
export const ACCUMULO_STEP3_COL_TOTAL = 'Totale €';
export const ACCUMULO_STEP3_SECTION_WEIGHTS = 'Pesi a fine piano';
export const ACCUMULO_ACTION_CLOSE_EDITOR = 'Chiudi';
export const ACCUMULO_STEP3_SECTION_EXPOSURE = 'Esposizione implicita';
export const ACCUMULO_STEP3_SECTION_CLASSES = 'Classi mese per mese';
export const ACCUMULO_ELLIPSIS = '…';

export function describeInsufficientLiquidityWarning(coveragePct: number): string {
  return `La liquidità stimata copre il ${formatPercentageIt(coveragePct, 0)} del piano: alcune posizioni restano sotto target anche a fine piano.`;
}

export function describeUnpricedWarning(labels: string[]): string {
  const who = listInItalian(labels);
  return labels.length === 1
    ? `${who} non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.`
    : `${who} non hanno un prezzo disponibile: non ricevono acquisti finché non li aggiorni.`;
}

export function describeAboveTargetWarning(labels: string[]): string {
  const who = listInItalian(labels);
  return labels.length === 1
    ? `${who} è già sopra il target: il piano non la vende, il peso resta più alto del previsto.`
    : `${who} sono già sopra il target: il piano non le vende, i pesi restano più alti del previsto.`;
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

export function describeRecalibrateTitle(monthKey: MonthKey): string {
  return `Ricalibra rata di ${monthLabelLong(monthKey, false)}`;
}

export const ACCUMULO_RECALIBRATE_COL_INSTRUMENT = 'Strumento';
export const ACCUMULO_RECALIBRATE_COL_PLANNED = 'Pianificata';
export const ACCUMULO_RECALIBRATE_COL_SUGGESTED = 'Suggerita';
export const ACCUMULO_RECALIBRATE_COL_DELTA = 'Δ quote';
export const ACCUMULO_ACTION_IGNORE = 'Ignora';
export const ACCUMULO_ACTION_APPLY = 'Applica';

/** The note «Registra» pre-fills on the ledger trade (RP5). */
export function describeRegisterNote(planName: string, installmentIndex: number, totalMonths: number): string {
  return `PAC «${planName}», rata ${installmentIndex} di ${totalMonths}`;
}

export function describeRegisterSaleNote(planName: string): string {
  return `PAC «${planName}», vendita`;
}
export const ACCUMULO_RECALIBRATE_SUBMITTING = 'Applico la ricalibrazione…';

/** «3868,10 € → 3849,10 €» — the recalibration's totals row. */
export function describeRecalibrationTotals(plannedTotalEur: number, suggestedTotalEur: number): string {
  return `${cachedFormatCurrencyEUR(plannedTotalEur)} → ${cachedFormatCurrencyEUR(suggestedTotalEur)}`;
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
 * The recalibration notice (render, PO6): «I prezzi sono cambiati dall'attivazione: con quelli di oggi
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

/** The recalibrate modal's reading: what moved, or why the rata shrank without a mover. */
export function describeRecalibration(input: RecalibrationReadingInput): Narrative {
  const totalDeltaEur = input.suggestedTotalEur - input.plannedTotalEur;
  const deltas = input.lines
    .map((line) => ({ label: line.label, delta: line.suggestedQuantity - line.plannedQuantity }))
    .filter((d) => d.delta !== 0);

  if (deltas.length === 0) {
    return [{ text: 'La rata resta come pianificata.' }];
  }

  const gainers = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta);
  const losers = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta);

  if (gainers.length > 0 && losers.length > 0) {
    const loser = losers[0];
    const gainer = gainers[0];
    return [
      { text: `${loser.label} è salito più del previsto: la rata sposta ` },
      { text: `${gainer.delta}`, mono: true },
      { text: gainer.delta === 1 ? ' quota' : ' quote' },
      { text: ` verso ${gainer.label}. Il totale cambia di ` },
      { text: formatSignedCurrency(totalDeltaEur), mono: true },
      { text: '.' },
    ];
  }

  return [
    { text: 'Le entrate non sono arrivate come previsto: la rata scende di ' },
    { text: formatSignedCurrency(Math.abs(totalDeltaEur)), mono: true },
    { text: '.' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// Traiettoria mese per mese e rientro in banda (doc/pac-ottimizzatore § RV5, PO15)
// ─────────────────────────────────────────────────────────────────────────

export const ACCUMULO_DRIFT_CHART_LEGEND = 'misurato · previsto a prezzi di oggi · banda';

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
// Verdetto della scheda Accumulo (RV3)
// ─────────────────────────────────────────────────────────────────────────

export type AccumuloVerdictInput =
  | { state: 'none'; sourceCashEur: number }
  | { state: 'draft'; months: number; monthlyEur: number; startMonth: MonthKey }
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

/** The Accumulo tab's verdict: one headline, one sentence, a tone (RV3). */
export function describeAccumuloVerdict(input: AccumuloVerdictInput): PageVerdictModel {
  if (input.state === 'none') {
    const sentence: Narrative =
      input.sourceCashEur <= 0.005
        ? [{ text: `Non hai liquidità nei conti: un piano la spende in rate mensili verso i pesi che scegli.` }]
        : [
            { text: 'Nei conti di liquidità hai ' },
            mono(cachedFormatCurrencyEUR(input.sourceCashEur, true)),
            { text: `: un piano li spende in rate mensili verso i pesi che scegli.` },
          ];
    return { headline: 'Nessun piano di accumulo aperto.', tone: 'neutral', sentence };
  }

  if (input.state === 'draft') {
    return {
      headline: `Bozza pronta: ${input.months} ${input.months === 1 ? 'rata' : 'rate'} da ${cachedFormatCurrencyEUR(input.monthlyEur, true)} da ${monthLabelLong(input.startMonth, false)}.`,
      tone: 'neutral',
      sentence: [{ text: 'Attivala per fissare il calendario.' }],
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
  let headline = `Rata di ${monthLabelLong(input.monthKey, false)}: ${cachedFormatCurrencyEUR(input.installmentTotalEur, true)} in ${input.lineCount} ${input.lineCount === 1 ? 'acquisto' : 'acquisti'}`;
  if (parts.length > 0) headline += `, ${parts.length === 2 ? `${parts[0]} e ${parts[1]}` : parts[0]}`;
  if (input.lateCount > 0) headline += `, ${input.lateCount} in ritardo`;
  headline += '.';

  const sentence: Narrative = [
    { text: `Rata ${input.installmentIndex} di ${input.months}, investiti finora ` },
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
// Stato vuoto della scheda Accumulo (RV4) e tile «Classi del piano»
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
  'Non sceglie strumenti che non hai indicato: puoi aggiungerli tu, anche senza quote.',
];
export const ACCUMULO_EMPTY_PREVIEW_TITLE = 'Anteprima sui tuoi numeri';
export const ACCUMULO_EMPTY_ASIDE = 'nessun piano aperto';
export const ACCUMULO_EMPTY_PREVIEW_CLASSES = 'oggi → a fine piano';

/** «12 rate da 3208 € con 10.000 € di riserva, dai pesi di oggi.» — or why there is nothing to show. */
export function describeAccumuloPreview(
  preview: { months: number; reserveEur: number; monthlyEur: number; inflowEur?: number } | null,
): Narrative {
  if (!preview) {
    return [{ text: 'Con una riserva di 10.000 € non resta liquidità da spendere, o nessuno strumento è acquistabile: crea il piano per scegliere riserva ed entrate.' }];
  }
  return [
    { text: `${preview.months} rate da ` },
    { text: cachedFormatCurrencyEUR(preview.monthlyEur, true), mono: true },
    { text: ' con ' },
    { text: cachedFormatCurrencyEUR(preview.reserveEur, true), mono: true },
    { text: ` di riserva, dai pesi di oggi` },
    ...((preview.inflowEur ?? 0) > 0
      ? ([{ text: ' e ' }, { text: cachedFormatCurrencyEUR(preview.inflowEur as number, true), mono: true }, { text: ' al mese di entrate.' }] as Narrative)
      : ([{ text: ' e senza entrate mensili.' }] as Narrative)),
  ];
}

/** The empty tile's reading (render RV4): «Nei conti di liquidità hai 36.500 €. Un piano di accumulo li
 *  spende in rate mensili verso i pesi di oggi, a quote intere, e ti dice ogni mese cosa comprare.» */
export function describeAccumuloIntro(preview: { cashEur: number } | null): Narrative {
  if (!preview) return describeAccumuloPreview(null);
  return [
    { text: 'Nei conti di liquidità hai ' },
    { text: cachedFormatCurrencyEUR(preview.cashEur, true), mono: true },
    {
      text: `. Un piano di accumulo li spende in rate mensili verso i pesi di oggi, a quote intere, e ti dice ogni mese cosa comprare.`,
    },
  ];
}

/** The preview box's lead: «Con una riserva di 10.000 € e 1000 € al mese, 12 rate da 3208 € porterebbero:» */
export function describeAccumuloPreviewLead(preview: { months: number; reserveEur: number; monthlyEur: number; inflowEur?: number }): Narrative {
  const inflow = preview.inflowEur ?? 0;
  return [
    { text: 'Con una riserva di ' },
    { text: cachedFormatCurrencyEUR(preview.reserveEur, true), mono: true },
    ...(inflow > 0
      ? ([{ text: ' e ' }, { text: cachedFormatCurrencyEUR(inflow, true), mono: true }, { text: ' al mese' }] as Narrative)
      : ([{ text: ' e senza entrate mensili' }] as Narrative)),
    { text: `, ${preview.months} rate da ` },
    { text: cachedFormatCurrencyEUR(preview.monthlyEur, true), mono: true },
    { text: ' porterebbero:' },
  ];
}

export const ACCUMULO_CLASSES_TILE_EYEBROW = 'Classi del piano';
export const ACCUMULO_CLASSES_TILE_ASIDE = 'scostamento dal target, mese per mese';

// ─────────────────────────────────────────────────────────────────────────
// Piani conclusi (RP6) and the suggested monthly inflow (RP7)
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

/** The monthly saving a draft may suggest (RP7): the Cashflow's yearly saving ÷ 12, rounded down to the tens; 0 = no suggestion. */
export function suggestMonthlyInflow(annualSavingsEur: number): number {
  if (!Number.isFinite(annualSavingsEur) || annualSavingsEur <= 0) return 0;
  return Math.floor(annualSavingsEur / 12 / 10) * 10;
}

/** «Il tuo risparmio medio è di 1200 € al mese (Cashflow 2025).» — «(2026, finora)» for a year still running. */
export function describeSuggestedInflow(monthlyEur: number, referenceYear: number, isAnnualized: boolean): string {
  const source = isAnnualized ? `${referenceYear}, finora` : `Cashflow ${referenceYear}`;
  return `Il tuo risparmio medio è di ${Math.round(monthlyEur)} € al mese (${source}).`;
}
export const ACCUMULO_USE_SUGGESTED_INFLOW = 'Usa';

// ─────────────────────────────────────────────────────────────────────────
// La composizione sul telefono (2026-10-18; doc/contributi-upstream/composizione-mobile.md § 3)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The ids of the tab's cells below `desktop:` (`useMobileSections`, The Closed-Row Rule). `mese` is THE
 * tile — Questo mese, or the empty state — and never closes (The First-Screen Rule): it is among the ids
 * only as the target of the strip's first cell. Re-exported by `accumuloSummary.ts`.
 */
export const ACCUMULO_SECTION_IDS = {
  mese: 'acc-mese',
  classi: 'acc-classi',
  conclusi: 'acc-conclusi',
} as const;

/** What a CLOSED row says beside its eyebrow: words, never a figure (The Closed-Row Rule). */
export const ACCUMULO_CLOSED_ASIDES = {
  [ACCUMULO_SECTION_IDS.classi]: 'scostamento mese per mese',
  [ACCUMULO_SECTION_IDS.conclusi]: 'piani chiusi e interrotti',
} as const;

export interface AccumuloClosedAnswersInput {
  /** `selectClassStripRows(...)` at the cursor's month, `[]` without a trajectory. */
  classRows: { outOfBandNow: boolean; reentryMonth?: MonthKey | 'baseline' }[];
  /** The plan's first month: where a `baseline` re-entry reads. */
  planStartMonth: MonthKey | null;
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
    [ACCUMULO_SECTION_IDS.classi]: lastReentry ? [{ text: `rientro a ${monthLabelLong(lastReentry, false)}` }] : null,
    [ACCUMULO_SECTION_IDS.conclusi]: input.lastClosedMonth ? [{ text: `ultimo a ${monthLabelLong(input.lastClosedMonth, false)}` }] : null,
  };
}
