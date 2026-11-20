/**
 * The Consulente's document mapper (lib/utils/allocationAdviceDocument.ts): the dates of every
 * stage converted, the absent parts null, the revisions («Chiedi una modifica», 2026-10-20)
 * always an array.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRunStale, mapAllocationAdviceData, pageShowsReport, priorPlanOf, RUN_STALE_AFTER_MS, runStageStates, stageOfRunStage } from '@/lib/utils/allocationAdviceDocument';

const AT = new Date('2026-10-20T10:00:00.000Z');

describe('mapAllocationAdviceData', () => {
  it('maps a running document with nothing landed yet, revisions included', () => {
    const document = mapAllocationAdviceData('u1', { status: 'running', answers: { age: 35 }, stage: 'strategy', createdAt: AT, updatedAt: AT, startedAt: AT });
    expect(document).toMatchObject({ userId: 'u1', status: 'running', stage: 'strategy', strategy: null, instruments: null, report: null, error: null, applied: null, revisions: [] });
    expect(document.startedAt).toEqual(AT);
  });

  it('converts the dates of every stage, of the application and of each revision', () => {
    const document = mapAllocationAdviceData('u1', {
      status: 'applied',
      answers: {},
      stage: 'review',
      createdAt: AT,
      updatedAt: AT,
      startedAt: null,
      strategy: { markdown: 's', proposal: null, model: 'o', finishedAt: AT },
      instruments: { markdown: 'i', candidates: null, model: 's', webSearchUsed: true, finishedAt: AT },
      report: { markdown: 'r', proposal: null, model: 'o', finishedAt: AT },
      applied: { at: AT, targetsWritten: true, rolesChanged: 0, goalsWritten: 1 },
      revisions: [{ request: 'meno cripto', at: AT }],
    });
    expect(document.strategy?.finishedAt).toEqual(AT);
    expect(document.instruments?.webSearchUsed).toBe(true);
    expect(document.applied).toEqual({ at: AT, targetsWritten: true, rolesChanged: 0, goalsWritten: 1 });
    expect(document.revisions).toEqual([{ request: 'meno cripto', at: AT }]);
    expect(document.startedAt).toBeNull();
  });
});

describe('priorPlanOf', () => {
  it('is null without a finished report, and the report with its requests, dates and review otherwise', () => {
    const running = mapAllocationAdviceData('u1', { status: 'running', answers: {}, stage: 'strategy', createdAt: AT, updatedAt: AT, startedAt: AT });
    expect(priorPlanOf(running)).toBeNull();
    expect(priorPlanOf(null)).toBeNull();

    const ready = mapAllocationAdviceData('u1', {
      status: 'ready',
      answers: {},
      stage: 'review',
      createdAt: AT,
      updatedAt: AT,
      report: { markdown: 'r', proposal: { reviewByIso: '2028-01-15', reviewReason: 'perché' }, model: 'o', finishedAt: AT },
      revisions: [{ request: 'meno cripto', at: AT }],
    });
    expect(priorPlanOf(ready)).toEqual({ reportMarkdown: 'r', revisions: ['meno cripto'], finishedAt: AT, appliedAt: null, reviewByIso: '2028-01-15', reviewReason: 'perché' });
  });
});

describe('pageShowsReport (2026-10-20)', () => {
  const doc = (status: string, startedAt: Date | null = AT) =>
    mapAllocationAdviceData('u1', { status, answers: {}, stage: 'strategy', createdAt: AT, updatedAt: AT, startedAt });
  const now = AT.getTime() + 60_000;

  it('shows a ready, applied, failed or fresh running document, never while a run of this page is going or failed', () => {
    for (const status of ['ready', 'applied', 'failed', 'running']) {
      expect(pageShowsReport({ document: doc(status), redoAt: null, openedAt: now, runActive: false })).toBe(true);
      expect(pageShowsReport({ document: doc(status), redoAt: null, openedAt: now, runActive: true })).toBe(false);
    }
    expect(pageShowsReport({ document: null, redoAt: null, openedAt: now, runActive: false })).toBe(false);
  });

  it('treats a running document older than the stale window, or without a start, as no report', () => {
    expect(pageShowsReport({ document: doc('running'), redoAt: null, openedAt: AT.getTime() + RUN_STALE_AFTER_MS + 1, runActive: false })).toBe(false);
    expect(pageShowsReport({ document: doc('running', null), redoAt: null, openedAt: now, runActive: false })).toBe(false);
    expect(isRunStale(doc('ready'), AT.getTime() + RUN_STALE_AFTER_MS + 1)).toBe(false);
  });

  it('hides the document «Rifai il percorso» was pressed on, and shows a newer one', () => {
    expect(pageShowsReport({ document: doc('ready'), redoAt: AT.getTime(), openedAt: now, runActive: false })).toBe(false);
    expect(pageShowsReport({ document: doc('ready'), redoAt: AT.getTime() - 1, openedAt: now, runActive: false })).toBe(true);
  });
});

describe('the run’s stage rows (2026-11-07)', () => {
  it('reads revise as the review', () => {
    expect(stageOfRunStage('revise')).toBe('review');
    expect(stageOfRunStage('instruments')).toBe('instruments');
  });

  it('lights the stage, marks the ones before it done and the rest pending', () => {
    const states = (rows: ReturnType<typeof runStageStates>) => rows.map((row) => row.state);
    expect(runStageStates({ status: 'running', stage: null })).toEqual([
      { stage: 'context', state: 'pending' },
      { stage: 'strategy', state: 'pending' },
      { stage: 'instruments', state: 'pending' },
      { stage: 'review', state: 'pending' },
      { stage: 'plan', state: 'pending' },
    ]);
    expect(states(runStageStates({ status: 'running', stage: 'instruments' }))).toEqual(['done', 'done', 'active', 'pending', 'pending']);
    expect(states(runStageStates({ status: 'failed', stage: 'strategy' }))).toEqual(['done', 'failed', 'pending', 'pending', 'pending']);
    expect(states(runStageStates({ status: 'failed', stage: 'review' }))).toEqual(['done', 'done', 'done', 'failed', 'pending']);
    expect(states(runStageStates({ status: 'running', stage: 'plan' }))).toEqual(['done', 'done', 'done', 'done', 'active']);
    expect(states(runStageStates({ status: 'done', stage: null }))).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
});

describe('the interview on the document (2026-11-08: null when absent)', () => {
  const round = { note: 'n', satisfied: false, questions: [], answers: [], model: 'opus-finto', askedAt: { toDate: () => AT } };

  it('maps interview and revisionInterview, each round\'s askedAt through toDate', () => {
    const document = mapAllocationAdviceData('u1', {
      status: 'ready',
      answers: {},
      stage: 'review',
      createdAt: AT,
      updatedAt: AT,
      interview: { rounds: [round, { ...round, askedAt: AT }], skipped: true },
      revisionInterview: { rounds: [round], skipped: false },
    });
    expect(document.interview?.rounds.map((r) => r.askedAt)).toEqual([AT, AT]);
    expect(document.interview?.skipped).toBe(true);
    expect(document.interview?.rounds[0]).toMatchObject({ note: 'n', model: 'opus-finto', answers: [] });
    expect(document.revisionInterview).toMatchObject({ skipped: false });
    expect(document.revisionInterview?.rounds[0].askedAt).toEqual(AT);
  });

  it('maps an older document to interview null and revisionInterview null', () => {
    const document = mapAllocationAdviceData('u1', { status: 'ready', answers: {}, stage: 'review', createdAt: AT, updatedAt: AT });
    expect(document.interview).toBeNull();
    expect(document.revisionInterview).toBeNull();
  });
});

// ── «Applica» creates the plan of accumulation (2026-11-20) ─────────────────────────────────
describe('the hand-off is gone, and the Consulente route stays light', () => {
  // U11: the exports of the editor's hand-off are removed.
  it('allocationAdviceDocument no longer exports the hand-off', async () => {
    const exported: Record<string, unknown> = await import('@/lib/utils/allocationAdviceDocument');
    for (const name of ['applyHandoffOf', 'handoffProposalOf', 'CONSULENTE_HANDOFF_HREF']) expect(exported[name], name).toBeUndefined();
    // @ts-expect-error — the type went with the link.
    type Gone = import('@/lib/utils/allocationAdviceDocument').ApplyHandoff;
    expect(true as unknown as Gone).toBe(true);
  });

  // U12. Mutation that turns it red: a static import of '@/lib/utils/advicePlan' in ConsulenteReport.tsx.
  it('only ConsulentePlanTick imports the plan\'s builder and utils; the executor only through import(); the tick only through lazyComponent()', () => {
    const dir = join(process.cwd(), 'components/allocation/consulente');
    const sources = readdirSync(dir).filter((name) => name.endsWith('.tsx'));
    expect(sources).toContain('ConsulentePlanTick.tsx');
    const heavy = /@\/lib\/utils\/(advicePlan|accumulationPlanUtils|accumulationNarrative|operatingPlanFacts|operatingPlanSchema|allocationAdviceHandoff|weightOptimizer)['"]/;
    const staticExecutor = /from\s+['"]@\/lib\/services\/advicePlanService['"]/;
    const tickImport = /(?:import|from)\s*\(?\s*['"]\.\/ConsulentePlanTick['"]/g;
    for (const name of sources) {
      const text = readFileSync(join(dir, name), 'utf8');
      expect(text, name).not.toMatch(staticExecutor);
      if (name === 'ConsulentePlanTick.tsx') continue;
      expect(text, name).not.toMatch(heavy);
      // A type import is erased; any other import of the tick is the lazy one.
      for (const match of text.matchAll(tickImport)) {
        const line = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index));
        expect(/^import type /.test(line) || /lazyComponent\(\(\) => import\('\.\/ConsulentePlanTick'\)/.test(line), `${name}: ${line}`).toBe(true);
      }
    }
  });
});

describe('the operating plan on the document (2026-11-19: null when absent)', () => {
  const AT2 = new Date('2026-11-19T10:00:00.000Z');
  // Mutation: a date left as the stored Timestamp.
  it('maps operatingPlan with its three dates through toDate, and null when the field is absent', () => {
    const stored = { status: 'ready', plan: null, error: null, model: 'opus', startedAt: { toDate: () => AT2 }, finishedAt: { toDate: () => AT2 }, reportFinishedAt: { toDate: () => AT } };
    const document = mapAllocationAdviceData('u1', { status: 'ready', answers: {}, stage: 'review', createdAt: AT, updatedAt: AT, operatingPlan: stored });
    expect(document.operatingPlan).toEqual({ status: 'ready', plan: null, error: null, model: 'opus', startedAt: AT2, finishedAt: AT2, reportFinishedAt: AT });
    const running = mapAllocationAdviceData('u1', { status: 'ready', answers: {}, createdAt: AT, updatedAt: AT, operatingPlan: { ...stored, status: 'running', finishedAt: null } });
    expect(running.operatingPlan?.finishedAt).toBeNull();
    expect(mapAllocationAdviceData('u1', { status: 'ready', answers: {}, createdAt: AT, updatedAt: AT }).operatingPlan).toBeNull();
  });
});
