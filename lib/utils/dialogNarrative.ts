/**
 * The words every modal speaks (DESIGN.md → §5 Modal).
 *
 * A modal is a tile lifted off the page, so it takes the tile's anatomy — eyebrow, title,
 * reading line, body — plus the one thing a tile has no use for: a footer, because a modal
 * asks for a decision. This module owns the reading line, and on a form that line IS the
 * status line: what the form wants while it is idle, what it is doing while it submits, and
 * how it went. One sentence, in the one place the reader is already looking (DESIGN.md →
 * The Status-Is-The-Reading Rule, first applied on /login).
 *
 * It also owns `describeWriteError`, which is to a write what `describeAuthError` is to a
 * sign-in: the single translation of a failure into Italian, so a Firestore code
 * («Missing or insufficient permissions.») can never reach a reader.
 *
 * Nothing here touches Firebase or the DOM: it is a pure function of state, tested clause by
 * clause. It imports from `formatters`, never from `chartService`, so a server-rendered
 * surface could read it (AGENTS.md → Italian Localization).
 */

import type { Narrative } from './narrative';
import { cachedFormatCurrencyEUR, formatDate } from './formatters';

/** Where a modal's action is in its lifecycle. */
export type ModalPhase = 'idle' | 'submitting' | 'success' | 'error';

export interface ModalStatus {
  phase: ModalPhase;
  /** The failure in words (already through `describeWriteError`); only with phase `error`. */
  message?: string;
}

/** A modal reading plus the tone the surface paints it in. */
export interface ModalReading {
  narrative: Narrative;
  tone: 'neutral' | 'negative';
}

/**
 * The three sentences a modal owns. `idle` is the only one that carries figures, so it is a
 * `Narrative`; the others are plain prose about an act in flight.
 *
 * `success` is optional because most modals close on success and nobody reads the sentence;
 * declare it only where the modal stays open (a wizard step, a report).
 */
export interface ModalStatusCopy {
  idle: Narrative;
  submitting: string;
  success?: string;
}

const GENERIC_FAILURE = 'Non è stato possibile completare l’operazione. Riprova.';

/**
 * The reading of a modal in its current phase.
 *
 * An error paints the reading `text-destructive` and leaves the title exactly where it was:
 * the title states the act, and a failed save is not a different act.
 */
export function describeModalStatus(status: ModalStatus, copy: ModalStatusCopy): ModalReading {
  switch (status.phase) {
    case 'submitting':
      return neutral(copy.submitting);
    case 'success':
      return neutral(copy.success ?? copy.submitting);
    case 'error':
      return negative(status.message ?? GENERIC_FAILURE);
    default:
      return { narrative: copy.idle, tone: 'neutral' };
  }
}

// ── Failures ────────────────────────────────────────────────────────────────

const USER_FACING_ERROR = Symbol.for('nwt.userFacingError');

/**
 * Marks an error whose message is ALREADY the product's own Italian — a 422 body the server
 * wrote for a reader, not a provider string.
 *
 * Without the marker `describeWriteError` cannot tell those apart from an SDK message and
 * has to drop both, which would throw away the only sentences that know why a trade was
 * refused ("Non puoi vendere 12 quote: ne possiedi 8").
 */
export function userFacingError(message: string): Error {
  const error = new Error(message);
  (error as unknown as Record<symbol, boolean>)[USER_FACING_ERROR] = true;
  return error;
}

function isUserFacingError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error as unknown as Record<symbol, boolean>)[USER_FACING_ERROR] === true
  );
}

/**
 * Every failure code a write on this app can meet, in Italian.
 *
 * The raw string an SDK throws is a log line, not a sentence for a reader: Firestore says
 * «Missing or insufficient permissions.» — English, and it names an implementation the user
 * has never heard of. An unmapped code therefore takes a sentence that claims nothing about
 * the cause rather than falling through to it (the Narrative Honesty Rule applied to a
 * failure), exactly as `describeAuthError` does for a sign-in.
 */
