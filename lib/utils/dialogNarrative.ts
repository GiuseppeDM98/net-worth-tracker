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
