/**
 * The Consulente's path as a reducer (lib/utils/allocationAdviceDraft.ts): the screens in
 * order, the goals screen one goal per sub-screen then «cosa manca», the blocks that keep a
 * screen from advancing, the draft on the browser, the prefill from the account.
 */

import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import {
  allocationAdviceDraftReducer,
  describeStepBlock,
  draftStorageKey,
  initialAnswers,
  initialDraft,
  readStoredDraft,
  reconcileDraftGoals,
  removedGoalIds,
  reopenStoredDraft,
  stepOf,
  writeStoredDraft,
  type AllocationAdviceDraft,
} from '@/lib/utils/allocationAdviceDraft';
import type { AllocationAdviceDocument, AllocationAdviceInterview, AllocationAdviceInterviewRound } from '@/types/allocationAdvice';

function draftWithGoals(count: number): AllocationAdviceDraft {
  const answers = initialAnswers(null, null, []);
  answers.age = 35;
  answers.horizonYears = 20;
  answers.goals = Array.from({ length: count }, (_, index) => ({
    goalId: `g${index}`,
    name: `Obiettivo ${index}`,
    targetAmount: null,
    targetDateIso: null,
    priority: 'media' as const,
    keep: true,
    note: '',
  }));
  return initialDraft(answers);
}

function advance(draft: AllocationAdviceDraft, times: number): AllocationAdviceDraft {
  let next = draft;
  for (let i = 0; i < times; i += 1) next = allocationAdviceDraftReducer(next, { type: 'next' });
  return next;
}

describe('allocationAdviceDraftReducer', () => {
  it('walks the screens in order and stops on the last', () => {
    const draft = draftWithGoals(0);
    expect(stepOf(draft)).toBe('profilo');
    expect(stepOf(advance(draft, 4))).toBe('obiettivi');
    const last = advance(draft, 20);
    expect(stepOf(last)).toBe('riepilogo');
    expect(allocationAdviceDraftReducer(last, { type: 'next' })).toBe(last);
  });

  it('on the goals screen walks one goal per sub-screen, then «cosa manca», then leaves', () => {
    const atGoals = advance(draftWithGoals(2), 4);
    expect(atGoals.goalIndex).toBe(0);
    const second = allocationAdviceDraftReducer(atGoals, { type: 'next' });
    expect(second.goalIndex).toBe(1);
    expect(stepOf(second)).toBe('obiettivi');
    const missing = allocationAdviceDraftReducer(second, { type: 'next' });
    expect(missing.goalIndex).toBe(2);
    expect(stepOf(missing)).toBe('obiettivi');
    const out = allocationAdviceDraftReducer(missing, { type: 'next' });
    expect(stepOf(out)).toBe('ruoli');
  });

  it('going back into the goals screen lands on «cosa manca», the sub-screen just left', () => {
    const atRoles = advance(draftWithGoals(2), 7);
    expect(stepOf(atRoles)).toBe('ruoli');
    const back = allocationAdviceDraftReducer(atRoles, { type: 'back' });
    expect(stepOf(back)).toBe('obiettivi');
    expect(back.goalIndex).toBe(2);
    expect(allocationAdviceDraftReducer(back, { type: 'back' }).goalIndex).toBe(1);
  });

  it('adds a goal and opens its screen; removing it goes back to «cosa manca»', () => {
    const missing = advance(draftWithGoals(1), 5);
    expect(missing.goalIndex).toBe(1);
    const added = allocationAdviceDraftReducer(missing, { type: 'addGoal' });
    expect(added.answers.goals).toHaveLength(2);
    expect(added.goalIndex).toBe(1);
    expect(added.answers.goals[1]).toMatchObject({ goalId: null, name: '', keep: true });
    const named = allocationAdviceDraftReducer(added, { type: 'updateGoal', index: 1, patch: { name: 'Auto' } });
    expect(named.answers.goals[1].name).toBe('Auto');
    const removed = allocationAdviceDraftReducer(named, { type: 'removeGoal', index: 1 });
    expect(removed.answers.goals).toHaveLength(1);
    expect(removed.goalIndex).toBe(1);
  });

  it('patches the answers and jumps to a screen from the summary', () => {
    const draft = draftWithGoals(0);
    const patched = allocationAdviceDraftReducer(draft, { type: 'patch', patch: { broker: 'Broker X' } });
    expect(patched.answers.broker).toBe('Broker X');
    expect(stepOf(allocationAdviceDraftReducer(patched, { type: 'goto', step: 6 }))).toBe('vincoli');
    expect(stepOf(allocationAdviceDraftReducer(patched, { type: 'goto', step: 99 }))).toBe('riepilogo');
  });
});

