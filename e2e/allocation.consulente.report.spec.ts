/**
 * Allocazione › Consulente, the REPORT at 1440px (2026-11-07): every tile the model wrote
 * wears the accent and «Applica» / «Chiedi una modifica» do not; the column cascades in once per
 * JS session and the proposed percentages count up with it; a failed run marks its strategy; a run
 * still going shows its stage rows with the typical duration and no clock; reduced motion plays
 * nothing.
 *
 * Each test plants its own document in `allocationAdvice/test-user-1` through firebase-admin on the
 * emulator (two classes at 70 and 30, the goal «Fondo fenicottero» on «ETF ornitorinco»; since
 * 2026-11-08 an `interview` of two rounds with one decline and a `revisionInterview` of one round
 * under the request «meno cripto»); `afterAll` puts back what the account held, or deletes the
 * document when it held none. No run is started: «Chiedi una modifica» is exercised on a faked
 * route (`e2e/consulenteInterview.ts`), the round before the revision included.
 */

import { test, expect, type Page } from '@playwright/test';
import { REVISION_ROUND, installFakeRun } from './consulenteInterview';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-net-worth';

const UID = 'test-user-1';

declare global {
  interface Window {
    __report?: { minOpacity: number; pcts: string[] };
  }
}

test.describe.configure({ mode: 'serial' });

async function admin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  return { db: getFirestore(app), Timestamp };
}

type Status = 'ready' | 'failed' | 'running';

/** A literal document, every date a Timestamp; the answers and the proposal shaped by the schemas of lib/utils/allocationAdviceProposal.ts. */
async function plant(status: Status) {
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
    risks: [],
  };
  const strategy = { markdown: '# Strategia finta\n\nTesto della strategia.', proposal, model: 'opus-finto', finishedAt: now };
  const instruments = {
    markdown: 'Strumenti finti.',
    candidates: {
      sleeves: [
        { assetClass: 'equity', subTarget: 'Azioni mondo', candidates: [{ name: 'ETF ornitorinco', exchange: 'Borsa Italiana', note: 'Finto.' }] },
        // A bond sleeve with the duration the agent verified (2026-11-08): the report prints it.
        { assetClass: 'bonds', subTarget: 'Euro 1-3 anni', candidates: [{ name: 'ETF fenicottero breve', exchange: 'Borsa Italiana', note: 'Finto.', duration: 1.9 }] },
      ],
    },
    model: 'sonnet-finto',
    webSearchUsed: true,
    finishedAt: now,
  };
  const report = { markdown: '# Report finto\n\nIl report del Consulente, finto.', proposal, model: 'opus-finto', finishedAt: now };
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

test.beforeAll(async () => {
  const { db } = await admin();
  const snap = await db.collection('allocationAdvice').doc(UID).get();
  held = snap.exists ? (snap.data() ?? null) : null;
});

