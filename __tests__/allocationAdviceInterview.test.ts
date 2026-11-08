/**
 * The interview as the client holds it (lib/utils/allocationAdviceInterview.ts, 2026-11-08): the
 * reducer that writes every answer into the LAST round, the gate of the next round (the cap of
 * three rounds), the sentence that blocks the primary; the one singular/plural rule of «tornata» read
 * from the narrative, where it lives.
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_INTERVIEW,
  canRequestRound,
  currentRoundNumber,
  describeInterviewBlock,
  interviewReducer,
} from '@/lib/utils/allocationAdviceInterview';
import { describeRoundCount } from '@/lib/utils/allocationAdviceNarrative';
import { QUESTION_DECLINE_VALUE, type Question } from '@/lib/utils/questionSet';
import type { AllocationAdviceInterview, AllocationAdviceInterviewRound } from '@/types/allocationAdvice';

const Q1: Question = { id: 'reddito', kind: 'single', text: 'Quanto dipendi dal reddito?', why: "l'86% delle entrate", options: [{ value: 'tutto', label: 'Interamente' }, { value: 'meta', label: 'Metà' }], allowOther: true };
const Q2: Question = { id: 'riserva', kind: 'multiple', text: 'Cosa copre la riserva?', why: '2 mesi', options: [{ value: 'conti', label: 'Conti' }, { value: 'btp', label: 'BTP' }], allowOther: true };

const round = (overrides: Partial<AllocationAdviceInterviewRound> = {}): AllocationAdviceInterviewRound => ({
  note: 'Vedo un reddito concentrato.',
  satisfied: false,
  questions: [Q1, Q2],
  answers: [],
  model: 'opus-finto',
  askedAt: new Date('2026-11-08T12:00:00'),
  ...overrides,
});

const withRounds = (count: number, last: Partial<AllocationAdviceInterviewRound> = {}): AllocationAdviceInterview => ({
  rounds: Array.from({ length: count }, (_, index) => round(index === count - 1 ? last : {})),
  skipped: false,
});

describe('interviewReducer', () => {
  it('appends a received round with no answers', () => {
    const next = interviewReducer(EMPTY_INTERVIEW, { type: 'roundReceived', round: { ...round(), answers: [{ questionId: 'reddito', value: 'tutto' }] } });
    expect(next.rounds).toHaveLength(1);
    expect(next.rounds[0].answers).toEqual([]);
    expect(next.skipped).toBe(false);
  });

  it('writes an answer into the LAST round only, replacing that question\'s entry', () => {
    const two = withRounds(2);
    const answered = interviewReducer(two, { type: 'answer', questionId: 'reddito', value: 'tutto' });
    expect(answered.rounds[0].answers).toEqual([]);
    expect(answered.rounds[1].answers).toEqual([{ questionId: 'reddito', value: 'tutto' }]);
    const replaced = interviewReducer(answered, { type: 'answer', questionId: 'reddito', value: { other: 'fenicottero' } });
    expect(replaced.rounds[1].answers).toEqual([{ questionId: 'reddito', value: { other: 'fenicottero' } }]);
    const both = interviewReducer(replaced, { type: 'answer', questionId: 'riserva', value: ['conti'] });
    expect(both.rounds[1].answers.map((answer) => answer.questionId)).toEqual(['reddito', 'riserva']);
  });

  it('removes the entry on null or an empty list, and ignores an answer with no round', () => {
    const one = interviewReducer(withRounds(1), { type: 'answer', questionId: 'reddito', value: 'tutto' });
    expect(interviewReducer(one, { type: 'answer', questionId: 'reddito', value: null }).rounds[0].answers).toEqual([]);
    expect(interviewReducer(one, { type: 'answer', questionId: 'reddito', value: [] }).rounds[0].answers).toEqual([]);
    expect(interviewReducer(EMPTY_INTERVIEW, { type: 'answer', questionId: 'reddito', value: 'tutto' })).toBe(EMPTY_INTERVIEW);
  });

  it('skip keeps the rounds as they stand; reset returns the empty interview', () => {
    const one = interviewReducer(withRounds(1), { type: 'answer', questionId: 'reddito', value: 'tutto' });
    const skipped = interviewReducer(one, { type: 'skip' });
    expect(skipped.skipped).toBe(true);
    expect(skipped.rounds).toEqual(one.rounds);
    expect(interviewReducer(skipped, { type: 'reset' })).toBe(EMPTY_INTERVIEW);
  });
});

describe('canRequestRound (the cap of three rounds, 2026-11-08)', () => {
  it('is true with no round and while the last round left something open under the cap', () => {
    expect(canRequestRound(EMPTY_INTERVIEW)).toBe(true);
    expect(canRequestRound(withRounds(1))).toBe(true);
    expect(canRequestRound(withRounds(2))).toBe(true);
  });

  it('is false at three rounds, when the last is satisfied, has no questions, or the user skipped', () => {
    expect(canRequestRound(withRounds(3))).toBe(false);
    expect(canRequestRound(withRounds(1, { satisfied: true }))).toBe(false);
    expect(canRequestRound(withRounds(1, { questions: [] }))).toBe(false);
    expect(canRequestRound({ ...withRounds(1), skipped: true })).toBe(false);
    expect(canRequestRound({ rounds: [], skipped: true })).toBe(false);
  });
});

describe('describeInterviewBlock', () => {
  it('names the first unanswered question of the last round, a blank «Altro…» included', () => {
    const half = interviewReducer(withRounds(1), { type: 'answer', questionId: 'reddito', value: 'tutto' });
    expect(describeInterviewBlock(half)).toBe('Rispondi a «Cosa copre la riserva?», o scegli «Preferisco non dire».');
    const blank = interviewReducer(half, { type: 'answer', questionId: 'riserva', value: { other: '' } });
    expect(describeInterviewBlock(blank)).toBe('Rispondi a «Cosa copre la riserva?», o scegli «Preferisco non dire».');
    expect(describeInterviewBlock(withRounds(1))).toBe('Rispondi a «Quanto dipendi dal reddito?», o scegli «Preferisco non dire».');
  });

  it('passes a decline, a typed «Altro…», a full round, no round and a round without questions', () => {
    const declined = interviewReducer(interviewReducer(withRounds(1), { type: 'answer', questionId: 'reddito', value: QUESTION_DECLINE_VALUE }), { type: 'answer', questionId: 'riserva', value: { other: 'fenicottero' } });
    expect(describeInterviewBlock(declined)).toBeNull();
    expect(describeInterviewBlock(EMPTY_INTERVIEW)).toBeNull();
    expect(describeInterviewBlock(withRounds(1, { questions: [] }))).toBeNull();
  });
});

describe('describeRoundCount and currentRoundNumber', () => {
  it('writes «1 tornata» and «N tornate»', () => {
    expect(describeRoundCount(1)).toBe('1 tornata');
    expect(describeRoundCount(2)).toBe('2 tornate');
    expect(describeRoundCount(3)).toBe('3 tornate');
  });

  it('is the next round while asking, the last one otherwise, never below 1', () => {
    expect(currentRoundNumber(EMPTY_INTERVIEW, true)).toBe(1);
    expect(currentRoundNumber(EMPTY_INTERVIEW, false)).toBe(1);
    expect(currentRoundNumber(withRounds(1), true)).toBe(2);
    expect(currentRoundNumber(withRounds(2), false)).toBe(2);
  });
});
