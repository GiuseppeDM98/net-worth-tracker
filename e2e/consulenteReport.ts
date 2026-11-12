/**
 * The Consulente's REPORT in a browser, shared by its specs (desktop and 390; 2026-11-08, moved
 * here from the report's spec when the report became a book). A helper, not a spec: no project
 * collects it.
 *
 * `plant` writes a literal document in `allocationAdvice/test-user-1` through firebase-admin on the
 * emulator: two classes at 70 and 30, the goal «Fondo fenicottero» on «ETF ornitorinco», an
 * interview of two rounds with one decline, the request «meno cripto» with the round asked before
 * it. The `headings` variant writes the review's seven sections, so the book has its ten pages; the
 * `plain` variant a text without headings, so the book has one text page «Il report».
 * `rememberHeld` / `restoreHeld` put back what the account held, or delete the document.
 *
 * No run is started: every spec that reads a report fakes the run route (`installFakeRun`).
 */

import { expect, type Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';

export type ReportStatus = 'ready' | 'failed' | 'running';
export type ReportVariant = 'headings' | 'plain';

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return { db: getFirestore(app), Timestamp };
}

/** The review's seven sections, as the contract prescribes them; invented words. */
export const SEVEN_SECTIONS = [
  '## 1. In una frase',
  'Il report del Consulente, finto: più azioni, meno liquidità.',
  "## 2. L'allocazione proposta",
  'Settanta in azioni e trenta in obbligazioni.',
  '## 3. Gli strumenti',
  "L'ETF ornitorinco copre le azioni.",
  '## 4. Gli obiettivi',
  'Il Fondo fenicottero, metà sull\'ETF ornitorinco.',
  '## 5. Casa, fondi pensione e illiquidi',
  'La casa resta fuori dal piano.',
  '## 6. Cosa fare adesso',
  'Versa 2000 € al mese sull\'ETF ornitorinco.',
  '## 7. Rischi e revisione',
  'Un calo delle azioni pesa di più.',
].join('\n');

/** The printable pages of the `headings` book, in order (every page but «Chiedi una modifica» and «Applica»). */
export const PRINTABLE_TITLES = ['In una frase', "L'allocazione proposta", 'Gli strumenti', 'Gli obiettivi', 'Casa, fondi pensione e illiquidi', 'Cosa fare adesso', 'Rischi e revisione', 'Il colloquio'];