const WRITE_ERROR_TEXT: Record<string, string> = {
  'permission-denied': 'Non hai i permessi per scrivere su questo account.',
  unauthenticated: 'La sessione è scaduta: rientra e riprova.',
  'not-found': 'Questo elemento non esiste più: potrebbe essere stato eliminato altrove.',
  'already-exists': 'Esiste già un elemento con questi dati.',
  'failed-precondition': 'I dati sono cambiati nel frattempo: riapri la finestra e riprova.',
  aborted: 'Un’altra modifica è arrivata prima: riapri la finestra e riprova.',
  unavailable: 'Nessuna connessione. Controlla la rete e riprova.',
  'deadline-exceeded': 'La richiesta ha impiegato troppo tempo. Riprova.',
  'resource-exhausted': 'Troppe richieste ravvicinate. Riprova tra qualche minuto.',
  cancelled: 'L’operazione è stata interrotta prima di concludersi.',
  'invalid-argument': 'Alcuni dati non sono validi: controlla i campi e riprova.',
};

/** Translates whatever was thrown into one sentence, never into the SDK's own words. */
export function describeWriteError(error: unknown): string {
  // A message the server wrote for a reader wins: it knows why, and this module cannot.
  if (isUserFacingError(error)) return error.message;

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;

  if (typeof code === 'string' && code in WRITE_ERROR_TEXT) {
    return WRITE_ERROR_TEXT[code];
  }

  return GENERIC_FAILURE;
}

// ── Destructive actions ─────────────────────────────────────────────────────

/**
 * The label of an armed destructive action.
 *
 * The first press arms, the second acts — no timer, because a countdown is a WCAG 2.2.1
 * time limit (AGENTS.md → Accessibility). The armed label repeats WHAT is about to be lost
 * rather than saying «Confermi?», so a reader who armed it by accident reads the
 * consequence instead of a question about a consequence they can no longer see.
 */
export function armedActionLabel(action: string): string {
  return `Premi di nuovo per ${lowerFirst(action)}`;
}

/**
 * Italian agreement for a counted noun, so a label can name the count it is about to act on
 * («Elimina 1 spesa», «Elimina 47 spese»).
 */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The form-level sentence of a submit the client validation refused, for the modal's reading
 * line (the status line, DESIGN.md → The Status-Is-The-Reading Rule): a per-field message under
 * a field three screens away is a dead end, so the reading counts and names the fields.
 * Missing fields come first, invalid ones after; either list may be empty.
 */
