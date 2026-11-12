/**
 * Every sentence of the Consulente (2026-10-20): the screens' questions and readings, the
 * run's stages, the report's verdict and tile readings, the «rivedi entro» line the
 * Allocazione header prints. Pure; no component writes copy.
 */

import type { Narrative, PageVerdictModel } from '@/lib/utils/narrative';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import type { AllocationAdviceDocument, AllocationAdviceInterview, AllocationAdviceStage, AllocationAdviceStep } from '@/types/allocationAdvice';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';

const prose = (text: string): Narrative[number] => ({ text });
const figure = (text: string): Narrative[number] => ({ text, mono: true });

// ─── The screens ──────────────────────────────────────────────────────────────

export const STEP_COPY: Record<AllocationAdviceStep, { eyebrow: string; question: string; help: string }> = {
  profilo: {
    eyebrow: 'Chi sei',
    question: 'Quanti anni hai e per quanti anni investi?',
    help: "L'orizzonte è il tempo prima di cui non ti serve toccare questi soldi. Più è lungo, più il piano può reggere oscillazioni.",
  },
  tolleranza: {
    eyebrow: 'Le perdite',
    question: 'Quanto reggi a vedere il portafoglio in rosso?',
    help: 'Le tre cifre sono calcolate sulla base della tua Allocazione di oggi: non una percentuale astratta, i tuoi euro.',
  },
  borsa: {
    eyebrow: 'Dove compri',
    question: 'Su quale borsa compri, e con quale broker?',
    help: 'Il secondo agente cerca strumenti quotati lì, con ISIN e ticker verificati.',
  },
  politica: {
    eyebrow: 'I proventi',
    question: 'Preferisci strumenti ad accumulazione o a distribuzione?',
    help: 'Ad accumulazione reinvestono dividendi e cedole; a distribuzione li incassi. Per chi accumula la prima è quasi sempre più efficiente fiscalmente.',
  },
  obiettivi: {
    eyebrow: 'Gli obiettivi',
    question: 'Questi obiettivi rispecchiano la realtà?',
    help: 'Uno per schermata: confermalo, correggilo o segnalo da eliminare. Alla fine puoi dire cosa manca: il Consulente lo proporrà con gli strumenti giusti.',
  },
  ruoli: {
    eyebrow: 'Casa, pensione, illiquidi',
    question: 'Cosa conta nella tua allocazione e cosa resta fuori?',
    help: '«Non negoziabile» conta nelle percentuali ma i piani non lo toccano: un fondo pensione obbligazionario abbassa l\'obbligazionario da comprare. «Escluso» è fuori da tutto: la casa in cui vivi.',
  },
  vincoli: {
    eyebrow: 'I vincoli',
    question: 'Cosa vuoi tenere, cosa evitare?',
    help: "Uno strumento da tenere resta nel piano anche se il Consulente ne preferirebbe un altro; un'esclusione vale per la ricerca.",
  },
  riepilogo: {
    eyebrow: 'Riepilogo',
    question: 'Tutto giusto? Avvio la ricerca.',
    help: 'Due agenti: uno propone la strategia e la rivede alla fine, l\'altro cerca sul web gli strumenti per ogni sotto-target. Qualche minuto.',
  },
};

export const LOSS_TOLERANCE_OPTIONS = [
  { value: 'bassa' as const, label: 'Bassa', hint: 'Un −10% mi farebbe vendere o dormire male.' },
  { value: 'media' as const, label: 'Media', hint: 'Reggerei un −25% senza vendere, con fatica.' },
  { value: 'alta' as const, label: 'Alta', hint: 'Reggerei un −40% senza vendere, e comprerei ancora.' },
];

export const DISTRIBUTION_POLICY_OPTIONS = [
  { value: 'accumulazione' as const, label: 'Accumulazione', hint: 'Reinveste i proventi, nessuna tassazione annua sui dividendi.' },
  { value: 'distribuzione' as const, label: 'Distribuzione', hint: 'Incassi dividendi e cedole in conto.' },
  { value: 'indifferente' as const, label: 'Scegli tu', hint: 'Il Consulente motiva la scelta.' },
];

export const EXCHANGE_OPTIONS = ['Borsa Italiana (Milano, XMIL)', 'Xetra (Francoforte)', 'Euronext (Parigi / Amsterdam)', 'London Stock Exchange'];
/** The value of the list's last row: a free text field opens under it (2026-10-20). */
export const EXCHANGE_OTHER = 'other';
export const EXCHANGE_OTHER_LABEL = 'Altra…';
/** An exchange the list knows, or not: the field decides whether to show the free text. */
export function isListedExchange(exchange: string): boolean {
  return EXCHANGE_OPTIONS.includes(exchange);
}