test.afterAll(async () => {
  const { db } = await admin();
  const ref = db.collection('allocationAdvice').doc(UID);
  if (held) await ref.set(held);
  else await ref.delete();
});

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    window.__report = { minOpacity: 1, pcts: [] };
    const tick = () => {
      const probe = window.__report!;
      const column = document.querySelector('[data-consulente-report]');
      if (column) {
        for (const child of Array.from(column.children)) {
          const opacity = Number.parseFloat(getComputedStyle(child).opacity);
          if (opacity < probe.minOpacity) probe.minOpacity = opacity;
        }
        const pct = document.querySelector('[data-proposed-pct]');
        const text = pct?.textContent ?? null;
        if (text !== null && probe.pcts[probe.pcts.length - 1] !== text) probe.pcts.push(text);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const readProbe = (page: Page) => page.evaluate(() => window.__report!);
const resetProbe = (page: Page) =>
  page.evaluate(() => {
    window.__report = { minOpacity: 1, pcts: [] };
  });

async function openReport(page: Page) {
  await page.goto('/dashboard/allocation/consulente', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Applica' }).or(page.getByRole('region', { name: 'Le fasi' }))).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await installProbe(page);
});

test('a ready report marks what the model wrote, cascades once and counts the proposal up', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  await expect(page.locator('[data-generated]')).toHaveCount(4);
  for (const name of ['Allocazione proposta', 'Strumenti', 'Obiettivi', 'Il report']) {
    await expect(page.getByRole('region', { name })).toHaveAttribute('data-generated', '');
  }
  await expect(page.getByRole('region', { name: 'Applica' })).not.toHaveAttribute('data-generated');
  await expect(page.getByRole('region', { name: 'Chiedi una modifica' })).not.toHaveAttribute('data-generated');
  await expect(page.getByRole('button', { name: 'Rivedi il report' })).toHaveClass(/var\(--ai-glow\)/);
  // The bond candidate's verified duration (2026-11-08).
  await expect(page.getByRole('region', { name: 'Strumenti' })).toContainText('ETF fenicottero breve · duration 1,9 anni · Borsa Italiana');
  await expect(page.locator('[data-proposed-pct]').first()).toHaveText('70,0%');
  await page.waitForTimeout(800);
  const first = await readProbe(page);
  expect(first.minOpacity).toBeLessThan(0.5);
  expect(first.pcts.length).toBeGreaterThan(1);
  expect(first.pcts[first.pcts.length - 1]).toBe('70,0%');

  // Back to the Allocazione and in again, the same JS session: no cascade, the figure at once.
  await page.getByRole('link', { name: "Torna all'Allocazione" }).click();
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  await resetProbe(page);
  await page.getByRole('link', { name: 'Consulente' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('region', { name: 'Applica' })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(800);
  const second = await readProbe(page);
  expect(second.minOpacity).toBe(1);
  expect(second.pcts).toEqual(['70,0%']);
});

test('the report shows «Il colloquio» with its two rounds, and the round asked before the last request', async ({ page }) => {
  await plant('ready');
  await openReport(page);
  // The tile recaps the user's own words: not a generated surface (decision 79); it sits between the report and the revision.
  const tile = page.getByRole('region', { name: 'Il colloquio' });
  await expect(tile).toBeVisible();
  await expect(tile).not.toHaveAttribute('data-generated');
  await expect(tile).toContainText('2 tornate');
  await expect(tile).toContainText('Tornata 1');
  await expect(tile).toContainText("Vedo un reddito concentrato: l'86% delle entrate da una fonte sola.");
  await expect(tile).toContainText('Quanto dipendi da quella fonte?');
  await expect(tile).toContainText('Circa metà');
  await expect(tile).toContainText('Preferisco non dire');
  await expect(tile).toContainText('Tornata 2');
  await expect(tile).toContainText('Sì, resta fuori');
  await expect(tile.getByRole('button')).toHaveCount(0);
  const reportBox = (await page.getByRole('region', { name: 'Il report' }).boundingBox())!;
  const tileBox = (await tile.boundingBox())!;
  const revisionBox = (await page.getByRole('region', { name: 'Chiedi una modifica' }).boundingBox())!;
  expect(tileBox.y).toBeGreaterThan(reportBox.y);
  expect(revisionBox.y).toBeGreaterThan(tileBox.y);
  // Under the last request, the round the Consulente asked before applying it.
  const revision = page.getByRole('region', { name: 'Chiedi una modifica' });
  await expect(revision).toContainText('1 richiesta');
  await expect(revision).toContainText('meno cripto');
  const asked = revision.locator('[data-revision-interview]');
  await expect(asked).toBeVisible();
  await expect(asked).toContainText('Il Consulente ha chiesto');
  await expect(asked).toContainText('Cosa accetti di cedere per avere meno cripto?');
  await expect(asked).toContainText("Un po' di rendimento atteso");
  await expect(page.locator('[data-generated]')).toHaveCount(4);
});

test('«Rivedi il report» asks one round first, then sends the revision with the answered round (decision 24)', async ({ page }) => {
  await plant('ready');
  const recorder = await installFakeRun(page, { delayRoundMs: () => 1_000 });
  await openReport(page);
  const revision = page.getByRole('region', { name: 'Chiedi una modifica' });
  const primary = revision.getByRole('button', { name: 'Rivedi il report' });
  await expect(primary).toBeDisabled();
  await expect(revision.getByRole('button', { name: 'Salta le domande' })).toHaveCount(0);
  await page.locator('#consulente-revision').fill('niente ornitorinchi');
  await expect(primary).toBeEnabled();
  await primary.click();

  // The wait: the skeleton, the textarea read-only, «Salta le domande» offered, the primary held.
  await expect(revision.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.locator('#consulente-revision')).toHaveAttribute('readonly', '');
  await expect(revision.getByRole('button', { name: 'Salta le domande' })).toBeVisible();
  await expect(primary).toBeDisabled();
  expect(recorder.interview).toHaveLength(1);
  expect(recorder.interview[0]).toMatchObject({ stage: 'interview', interview: { rounds: [], skipped: false }, revision: { requests: 'niente ornitorinchi' } });

  // The round: its note, one card, the status naming the question; answered, the primary sends the revision.
  const round = revision.locator('[data-revision-round]');
  await expect(round).toBeVisible();
  await expect(round).toContainText(REVISION_ROUND.note);
  await expect(round.locator('[data-question-card]')).toHaveCount(1);
  await expect(revision.getByRole('status').last()).toHaveText('Rispondi a «Cosa accetti di cedere per avere meno cripto?», o scegli «Preferisco non dire».');
  await expect(primary).toBeDisabled();
  await round.getByRole('radio', { name: 'Niente: solo spostare' }).click();
  await expect(primary).toBeEnabled();
  await primary.click();

  await expect(round).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#consulente-revision')).toHaveValue('');
  expect(recorder.revise).toHaveLength(1);
  expect(recorder.revise[0].request).toBe('niente ornitorinchi');
  expect(recorder.revise[0].interview?.skipped).toBe(false);
  expect(recorder.revise[0].interview?.rounds).toHaveLength(1);
  expect((recorder.revise[0].interview?.rounds[0] as { answers: unknown[] }).answers).toEqual([{ questionId: 'cedere', value: 'niente' }]);
  expect(recorder.strategy).toHaveLength(0);
});

test('«Salta le domande» while the round is still asked sends the revision with no round, skipped', async ({ page }) => {
  await plant('ready');
  const recorder = await installFakeRun(page, { delayRoundMs: () => 3_000 });
  await openReport(page);
  const revision = page.getByRole('region', { name: 'Chiedi una modifica' });
  await page.locator('#consulente-revision').fill('niente ornitorinchi');
  await revision.getByRole('button', { name: 'Rivedi il report' }).click();
  await expect(revision.locator('[aria-busy="true"]')).toBeVisible();
  const skip = revision.getByRole('button', { name: 'Salta le domande' });
  await expect(skip).not.toHaveClass(/ai-glow/);
  await skip.click();

  await expect(page.locator('#consulente-revision')).toHaveValue('', { timeout: 15_000 });
  expect(recorder.revise).toHaveLength(1);
  expect(recorder.revise[0]).toMatchObject({ stage: 'revise', request: 'niente ornitorinchi', interview: { rounds: [], skipped: true } });
  // The late round lands on nothing.
  await page.waitForTimeout(3_500);
  await expect(revision.locator('[data-revision-round]')).toHaveCount(0);
  expect(recorder.revise).toHaveLength(1);
});

test('a failed run marks its strategy and not «Applica»', async ({ page }) => {
  await plant('failed');
  await openReport(page);
  // The strategy's proposal stands in for the report's: its tiles are the model's too.
  await expect(page.getByRole('region', { name: 'La strategia' })).toHaveAttribute('data-generated', '');
  await expect(page.getByRole('region', { name: 'Allocazione proposta' })).toHaveAttribute('data-generated', '');
  await expect(page.getByRole('region', { name: 'Obiettivi' })).toHaveAttribute('data-generated', '');
  await expect(page.getByRole('region', { name: 'Applica' })).not.toHaveAttribute('data-generated');
  await expect(page.getByRole('region', { name: 'Chiedi una modifica' })).toHaveCount(0);
  await expect(page.locator('[data-generated]')).toHaveCount(3);
});

test('a run still going shows its stage rows with the typical duration and no clock', async ({ page }) => {
  await plant('running');
  await openReport(page);
  const stages = page.getByRole('region', { name: 'Le fasi' });
  await expect(stages).toHaveAttribute('data-generated', '');
  const active = stages.locator('li[data-state="active"]');
  await expect(active).toHaveCount(1);
  await expect(active).toContainText('Cerco gli strumenti');
  await expect(active).toContainText('di solito ~2 min');
  await expect(active).not.toContainText(/\d+:\d\d/);
});

test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a ready report neither cascades nor counts', async ({ page }) => {
    await plant('ready');
    await openReport(page);
    await expect(page.locator('[data-proposed-pct]').first()).toHaveText('70,0%');
    await page.waitForTimeout(800);
    const probe = await readProbe(page);
    expect(probe.minOpacity).toBe(1);
    expect(probe.pcts).toEqual(['70,0%']);
  });
});
