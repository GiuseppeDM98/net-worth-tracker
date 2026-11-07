/**
 * Allocazione › Consulente, the REPORT at 1440px (AI-03, 2026-11-07): every tile the model wrote
 * wears the accent and «Applica» / «Chiedi una modifica» do not; the column cascades in once per
 * JS session and the proposed percentages count up with it; a failed run marks its strategy; a run
 * still going shows its stage rows with the typical duration and no clock; reduced motion plays
 * nothing.
 *
 * Each test plants its own document in `allocationAdvice/test-user-1` through firebase-admin on the
 * emulator (two classes at 70 and 30, the goal «Fondo fenicottero» on «ETF ornitorinco»); `afterAll`
 * puts back what the account held, or deletes the document when it held none. No run is started.
 */

import { test, expect, type Page } from '@playwright/test';

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
    candidates: { sleeves: [{ assetClass: 'equity', subTarget: 'Azioni mondo', candidates: [{ name: 'ETF ornitorinco', exchange: 'Borsa Italiana', note: 'Finto.' }] }] },
    model: 'sonnet-finto',
    webSearchUsed: true,
    finishedAt: now,
  };
  const report = { markdown: '# Report finto\n\nIl report del Consulente, finto.', proposal, model: 'opus-finto', finishedAt: now };
  const base = { answers, createdAt: now, updatedAt: now, startedAt: now, applied: null, revisions: [] };
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