/** «−10% sono 6000 €» — the loss scenario rows of step 2. */
export function describeLossScenario(pct: number, eur: number): Narrative {
  return [figure(`−${pct}%`), prose(' sarebbero '), figure(formatCurrency(eur, 'EUR', 0)), prose(' in meno.')];
}

/** «Chiedi una modifica» on the report (2026-10-20): what it does, in the tile's words. */
export const REVISION_COPY = {
  reading: 'Una richiesta rilancia solo la revisione (Opus 5.5, un paio di minuti): strategia e strumenti restano, il report e la proposta vengono riscritti e «Applica» scrive quelli nuovi.',
  label: 'Cosa vuoi cambiare',
  placeholder: 'es. vorrei liberarmi degli ETF obbligazionari e concentrarmi sui bond singoli, per arrivare a 50.000 € in titoli di Stato',
  running: 'Rivedo il report con la tua richiesta…',
} as const;

// ─── The book (2026-11-08) ────────────────────────────────────────────────────

/**
 * The words of the report read as a book: the page's eyebrow, the pager, the «Indice» modal, the
 * risks page's aside, the instruments page's reading without candidates. Strings only: the
 * Allocazione page loads this module (`describeReviewBy`), and it stays zod-free.
 */
export const BOOK_COPY = {
  eyebrow: (n: number, total: number, title: string) => `Pagina ${n} di ${total} · ${title}`,
  back: 'Indietro',
  next: 'Avanti',
  index: 'Indice',
  indexEyebrow: (total: number) => `Il report · ${total === 1 ? '1 pagina' : `${total} pagine`}`,
  indexTitle: 'Vai a una pagina',
  indexReading: "Ogni pagina si legge da sola; «Applica» è l'ultima.",
  reviewAside: (date: string) => `rivedi entro il ${date}`,
  instrumentsTextOnly: 'La ricerca ha scritto solo testo: è quello di questa pagina.',
} as const;

// ─── The interview (2026-11-08) ───────────────────────────────────────────────

/** Every label of the interview: the summary's footer, the scene, the report's tile and the revision tile (2026-11-08). */
export const INTERVIEW_COPY = {
  /** The summary, with no round yet. */
  start: 'Avvia il colloquio',
  skipAndRun: 'Salta il colloquio e avvia la ricerca',
  /** The summary, with rounds. */
  resume: 'Torna al colloquio',
  restart: 'Ricomincia il colloquio',
  /** The scene. */
  eyebrow: (round: number, total: number) => `Colloquio · tornata ${round} di ${total}`,
  waitingHeadline: 'Il Consulente legge le tue risposte e i tuoi dati.',
  asking: 'Il Consulente legge le tue risposte e i tuoi dati…',
  back: 'Indietro',
  skip: 'Salta il colloquio',
  next: 'Continua',
  run: 'Avvia la ricerca',
  retry: 'Riprova',
  notConfigured: 'Servizio AI non configurato',
  /** The report's tile. */
  tileTitle: 'Il colloquio',
  roundEyebrow: (index: number) => `Tornata ${index}`,
  unanswered: 'non risposta',
  noQuestions: 'nessuna domanda',
  skippedAside: 'saltato',
  /** The revision tile. */
  revise: 'Rivedi il report',
  skipQuestions: 'Salta le domande',
  revisionAsked: 'Il Consulente ha chiesto',
} as const;

/**
 * The ONE singular/plural rule of «tornata», read by the prompt's header, the tile's aside and the
 * summary. Here and not in `allocationAdviceInterview.ts`: the Allocazione page loads this module
 * (`describeReviewBy`), and that one reaches zod through `questionSet` (2026-11-08, +34 KB gz seen
 * on `/dashboard/allocation` before the move).
 */
export function describeRoundCount(n: number): string {
  return n === 1 ? '1 tornata' : `${n} tornate`;
}

/** The tile's aside: «2 tornate», «2 tornate · saltato»; null with zero rounds (no tile, decision 53). */
export function describeInterviewAside(interview: AllocationAdviceInterview | null | undefined): string | null {
  if (!interview || interview.rounds.length === 0) return null;
  const count = describeRoundCount(interview.rounds.length);
  return interview.skipped ? `${count} · ${INTERVIEW_COPY.skippedAside}` : count;
}

// ─── The run ──────────────────────────────────────────────────────────────────