describe('describeStepBlock', () => {
  it('asks for the age and the horizon on the first screen, and a name for a new goal', () => {
    const draft = initialDraft(initialAnswers(null, null, []));
    expect(describeStepBlock(draft)).toMatch(/età/);
    const withAge = allocationAdviceDraftReducer(draft, { type: 'patch', patch: { age: 40 } });
    expect(describeStepBlock(withAge)).toMatch(/anni investi/);
    const ready = allocationAdviceDraftReducer(withAge, { type: 'patch', patch: { horizonYears: 10 } });
    expect(describeStepBlock(ready)).toBeNull();

    const atGoals = allocationAdviceDraftReducer(advance(ready, 4), { type: 'addGoal' });
    expect(describeStepBlock(atGoals)).toMatch(/nome/);
  });
});

describe('initialAnswers and removedGoalIds', () => {
  it('prefills the age, the goals and the roles the assets carry today', () => {
    const assets = [
      { id: 'h', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 1, isPrimaryResidence: true, allocationRole: 'frozen' },
      { id: 'p', name: 'Fondo', type: 'pensionFund', assetClass: 'equity', quantity: 1, currentPrice: 1, allocationRole: 'excluded' },
    ] as unknown as Asset[];
    const answers = initialAnswers(
      { userAge: 41, targets: {} },
      { goals: [{ id: 'g1', name: 'Casa', priority: 'alta', color: '#000', createdAt: new Date(), updatedAt: new Date(), targetAmount: 50000 }], assignments: [] },
      assets
    );
    expect(answers.age).toBe(41);
    expect(answers.goals).toEqual([{ goalId: 'g1', name: 'Casa', targetAmount: 50000, targetDateIso: null, priority: 'alta', keep: true, note: '' }]);
    expect(answers.homeRole).toBe('frozen');
    expect(answers.pensionRole).toBe('excluded');
    expect(answers.privateEquityRole).toBe('frozen');
  });

  it('lists the existing goals marked «da eliminare», never a new one', () => {
    const answers = initialAnswers(null, null, []);
    answers.goals = [
      { goalId: 'g1', name: 'A', targetAmount: null, targetDateIso: null, priority: 'media', keep: false, note: '' },
      { goalId: null, name: 'B', targetAmount: null, targetDateIso: null, priority: 'media', keep: false, note: '' },
      { goalId: 'g3', name: 'C', targetAmount: null, targetDateIso: null, priority: 'media', keep: true, note: '' },
    ];
    expect(removedGoalIds(answers)).toEqual(['g1']);
  });
});

describe('the stored draft', () => {
  function memoryStorage(): Storage & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
      store,
      length: 0,
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: () => null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, value),
    };
  }

  it('round-trips the draft under the owner\'s key and ignores a stored shape it does not know', () => {
    const storage = memoryStorage();
    const draft = advance(draftWithGoals(1), 2);
    writeStoredDraft(storage, 'u1', draft);
    expect(storage.store.has(draftStorageKey('u1'))).toBe(true);
    expect(readStoredDraft(storage, 'u1')).toEqual(draft);
    expect(readStoredDraft(storage, 'u2')).toBeNull();
    storage.setItem(draftStorageKey('u3'), '{"nope": true}');
    expect(readStoredDraft(storage, 'u3')).toBeNull();
    storage.setItem(draftStorageKey('u4'), 'not json');
    expect(readStoredDraft(storage, 'u4')).toBeNull();
  });

  it('survives a storage that is absent or throws', () => {
    expect(readStoredDraft(null, 'u1')).toBeNull();
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readStoredDraft(throwing, 'u1')).toBeNull();
    expect(() => writeStoredDraft(throwing, 'u1', draftWithGoals(0))).not.toThrow();
  });
});