/** A literal document, every date a Timestamp; the answers and the proposal shaped by the schemas of lib/utils/allocationAdviceProposal.ts. */
export async function plant(status: ReportStatus, variant: ReportVariant = 'headings') {
  const { db, Timestamp } = await admin();
  const now = Timestamp.fromDate(new Date());
  const answers = {
    age: 35,
    horizonYears: 20,
    lossTolerance: 'media',
    exchange: 'Borsa Italiana (Milano, XMIL)',
    broker: '',
    distributionPolicy: 'accumulazione',
    goals: [],
    goalsReflectReality: true,
    newGoalsNote: '',
    homeRole: 'excluded',
    pensionRole: 'frozen',
    privateEquityRole: 'frozen',
    keepAssets: [],
    avoid: '',
    esg: false,
    notes: '',
  };
  const proposal = {
    summary: 'Più azioni, meno liquidità: un portafoglio finto per la spec.',
    classes: [
      { assetClass: 'equity', targetPercentage: 70, rationale: 'Orizzonte lungo.', subTargets: [] },
      { assetClass: 'bonds', targetPercentage: 30, rationale: 'La parte che frena.', subTargets: [] },
    ],
    assetRoles: [],
    goals: [{ name: 'Fondo fenicottero', priority: 'media', assignments: [{ assetName: 'ETF ornitorinco', percentage: 50 }], rationale: 'Un obiettivo finto.' }],
    reviewByIso: '2027-06-15',
    reviewReason: 'Fra un anno.',
    risks: ['Un calo del 30% delle azioni.'],
  };
  const strategy = { markdown: variant === 'headings' ? '## La situazione\n\nTesto della strategia.\n\n## Obiettivi\n\nIl Fondo fenicottero.' : '# Strategia finta\n\nTesto della strategia.', proposal, model: 'opus-finto', finishedAt: now };
  const instruments = {
    markdown: 'Strumenti finti.',
    candidates: {
      sleeves: [
        { assetClass: 'equity', subTarget: 'Azioni mondo', candidates: [{ name: 'ETF ornitorinco', exchange: 'Borsa Italiana', note: 'Finto.' }] },
        // A bond sleeve with the duration the agent verified (2026-11-08): the page prints it.
        { assetClass: 'bonds', subTarget: 'Euro 1-3 anni', candidates: [{ name: 'ETF fenicottero breve', exchange: 'Borsa Italiana', note: 'Finto.', duration: 1.9 }] },
      ],
    },
    model: 'sonnet-finto',
    webSearchUsed: true,
    finishedAt: now,
  };
  const report = { markdown: variant === 'headings' ? SEVEN_SECTIONS : 'Il report del Consulente, finto, senza titoli.\n\nUn secondo paragrafo.', proposal, model: 'opus-finto', finishedAt: now };
  // The interview before the strategy: two rounds, invented figures, one decline (2026-11-08).
  const reddito = { id: 'reddito', kind: 'single', text: 'Quanto dipendi da quella fonte?', why: "l'86% delle entrate", options: [{ value: 'tutto', label: 'Interamente' }, { value: 'meta', label: 'Circa metà' }], allowOther: true };
  const riserva = { id: 'riserva', kind: 'multiple', text: 'Cosa conta come riserva di emergenza?', why: '2 mesi di spesa', options: [{ value: 'conti', label: 'I conti correnti' }, { value: 'btp', label: 'I BTP a breve' }], allowOther: true };
  const casa = { id: 'casa', kind: 'single', text: 'La casa resta fuori dal piano?', why: 'il 40% del patrimonio', options: [{ value: 'fuori', label: 'Sì, resta fuori' }, { value: 'dentro', label: 'No, potrei venderla' }], allowOther: true };
  const interview = {
    rounds: [
      { note: "Vedo un reddito concentrato: l'86% delle entrate da una fonte sola.", satisfied: false, questions: [reddito, riserva], answers: [{ questionId: 'reddito', value: 'meta' }, { questionId: 'riserva', value: '__decline__' }], model: 'opus-finto', askedAt: now },
      { note: 'Resta da capire la casa.', satisfied: true, questions: [casa], answers: [{ questionId: 'casa', value: 'fuori' }], model: 'opus-finto', askedAt: now },
    ],
    skipped: false,
  };
  const cedere = { id: 'cedere', kind: 'single', text: 'Cosa accetti di cedere per avere meno cripto?', why: 'il 5% del portafoglio', options: [{ value: 'rendimento', label: "Un po' di rendimento atteso" }, { value: 'niente', label: 'Niente: solo spostare' }], allowOther: true };
  const revisionInterview = { rounds: [{ note: 'Prima di togliere le cripto, una domanda.', satisfied: true, questions: [cedere], answers: [{ questionId: 'cedere', value: 'rendimento' }], model: 'opus-finto', askedAt: now }], skipped: false };
  const base = { answers, createdAt: now, updatedAt: now, startedAt: now, applied: null, revisions: [{ request: 'meno cripto', at: now }], interview, revisionInterview };
  const document =
    status === 'ready'
      ? { ...base, status, stage: 'review', strategy, instruments, report, error: null }
      : status === 'failed'
        ? { ...base, status, stage: 'instruments', strategy, instruments: null, report: null, error: 'Ricerca finta interrotta: ornitorinco.' }
        : { ...base, status, stage: 'instruments', strategy, instruments: null, report: null, error: null };
  await db.collection('allocationAdvice').doc(UID).set(document);
}

let held: FirebaseFirestore.DocumentData | null = null;

/** In `beforeAll`: what the account holds, to put back. */
export async function rememberHeld() {
  const { db } = await admin();
  const snap = await db.collection('allocationAdvice').doc(UID).get();
  held = snap.exists ? (snap.data() ?? null) : null;
}

/** In `afterAll`: the held document back, or none. */
export async function restoreHeld() {
  const { db } = await admin();
  const ref = db.collection('allocationAdvice').doc(UID);
  if (held) await ref.set(held);
  else await ref.delete();
}

/** The book's card: the one region named «Pagina n di N · …». */
export const bookCard = (page: Page) => page.getByRole('region', { name: /^Pagina \d+ di \d+ · / });

/** The page has settled: the card names it and ONE scene is on screen, the new page's (the leaving one is gone). */
export async function expectPage(page: Page, label: string | RegExp, id?: string) {
  await expect(bookCard(page)).toHaveAttribute('aria-label', label);
  if (id) {
    await expect(page.locator('[data-scene]')).toHaveCount(1);
    await expect(page.locator('[data-scene]')).toHaveAttribute('data-scene', id);
  }
}

/** Opens the report (the book or the running view) at `search` (e.g. `?pagina=strumenti`). */
export async function openReport(page: Page, search = '') {
  await page.goto(`/dashboard/allocation/consulente${search}`, { waitUntil: 'load' });
  await expect(bookCard(page).or(page.getByRole('region', { name: 'Le fasi' }))).toBeVisible({ timeout: 60_000 });
}