export const STAGE_COPY: Record<AllocationAdviceStage, { label: string; detail: string }> = {
  context: { label: 'Leggo il portafoglio', detail: 'Strumenti, allocazione, registro, obiettivi, previdenza, famiglia.' },
  strategy: { label: 'Propongo la strategia', detail: 'Opus 5.5 ragiona su orizzonte, tolleranza, obiettivi e vincoli.' },
  instruments: { label: 'Cerco gli strumenti', detail: 'Sonnet 5.5 verifica sul web quotazione, ISIN e costi sulla tua borsa.' },
  review: { label: 'Rivedo il tutto', detail: 'Opus 5.5 unisce strategia e strumenti nel report finale.' },
};

export function describeRunHeadline(stage: AllocationAdviceStage | null): string {
  if (stage === null) return 'Avvio il percorso.';
  return `${STAGE_COPY[stage].label}.`;
}

/** What a stage usually takes, in minutes (about five in all at effort `medium`, 2026-10-23; decision 50). */
export const STAGE_TYPICAL_MINUTES: Record<AllocationAdviceStage, number> = { context: 0, strategy: 2, instruments: 2, review: 1 };

/** «di solito ~N min»; null when N is 0 (the context: the row prints no duration). */
export function describeStageTypical(stage: AllocationAdviceStage): string | null {
  const minutes = STAGE_TYPICAL_MINUTES[stage];
  if (minutes <= 0) return null;
  return `di solito ~${minutes} min`;
}

// ─── The report ───────────────────────────────────────────────────────────────

/** The report page's verdict: the proposal's summary as the sentence, the headline by status. */
export function buildConsulenteVerdict(document: AllocationAdviceDocument, todayIso?: string): PageVerdictModel {
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  if (document.status === 'failed') {
    return {
      headline: 'Il percorso non si è concluso.',
      tone: 'negative',
      sentence: [prose(document.error ?? 'Riprova fra qualche istante.')],
    };
  }
  if (document.status === 'applied' && document.applied) {
    // Near or past the review date the verdict says so and points at «Rifai il percorso», which
    // starts from the plan in force (2026-10-20).
    const due = todayIso ? reviewDueState(document, todayIso) : ({ state: 'none' } as const);
    const invite = describeReviewInvite(due);
    return {
      headline: 'Allocazione applicata.',
      tone: due.state === 'due' ? 'warning' : 'positive',
      sentence: [
        prose(`Scritta il ${formatDate(document.applied.at)}`),
        ...(proposal ? [prose('; da rivedere entro il '), figure(formatDate(new Date(proposal.reviewByIso))), prose('.')] : [prose('.')]),
        ...(invite ? [prose(` ${invite} «Rifai il percorso», nell'ultima pagina, riparte dal piano in vigore e dal suo perché.`)] : []),
      ],
    };
  }
  if (!proposal) {
    return {
      headline: 'Il Consulente ha scritto il report, senza una proposta leggibile.',
      tone: 'warning',
      sentence: [prose("Leggi il testo nelle pagine che seguono; «Applica» non è disponibile perché il blocco strutturato non è valido. Rifai il percorso per ottenerne uno.")],
    };
  }
  return {
    headline: 'La proposta è pronta.',
    tone: 'neutral',
    sentence: [prose(proposal.summary.trim()), prose(' Da rivedere entro il '), figure(formatDate(new Date(proposal.reviewByIso))), prose('.')],
  };
}

export interface ProposalClassRow {
  assetClass: string;
  label: string;
  currentPct: number;
  proposedPct: number;
  /** Set on a fixed cash reserve. */
  fixedAmount?: number;
  deltaPp: number;
  subTargets: { name: string; pct: number; instrument?: string }[];
}

/** Current vs proposed, class by class, the classes of the proposal first and the held ones it drops after. */
export function buildProposalRows(proposal: AllocationAdviceProposal, currentPctByClass: Record<string, number>): ProposalClassRow[] {
  const rows: ProposalClassRow[] = proposal.classes.map((cls) => {
    const currentPct = currentPctByClass[cls.assetClass] ?? 0;
    const proposedPct = cls.fixedAmount !== undefined ? 0 : cls.targetPercentage;
    return {
      assetClass: cls.assetClass,
      label: ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass,
      currentPct,
      proposedPct,
      ...(cls.fixedAmount !== undefined ? { fixedAmount: cls.fixedAmount } : {}),
      deltaPp: cls.fixedAmount !== undefined ? 0 : proposedPct - currentPct,
      subTargets: cls.subTargets.map((sub) => ({ name: sub.name, pct: sub.targetPercentage, ...(sub.instrument ? { instrument: sub.instrument } : {}) })),
    };
  });
  const named = new Set<string>(proposal.classes.map((cls) => cls.assetClass));
  for (const [assetClass, currentPct] of Object.entries(currentPctByClass)) {
    if (named.has(assetClass) || currentPct <= 0) continue;
    rows.push({ assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass, currentPct, proposedPct: 0, deltaPp: -currentPct, subTargets: [] });
  }
  return rows;
}