describe('reconcileDraftGoals (2026-10-20)', () => {
  const GOAL_DATA: GoalBasedInvestingData = {
    goals: [
      { id: 'g0', name: 'Obiettivo 0', priority: 'media', color: '#000', createdAt: new Date(2025, 0, 1), updatedAt: new Date(2025, 0, 1) },
      { id: 'g-new', name: 'Casa', priority: 'alta', color: '#111', targetAmount: 50000, targetDate: '2031-06-01', createdAt: new Date(2025, 0, 1), updatedAt: new Date(2025, 0, 1) },
    ],
    assignments: [],
  };

  it('adds the goals FIRE has and the draft does not, after the ones the draft keeps', () => {
    const draft = draftWithGoals(1);
    const next = reconcileDraftGoals(draft, GOAL_DATA);
    expect(next.answers.goals.map((goal) => goal.goalId)).toEqual(['g0', 'g-new']);
    expect(next.answers.goals[1]).toMatchObject({ name: 'Casa', targetAmount: 50000, targetDateIso: '2031-06-01', priority: 'alta', keep: true });
  });

  it('keeps what the user typed on a goal it already had, keeps a goal typed as new, drops a deleted one, clamps the index', () => {
    const draft = draftWithGoals(2);
    draft.answers.goals[0] = { ...draft.answers.goals[0], name: 'Rinominato', keep: false, note: 'da togliere' };
    draft.answers.goals.push({ goalId: null, name: 'Auto', targetAmount: null, targetDateIso: null, priority: 'bassa', keep: true, note: '' });
    draft.goalIndex = 3;
    const next = reconcileDraftGoals(draft, GOAL_DATA);
    expect(next.answers.goals.map((goal) => [goal.goalId, goal.name])).toEqual([['g0', 'Rinominato'], [null, 'Auto'], ['g-new', 'Casa']]);
    expect(next.answers.goals[0]).toMatchObject({ keep: false, note: 'da togliere' });
    expect(next.goalIndex).toBe(3);
  });

  it('returns the same draft when nothing moved, and strips every goal when the document is gone', () => {
    const draft = draftWithGoals(2);
    const same = { goals: draft.answers.goals.map((goal) => ({ id: goal.goalId as string, name: goal.name, priority: goal.priority, color: '#000', createdAt: new Date(), updatedAt: new Date() })), assignments: [] };
    expect(reconcileDraftGoals(draft, same)).toBe(draft);
    expect(reconcileDraftGoals(draft, null).answers.goals).toEqual([]);
  });
});

// ── The interview in the draft (2026-11-08, criteria 7 and 8 of AI-04) ──────────────────
const ROUND: AllocationAdviceInterviewRound = {
  note: 'Vedo un reddito concentrato.',
  satisfied: false,
  questions: [{ id: 'reddito', kind: 'single', text: 'Quanto dipendi dal reddito?', why: "l'86% delle entrate", options: [{ value: 'tutto', label: 'Interamente' }, { value: 'meta', label: 'Metà' }], allowOther: true }],
  answers: [{ questionId: 'reddito', value: 'tutto' }],
  model: 'opus-finto',
  askedAt: new Date('2026-11-08T12:00:00'),
};
const TWO: AllocationAdviceInterview = { rounds: [ROUND, { ...ROUND, note: 'Resta la riserva.', answers: [], askedAt: new Date('2026-11-08T12:05:00') }], skipped: false };

function memoryStore(): Storage {
  const store = new Map<string, string>();
  return { length: 0, clear: () => store.clear(), getItem: (key: string) => store.get(key) ?? null, key: () => null, removeItem: (key: string) => void store.delete(key), setItem: (key: string, value: string) => void store.set(key, value) };
}

function failedDocument(updatedAt: Date): AllocationAdviceDocument {
  const answers = initialAnswers(null, null, []);
  return { userId: 'u1', status: 'failed', answers, stage: 'strategy', createdAt: updatedAt, updatedAt, startedAt: updatedAt, strategy: null, instruments: null, report: null, error: 'x', applied: null, interview: null };
}