export function describeFormRefusal(missing: string[], invalid: string[]): string {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(
      missing.length === 1 ? `Manca un campo: ${missing[0]}` : `Mancano ${missing.length} campi: ${listInItalian(missing)}`,
    );
  }
  if (invalid.length > 0) {
    parts.push(
      invalid.length === 1
        ? `un valore non è valido: ${invalid[0]}`
        : `${invalid.length} valori non sono validi: ${listInItalian(invalid)}`,
    );
  }
  if (parts.length === 0) return 'Controlla i campi evidenziati.';
  const sentence = parts.join('; ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** «Ticker, Nome e Valuta» — the Italian serial list, no Oxford comma. */
function listInItalian(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// ── Cash account detail ─────────────────────────────────────────────────────

export interface CashAccountFacts {
  name: string;
  balanceEur: number;
  /** The two-click delete is armed: the reading says what the second press loses. */
  armed: boolean;
  isDemo: boolean;
}

/**
 * The reading of the cash-account detail modal. Idle it explains how the balance moves; armed it
 * names the consequence of the second press — the balance goes, the linked movements stay in the
 * cashflow without an account, nothing comes back — because the button is a compact «Premi di
 * nuovo» and the ROW carries the sentence (AGENTS.md → Accessibility, the Versamenti precedent).
 */
export function describeCashAccountReading(facts: CashAccountFacts): ModalReading {
  if (facts.isDemo) {
    return { narrative: [{ text: 'In modalità demo i conti sono di sola lettura.' }], tone: 'neutral' };
  }
  if (facts.armed) {
    return {
      narrative: [
        { text: `Elimini ${facts.name} e il suo saldo di ` },
        { text: cachedFormatCurrencyEUR(facts.balanceEur), mono: true },
        { text: ': i movimenti collegati restano nel cashflow senza conto. Non è reversibile.' },
      ],
      tone: 'negative',
    };
  }
  return {
    narrative: [{ text: 'Il saldo si muove da solo quando registri un movimento collegato a questo conto.' }],
    tone: 'neutral',
  };
}

// ── Ledger return vital ─────────────────────────────────────────────────────

export interface LedgerReturnVital {
  label: string;
  /** The percentage, 0-100 scale, signed. */
  percent: number;
  /** The words under the figure: the window it is measured on. */
  sub: string;
  info: string;
}

/**
 * The third vital of the Movimenti modal: the XIRR when the position is old enough to be
 * annualised, otherwise the plain return over the ledger's own window, named — «+66,9% in 47
 * giorni, non annualizzato». A money-weighted return compounded from a few weeks to a year is
 * not a measure (the Narrative Honesty Rule; Rendimenti draws the same line at six months).
 * Null when neither figure exists.
 */
export function describeLedgerReturnVital(input: {
  xirr: number | null;
  totalReturnPct: number | null;
  spanDays: number | null;
  minAnnualizableDays: number;
}): LedgerReturnVital | null {
  const annualizable = input.spanDays !== null && input.spanDays >= input.minAnnualizableDays;
  if (annualizable && input.xirr !== null) {
    return {
      label: 'XIRR',
      percent: input.xirr * 100,
      sub: 'annualizzato',
      info: 'Rendimento annualizzato ponderato per i flussi (XIRR), dalle date reali delle operazioni.',
    };
  }
  if (input.totalReturnPct === null || input.spanDays === null) return null;
  const days = Math.max(1, Math.round(input.spanDays));
  return {
    label: 'Rendimento sul periodo',
    percent: input.totalReturnPct * 100,
    sub: `in ${days} ${days === 1 ? 'giorno' : 'giorni'}, non annualizzato`,
    info: `Rendimento sul capitale investito nella finestra del registro. Sotto i ${input.minAnnualizableDays} giorni non viene annualizzato: compounded a un anno, poche settimane darebbero una cifra che non misura nulla.`,
  };
}

// ── Readings that carry figures ─────────────────────────────────────────────

export interface MovementsCounts {
  buys: number;
  sells: number;
  adjustments: number;
  hasBaseline: boolean;
  /** The weighted average cost per unit, in EUR; `null` when the replay cannot produce one. */
  averageCostEur: number | null;
  /** The first trade's date — the day the ledger opens. */
  firstDate: Date | null;
}

/**
 * The reading of the Movimenti modal: how many operations, of which kinds, and at what
 * average cost.
 *
 * Every clause drops when its figure is zero, so a position that was only ever bought reads
 * «5 acquisti» and not «5 acquisti, 0 vendite» — a zero printed as a fact is a claim the
 * reader has to parse before discarding.
 */
export function describeMovementsReading(counts: MovementsCounts): Narrative {
  const total = counts.buys + counts.sells + counts.adjustments + (counts.hasBaseline ? 1 : 0);

  if (total === 0) {
    return [{ text: 'Nessuna operazione registrata: il primo acquisto apre la posizione.' }];
  }

  const segments: Narrative = [
    { text: `${total}`, mono: true },
    { text: total === 1 ? ' operazione' : ' operazioni' },
  ];

  if (counts.firstDate) {
    segments.push({ text: ' dal ' }, { text: formatDate(counts.firstDate), mono: true });
  }

  const kinds: Narrative[] = [];
  if (counts.buys > 0) {
    kinds.push([
      { text: `${counts.buys}`, mono: true },
      { text: counts.buys === 1 ? ' acquisto' : ' acquisti' },
    ]);
  }
  if (counts.sells > 0) {
    kinds.push([
      { text: `${counts.sells}`, mono: true },
      { text: counts.sells === 1 ? ' vendita' : ' vendite' },
    ]);
  }
  if (counts.adjustments > 0) {
    kinds.push([
      { text: `${counts.adjustments}`, mono: true },
      { text: counts.adjustments === 1 ? ' rettifica' : ' rettifiche' },
    ]);
  }
  if (counts.hasBaseline) {
    kinds.push([{ text: 'la posizione iniziale' }]);
  }

  if (kinds.length > 0) {
    segments.push({ text: ': ' });
    segments.push(...joinClauses(kinds));
  }

  if (counts.averageCostEur !== null && counts.averageCostEur > 0) {
    segments.push(
      { text: '; PMC ' },
      { text: cachedFormatCurrencyEUR(counts.averageCostEur), mono: true },
    );
  }

  segments.push({ text: '.' });
  return segments;
}

/**
 * What choosing a type on step 1 actually decides. It names the three consequences the reader
 * cannot see from the cards — categories, balances, budgets — instead of repeating the title.
 */
export const EXPENSE_TYPE_PICKER_READING: Narrative = [
  {
    text: 'Il tipo decide le categorie disponibili, quale conto si muove e quali budget la contano.',
  },
];

/**
 * The idle reading of the expense modal, per type: where the row lands once it is saved.
 *
 * A transfer says what it is NOT counted in, because that is the whole reason the type exists
 * and the only thing a reader can get wrong about it.
 */
export function describeExpenseIntent(type: 'variable' | 'fixed' | 'debt' | 'income' | 'transfer'): Narrative {
  switch (type) {
    case 'income':
      return [
        {
          text: 'Un’entrata alza il saldo del conto collegato ed entra nel risparmio del mese.',
        },
      ];
    case 'transfer':
      return [
        {
          text: 'Un trasferimento sposta denaro fra due conti: non entra in spese, entrate né budget.',
        },
      ];
    case 'debt':
      return [
        {
          text: 'Una rata entra nelle spese del mese e nei budget per tipo; cadendo a data fissa, non viene proiettata a fine mese.',
        },
      ];
    default:
      return [
        {
          text: 'La voce entra nelle spese del mese, nei budget della categoria che scegli e scala il conto collegato.',
        },
      ];
  }
}

export interface ExpenseDeleteFacts {
  type: 'variable' | 'fixed' | 'debt' | 'income' | 'transfer';
  /** The row's amount, any sign. */
  amount: number;
  /** The row moved a cash account (`linkedCashAssetId`), so deleting it moves the account back. */
  hasAccount: boolean;
}

/**
 * What the second press of an armed row delete does to the ACCOUNTS — the sentence the row prints
 * beside a compact «Conferma» (AGENTS.md → Accessibility: the button stays short, the row carries
 * the consequence). Until 2026-09-14 the table's dialog asked «Sei sicuro di voler eliminare
 * questa voce?» and said nothing about the balance it was about to move back.
 */
export function describeExpenseDeleteConsequence(facts: ExpenseDeleteFacts): string {
  if (facts.type === 'transfer') {
    return facts.hasAccount ? 'Eliminando, i due conti tornano come prima del trasferimento.' : 'Eliminando, il trasferimento sparisce dal registro.';
  }
  if (!facts.hasAccount) return 'Eliminando, la voce sparisce dal periodo e dai budget.';
  const amount = cachedFormatCurrencyEUR(Math.abs(facts.amount));
  return facts.type === 'income'
    ? `Eliminando, il conto viene addebitato di ${amount}.`
    : `Eliminando, il conto viene riaccreditato di ${amount}.`;
}

export interface SeriesDeleteFacts {
  mode: 'installment' | 'recurring';
  /** The row as the feed names it: the note, else the category. */
  label: string;
  amount: number;
  installmentNumber?: number;
  installmentTotal?: number;
}

/**
 * The reading of the modal that asks «solo questa o tutta la serie?» — the one choice a row of an
 * instalment plan or a recurring series adds to a delete. It names the row, the series and what
 * happens to the account, because the two buttons under it differ by a whole series.
 */
export function describeSeriesDeleteReading(facts: SeriesDeleteFacts): Narrative {
  const amount = { text: cachedFormatCurrencyEUR(Math.abs(facts.amount)), mono: true };
  if (facts.mode === 'installment' && facts.installmentNumber && facts.installmentTotal) {
    return [
      { text: 'Rata ' },
      { text: String(facts.installmentNumber), mono: true },
      { text: ' di ' },
      { text: String(facts.installmentTotal), mono: true },
      { text: ` di ${facts.label}, ` },
      amount,
      { text: ': puoi togliere solo questa o tutte le ' },
      { text: String(facts.installmentTotal), mono: true },
      { text: '; il conto collegato torna come prima delle rate eliminate.' },
    ];
  }
  return [
    { text: `${facts.label}, ` },
    amount,
    { text: ', si ripete: puoi togliere solo questa occorrenza o tutta la serie; il conto collegato torna come prima delle voci eliminate.' },
  ];
}

/** What the asset type decides — the three consequences the eight cards cannot show. */
export const ASSET_TYPE_PICKER_READING: Narrative = [
  {
    text: 'Il tipo decide quali campi servono, come lo strumento viene prezzato e in quale classe entra in Allocazione.',
  },
];

export interface AssetIntent {
  isEdit: boolean;
  /** The asset's quantity and average cost are owned by the trade ledger. */
  hasLedger: boolean;
  /** A create that will open the position with a first buy. */
  isLedgerCreate: boolean;
}

/**
 * The idle reading of the asset modal, which says WHO owns the numbers on the form.
 *
 * The quantity and the average cost of a ledger asset are derived by replaying its operations,
 * so the form shows them read-only; a reader who does not know that reads two disabled fields
 * as a bug (The Declaration-Tile Rule, applied inside a modal).
 */
export function describeAssetIntent(intent: AssetIntent): Narrative {
  if (intent.isEdit) {
    return intent.hasLedger
      ? [
          {
            text: 'Quantità e prezzo medio li tiene il registro operazioni: qui cambi come lo strumento è classificato e prezzato.',
          },
        ]
      : [
          {
            text: 'Qui cambi come lo strumento è classificato, prezzato e conteggiato in Allocazione.',
          },
        ];
  }
  return intent.isLedgerCreate
    ? [
        {
          text: 'Alla creazione registro l’acquisto di apertura: da lì in poi quantità e prezzo medio li tiene il registro operazioni.',
        },
      ]
    : [{ text: 'Lo strumento entra nel patrimonio e nella classe che scegli qui sotto.' }];
}

export interface TradeIntent {
  type: 'buy' | 'sell' | 'adjustment';
  /** The frozen opening position: only quantity, price and note can move. */
  isBaseline: boolean;
  /** Whether a settlement account is selected, so the balance clause is honest. */
  hasSettlement: boolean;
  isDemo: boolean;
}

/**
 * The idle reading of the trade modal: what the operation about to be registered actually does.
 *
 * It names the CONSEQUENCE, not the fields — a reader deciding between a sale and an adjustment
 * needs to know that one closes a capital gain and the other does not. The settlement clause
 * exists only while an account is selected, because without one no balance moves.
 */
export function describeTradeIntent(intent: TradeIntent): Narrative {
  if (intent.isDemo) {
    return [{ text: 'In modalità demo il registro operazioni è di sola lettura.' }];
  }
  if (intent.isBaseline) {
    return [
      {
        text: 'La posizione iniziale apre il registro: puoi correggerne quantità, prezzo e nota, non la data.',
      },
    ];
  }

  const settlement = intent.hasSettlement;
  switch (intent.type) {
    case 'sell':
      return [
        {
          text: settlement
            ? 'Una vendita chiude una plusvalenza sul PMC e accredita il conto di regolamento.'
            : 'Una vendita chiude una plusvalenza sul PMC. Senza conto di regolamento nessun saldo si muove.',
        },
      ];
    case 'adjustment':
      return [
        {
          text: 'Una rettifica riscrive quantità e PMC da questa data: nessuna plusvalenza realizzata, nessun saldo toccato.',
        },
      ];
    default:
      return [
        {
          text: settlement
            ? 'Un acquisto aggiunge quote al PMC e scala il conto di regolamento.'
            : 'Un acquisto aggiunge quote al PMC. Senza conto di regolamento nessun saldo si muove.',
        },
      ];
  }
}

/**
 * The clause under a settlement-account picker, decided by the trade's date.
 *
 * The account's balance moves TODAY, whatever date the trade carries: a purchase recorded with a
 * date in an earlier month has, in most cases, already left the account (the balance the user
 * keeps up to date reflects it), and settling it again would debit it twice. So a date in a past
 * month changes the sentence from a promise into a warning; the current month keeps the promise,
 * because a trade of two weeks ago not yet on the account is the legitimate case. Both arguments
 * are `YYYY-MM-DD` strings — the form's own value and the form's own today — so the function reads
 * no clock; an empty or malformed date is read as today's month.
 */
export function describeSettlementTiming(tradeDateIso: string, todayIso: string): string {
  const isPastMonth = tradeDateIso.length >= 7 && tradeDateIso.slice(0, 7) < todayIso.slice(0, 7);
  return isPastMonth
    ? "Il saldo del conto si muove oggi, non alla data dell'operazione: se lo riflette già, lascia «Nessuno»."
    : 'Se selezionato, il saldo del conto viene aggiornato automaticamente.';
}

export interface CategoryDeletionFacts {
  /** The category or subcategory about to be deleted. */
  name: string;
  isSubCategory: boolean;
  /** How many rows carry it — from the same query the action's label counts. */
  expenseCount: number;
  /**
   * What those rows are worth, in EUR, or `null` where the surface does not know.
   * A missing figure drops its clause; it is never printed as a zero.
   */
  totalEur: number | null;
}

/**
 * The reading of the "delete a category" modal, which states the consequence before the
 * controls that choose it.
 *
 * The surface it replaces opened on «Impossibile eliminare categoria» and then offered two
 * buttons that deleted it — a headline denying an act the modal performs.
 */
export function describeCategoryDeleteReading(facts: CategoryDeletionFacts): Narrative {
  const kind = facts.isSubCategory ? 'sottocategoria' : 'categoria';

  if (facts.expenseCount === 0) {
    return [
      { text: `Nessun movimento usa la ${kind} ` },
      { text: facts.name },
      { text: ': eliminandola non cambia nessun totale.' },
    ];
  }

  const segments: Narrative = [
    { text: `${facts.expenseCount}`, mono: true },
    { text: facts.expenseCount === 1 ? ' movimento è in ' : ' movimenti sono in ' },
    { text: facts.name },
  ];

  if (facts.totalEur !== null) {
    segments.push({ text: ', per ' }, { text: cachedFormatCurrencyEUR(facts.totalEur), mono: true });
  }

  segments.push({ text: ': decidi dove finiscono prima di eliminarla.' });
  return segments;
}

/**
 * The reading of the "move a category's rows elsewhere" modal.
 *
 * It says what SURVIVES the move — the source category — because that is the one thing this
 * surface does differently from the one that deletes it, and the two look alike.
 */
export function describeCategoryMoveReading(facts: { name: string; expenseCount: number }): Narrative {
  if (facts.expenseCount === 0) {
    return [
      { text: 'Non c’è nessun movimento da spostare: ' },
      { text: facts.name },
      { text: ' è già vuota.' },
    ];
  }
  return [
    { text: `${facts.expenseCount}`, mono: true },
    { text: facts.expenseCount === 1 ? ' movimento passa ' : ' movimenti passano ' },
    { text: 'alla categoria che scegli. ' },
    { text: facts.name },
    { text: ' resta dov’è, vuota.' },
  ];
}

// ─── Dividendi: the form, the delete, the scrape ─────────────────────────────

export interface DividendIntent {
  isEdit: boolean;
  /** The record's instrument, on an edit («la cedola di BTP Valore»). */
  ticker?: string;
  /** A bond's payment is a coupon, and the sentence says so. */
  isBond?: boolean;
}

/**
 * The idle reading of the dividend form: what it wants, and the one rule a reader must know
 * before typing a date. The withholding proposal names its source — the instrument's own tax
 * rate — because a 26% typed by a component was wrong on every BTP until 2026-09-14.
 */
export function describeDividendIntent(intent: DividendIntent): Narrative {
  const what = intent.isBond ? 'la cedola' : 'il dividendo';
  if (intent.isEdit) {
    return [
      { text: `Stai modificando ${what}${intent.ticker ? ` di ${intent.ticker}` : ''}. Un pagamento datato in futuro resta «annunciato»: entra nel calendario, non negli incassi, finché la data non arriva.` },
    ];
  }
  return [
    {
      text: 'Scegli lo strumento e l’importo lordo per unità: la ritenuta è proposta dall’aliquota dello strumento e resta modificabile. Un pagamento datato in futuro resta «annunciato» finché la data non arriva.',
    },
  ];
}

export interface DividendDeleteFacts {
  /** «la cedola», «il dividendo», «il premio finale» — already with its article. */
  what: string;
  /** The payment date as printed («10/12/2026»). */
  paymentDate: string;
  /** A coupon the cron booked in the Cashflow: deleting takes that row with it. */
  hasExpense: boolean;
}

/**
 * What the second press of a dividend row's delete does — printed IN the row while the button
 * says «Conferma» (AGENTS.md → Accessibility). The DELETE route removes the linked cashflow
 * expense too, so the sentence says it when there is one.
 */
export function describeDividendDeleteConsequence(facts: DividendDeleteFacts): string {
  const head = `Eliminando, ${facts.what} del ${facts.paymentDate} sparisce dal registro`;
  return facts.hasExpense ? `${head} e dal Cashflow.` : `${head}.`;
}

/**
 * The reading of the «Scarica dividendi storici» confirm: which instruments, and the floor
 * the route applies (lib/utils/dividendEligibility.ts) — said BEFORE the run, not only in the
 * toast after it.
 */
export function describeScrapeReading(tickers: string[]): Narrative {
  if (tickers.length === 0) return [{ text: 'Nessuno strumento ha un ISIN: non c’è nulla da scaricare.' }];
  const who = tickers.length <= 4 ? listInItalian(tickers) : `${tickers.length} strumenti con ISIN`;
  return [
    { text: `Scarico da Borsa Italiana i dividendi di ${who}. I pagamenti precedenti alla data in cui possiedi ogni titolo vengono scartati: puoi spostarla registrando l’acquisto nel Registro operazioni.` },
  ];
}

export const DIVIDEND_SCRAPE_SUBMITTING = 'Sto scaricando: può richiedere alcuni minuti.';

export interface DividendDayCounts {
  received: number;
  announced: number;
  receivedEur: number;
  announcedEur: number;
}

/**
 * The reading of a calendar day on Dividendi.
 *
 * Money that ARRIVED and money merely ANNOUNCED are never one figure and never one clause
 * (DESIGN.md → The Received-vs-Announced Rule): a single total would tell the reader they
 * have what they do not.
 */
export function describeDividendDayReading(counts: DividendDayCounts): Narrative {
  const clauses: Narrative[] = [];

  if (counts.received > 0) {
    clauses.push([
      { text: `${counts.received}`, mono: true },
      { text: counts.received === 1 ? ' incassato (' : ' incassati (' },
      { text: cachedFormatCurrencyEUR(counts.receivedEur), mono: true, sign: 'positive' },
      { text: ')' },
    ]);
  }
  if (counts.announced > 0) {
    clauses.push([
      { text: `${counts.announced}`, mono: true },
      { text: counts.announced === 1 ? ' annunciato (' : ' annunciati (' },
      { text: cachedFormatCurrencyEUR(counts.announcedEur), mono: true },
      { text: ')' },
    ]);
  }

  if (clauses.length === 0) {
    return [{ text: 'Nessun pagamento in questa data.' }];
  }

  return [...joinClauses(clauses), { text: ' in questa data.' }];
}

export interface DummyDataCounts {
  snapshots: number;
  expenses: number;
  categories: number;
  total: number;
}

/**
 * The reading of the "delete the test data" modal, which states what will be lost before the
 * button that loses it. With nothing to delete it says so, and the surface shows no list.
 */
export function describeDummyDataReading(counts: DummyDataCounts): Narrative {
  if (counts.total === 0) {
    return [{ text: 'Non c’è nessun dato di test da eliminare: l’account contiene solo i tuoi.' }];
  }
  return [
    { text: `${counts.total}`, mono: true },
    { text: counts.total === 1 ? ' elemento di test' : ' elementi di test' },
    { text: ' escono per sempre dai totali, dallo Storico e dai budget.' },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Joins clauses the Italian way: «a», «a e b», «a, b e c». */
function joinClauses(clauses: Narrative[]): Narrative {
  const out: Narrative = [];
  clauses.forEach((clause, index) => {
    if (index > 0) out.push({ text: index === clauses.length - 1 ? ' e ' : ', ' });
    out.push(...clause);
  });
  return out;
}

// ── Previdenza ──────────────────────────────────────────────────────────────

/** «Registra un versamento»: the status line of the contribution form. */
export const PENSION_CONTRIBUTION_COPY: ModalStatusCopy = {
  idle: [
    {
      text: 'Un versamento volontario scala il conto collegato e alza la deduzione IRPEF dell’anno fiscale che scegli; quello del datore no — è compenso, non capitale tuo.',
    },
  ],
  submitting: 'Registrazione del versamento in corso…',
};

/** The toast after a contribution: the next step, so the order is taught where it matters. */
export const PENSION_CONTRIBUTION_RECORDED = {
  title: 'Versamento registrato',
  next: 'Quando arriva l’estratto conto, aggiorna il valore del fondo: lo include già.',
  action: 'Aggiorna valore',
} as const;

export interface PensionValueFacts {
  /** The fund's name, or null when the modal still asks which fund. */
  fundName: string | null;
  /** The value the fund holds now. */
  currentValue: number;
  /** Contributions recorded in the current month — they are already inside a fresh statement. */
  monthPaidIn: number;
  /** Whether a fund's value still belongs to a closed month (`FundTodaySummary.valueIsStale`). */
  stale: boolean;
}

/**
 * «Aggiorna il valore del fondo»: the reading says what the form overwrites and states the
 * one trap of the act — a statement already contains the month's contributions, so they
 * must be registered BEFORE the value, never after.
 */
export function describePensionValueCopy(facts: PensionValueFacts): ModalStatusCopy {
  const subject = facts.fundName ? `${facts.fundName} vale ` : 'Il fondo vale ';
  const idle: Narrative = [{ text: subject }, { text: cachedFormatCurrencyEUR(facts.currentValue), mono: true }];
  if (facts.stale) idle.push({ text: ' da un mese chiuso' });
  idle.push({ text: ': scrivi il valore dell’estratto conto.' });
  if (facts.monthPaidIn > 0) {
    idle.push(
      { text: ' I ' },
      { text: cachedFormatCurrencyEUR(facts.monthPaidIn), mono: true },
      { text: ' versati questo mese sono già dentro l’estratto: non aggiungerli.' },
    );
  } else {
    idle.push({ text: ' Se questo mese hai versato, registra prima i versamenti: l’estratto li include già.' });
  }
  return { idle, submitting: 'Aggiornamento del valore in corso…' };
}

/**
 * Lowercases the first letter of an action so it can follow «Premi di nuovo per».
 *
 * A word that is already all-caps (an acronym, «PMC») keeps its case: lowering it would
 * rename the thing.
 */
function lowerFirst(text: string): string {
  if (text.length === 0) return text;
  const [first] = text;
  if (first === first.toLowerCase()) return text;

  // The judgement is on the FIRST WORD, not on the rest of the label: «PMC azzerato» has a
  // lowercase tail and an acronym at the head, and lowering that head renames the thing.
  const firstWord = text.split(' ', 1)[0];
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return text;

  return first.toLowerCase() + text.slice(1);
}

function neutral(text: string): ModalReading {
  return { narrative: [{ text }], tone: 'neutral' };
}

function negative(text: string): ModalReading {
  return { narrative: [{ text }], tone: 'negative' };
}