/** «Azioni passa dal 47% al 55%; Obbligazioni dal 7% al 15%.» — the two largest moves, or «nessuna classe si muove di più di un punto». */
export function describeProposalReading(rows: ProposalClassRow[]): Narrative {
  const moves = rows.filter((row) => Math.abs(row.deltaPp) >= 1).sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp)).slice(0, 2);
  if (moves.length === 0) return [prose('Nessuna classe si muove di più di un punto rispetto a oggi.')];
  const out: Narrative = [];
  moves.forEach((row, index) => {
    if (index > 0) out.push(prose('; '));
    out.push(prose(`${row.label} passa dal `), figure(`${Math.round(row.currentPct)}%`), prose(' al '), figure(`${Math.round(row.proposedPct)}%`));
  });
  out.push(prose('.'));
  return out;
}

export function describeApplySummary(input: { targets: boolean; roles: number; goals: number }): string {
  const parts: string[] = [];
  if (input.targets) parts.push('i target in Impostazioni → Allocazione');
  if (input.roles > 0) parts.push(`${input.roles} ${input.roles === 1 ? 'ruolo' : 'ruoli'} degli asset`);
  if (input.goals > 0) parts.push(`${input.goals} ${input.goals === 1 ? 'obiettivo' : 'obiettivi'}`);
  if (parts.length === 0) return 'Niente selezionato: scegli almeno una voce.';
  return `Scrive ${parts.join(', ')}. Puoi sempre cambiarli a mano dopo.`;
}

/** The Allocazione header's line when a plan has a review date («Piano applicato il 20/10/2026 · rivedi entro il 20/10/2028»). */
/** How many days before the review date the invite appears. */
export const REVIEW_SOON_DAYS = 30;

export type ReviewDue = { state: 'none' } | { state: 'later' | 'soon' | 'due'; reviewByIso: string; daysLeft: number };

/**
 * Where today stands against the applied plan's review date (owner, 2026-10-20: «nei giorni
 * vicino alla scadenza, un pulsante "revisione con il Consulente"»): `soon` within
 * REVIEW_SOON_DAYS before it, `due` on the day and after, `later` before, `none` without an
 * applied plan. Both dates are Italian calendar days (`getItalyDateIso`), compared in UTC.
 */
export function reviewDueState(document: AllocationAdviceDocument | null | undefined, todayIso: string): ReviewDue {
  if (!document || document.status !== 'applied' || !document.applied) return { state: 'none' };
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  if (!proposal) return { state: 'none' };
  const dayOf = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const daysLeft = Math.round((dayOf(proposal.reviewByIso) - dayOf(todayIso)) / 86_400_000);
  return { state: daysLeft <= 0 ? 'due' : daysLeft <= REVIEW_SOON_DAYS ? 'soon' : 'later', reviewByIso: proposal.reviewByIso, daysLeft };
}

export const REVIEW_INVITE_LABEL = 'Rivedi con il Consulente';

/** The invite's sentence when the review is near or due; null otherwise. */
export function describeReviewInvite(due: ReviewDue): string | null {
  if (due.state !== 'soon' && due.state !== 'due') return null;
  const date = formatDate(new Date(due.reviewByIso));
  if (due.state === 'soon') return `La revisione del piano è vicina: entro il ${date}, fra ${due.daysLeft} ${due.daysLeft === 1 ? 'giorno' : 'giorni'}.`;
  if (due.daysLeft === 0) return `Oggi è il giorno della revisione del piano (${date}).`;
  return `La data della revisione del piano, ${date}, è passata da ${-due.daysLeft} ${due.daysLeft === -1 ? 'giorno' : 'giorni'}.`;
}

export function describeReviewBy(document: AllocationAdviceDocument | null | undefined): string | null {
  if (!document || document.status !== 'applied' || !document.applied) return null;
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  if (!proposal) return `Piano del Consulente applicato il ${formatDate(document.applied.at)}`;
  return `Piano del Consulente applicato il ${formatDate(document.applied.at)} · rivedi entro il ${formatDate(new Date(proposal.reviewByIso))}`;
}