describe('the draft reducer and the interview', () => {
  it('«phase: interview» opens the scene with an interview whose rounds are kept and skipped cleared; «phase: path» goes back', () => {
    const summary = advance(draftWithGoals(0), 20);
    expect(summary.phase).toBe('path');
    expect(summary.interview).toBeUndefined();
    const opened = allocationAdviceDraftReducer(summary, { type: 'phase', phase: 'interview' });
    expect(opened).toMatchObject({ phase: 'interview', interview: { rounds: [], skipped: false } });
    const withRounds = allocationAdviceDraftReducer({ ...summary, interview: { ...TWO, skipped: true } }, { type: 'phase', phase: 'interview' });
    expect(withRounds.interview).toEqual({ rounds: TWO.rounds, skipped: false });
    const back = allocationAdviceDraftReducer(withRounds, { type: 'phase', phase: 'path' });
    expect(back.phase).toBe('path');
    expect(back.interview).toEqual(withRounds.interview);
  });

  it('«interview» delegates to the interview reducer, from an empty interview when there is none', () => {
    const summary = advance(draftWithGoals(0), 20);
    const received = allocationAdviceDraftReducer(summary, { type: 'interview', action: { type: 'roundReceived', round: ROUND } });
    expect(received.interview?.rounds[0].answers).toEqual([]);
    const answered = allocationAdviceDraftReducer(received, { type: 'interview', action: { type: 'answer', questionId: 'reddito', value: 'meta' } });
    expect(answered.interview?.rounds[0].answers).toEqual([{ questionId: 'reddito', value: 'meta' }]);
    expect(allocationAdviceDraftReducer(answered, { type: 'interview', action: { type: 'reset' } }).interview).toEqual({ rounds: [], skipped: false });
  });
});

describe('the stored draft keeps the interview (criterion 7)', () => {
  it('round-trips a draft with two rounds, askedAt back as a Date', () => {
    const storage = memoryStore();
    const draft: AllocationAdviceDraft = { ...advance(draftWithGoals(0), 20), phase: 'interview', interview: TWO };
    writeStoredDraft(storage, 'u1', draft);
    const read = readStoredDraft(storage, 'u1');
    expect(read).toEqual(draft);
    expect(read?.interview?.rounds[1].askedAt).toBeInstanceOf(Date);
  });

  it('drops a malformed interview and keeps the answers, and reads a draft stored before AI-04 as path with no interview', () => {
    const storage = memoryStore();
    const draft = advance(draftWithGoals(1), 2);
    storage.setItem(draftStorageKey('u1'), JSON.stringify({ ...draft, phase: 'interview', interview: { rounds: 'no', skipped: false } }));
    const read = readStoredDraft(storage, 'u1');
    expect(read?.answers).toEqual(draft.answers);
    expect(read?.interview).toBeUndefined();
    expect(read?.phase).toBe('path');
    storage.setItem(draftStorageKey('u2'), JSON.stringify({ step: draft.step, goalIndex: draft.goalIndex, answers: draft.answers }));
    expect(readStoredDraft(storage, 'u2')).toEqual({ ...draft, phase: 'path' });
    // The scene phase needs a round: with none it is the summary.
    storage.setItem(draftStorageKey('u3'), JSON.stringify({ ...draft, phase: 'interview', interview: { rounds: [], skipped: false } }));
    expect(readStoredDraft(storage, 'u3')).toMatchObject({ phase: 'path', interview: { rounds: [], skipped: false } });
  });
});

describe('reopenStoredDraft (criterion 8)', () => {
  const draft: AllocationAdviceDraft = { ...advance(draftWithGoals(0), 20), phase: 'interview', interview: TWO };

  it('drops an interview older than the last document and sets the phase back; keeps one asked after it', () => {
    const dropped = reopenStoredDraft(draft, failedDocument(new Date('2026-11-08T13:00:00')));
    expect(dropped?.interview).toBeUndefined();
    expect(dropped?.phase).toBe('path');
    expect(dropped?.answers).toEqual(draft.answers);
    expect(reopenStoredDraft(draft, failedDocument(new Date('2026-11-08T12:01:00')))).toEqual(draft);
  });

  it('keeps the draft with no document, drops an interview with zero rounds, and passes null through', () => {
    expect(reopenStoredDraft(draft, null)).toEqual(draft);
    const empty: AllocationAdviceDraft = { ...draft, interview: { rounds: [], skipped: false } };
    expect(reopenStoredDraft(empty, null)).toEqual({ ...advance(draftWithGoals(0), 20), phase: 'path' });
    expect(reopenStoredDraft(null, failedDocument(new Date()))).toBeNull();
    const plain = advance(draftWithGoals(0), 3);
    expect(reopenStoredDraft(plain, failedDocument(new Date()))).toBe(plain);
  });
});
