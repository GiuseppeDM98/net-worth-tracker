/**
 * The interview as the client holds it (2026-11-08, doc/guide/consulente.md § The path): the rounds the
 * Consulente asked, each with the answers given so far, and whether the user skipped. Pure: the
 * reducer the draft delegates to, the gate of the next round, the sentence that blocks the
 * primary. The singular/plural rule of «tornata» (`describeRoundCount`) lives in the narrative,
 * which the Allocazione page already loads: this module reaches zod through `questionSet`, and
 * must not enter that page's first load.
 *
 * A received round enters `rounds` at once with `answers: []`, and every answer is written into
 * that last round in place — there is no separate current round — so the Wizard's existing draft
 * effect persists it, and a reload shows the round without a request (2026-11-08).
 */

import { ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS, type AllocationAdviceInterview, type AllocationAdviceInterviewRound } from '@/types/allocationAdvice';
import { describeAnswer, answerOf, type QuestionAnswerValue } from '@/lib/utils/questionSet';

export const EMPTY_INTERVIEW: AllocationAdviceInterview = { rounds: [], skipped: false };

export type InterviewAction =
  | { type: 'roundReceived'; round: AllocationAdviceInterviewRound }
  | { type: 'answer'; questionId: string; value: QuestionAnswerValue | null }
  | { type: 'skip' }
  | { type: 'reset' };

/**
 * `roundReceived` appends with `answers: []`; `answer` writes into the LAST round only, replacing
 * that question's entry — `null` or `[]` removes it (an empty list is no answer); `skip` sets
 * `skipped` and keeps the rounds as they stand; `reset` returns `EMPTY_INTERVIEW`.
 */
export function interviewReducer(interview: AllocationAdviceInterview, action: InterviewAction): AllocationAdviceInterview {
  switch (action.type) {
    case 'roundReceived':
      return { ...interview, rounds: [...interview.rounds, { ...action.round, answers: [] }] };
    case 'answer': {
      const last = interview.rounds[interview.rounds.length - 1];
      if (!last) return interview;
      const others = last.answers.filter((answer) => answer.questionId !== action.questionId);
      const removes = action.value === null || (Array.isArray(action.value) && action.value.length === 0);
      const answers = removes ? others : [...others, { questionId: action.questionId, value: action.value as QuestionAnswerValue }];
      return { ...interview, rounds: [...interview.rounds.slice(0, -1), { ...last, answers }] };
    }
    case 'skip':
      return { ...interview, skipped: true };
    case 'reset':
      return EMPTY_INTERVIEW;
  }
}

/** Criterion 3: a next round can be asked — not skipped, and the last round (if any) left something open under the cap. */
export function canRequestRound(interview: AllocationAdviceInterview): boolean {
  if (interview.skipped) return false;
  const last = interview.rounds[interview.rounds.length - 1];
  if (!last) return true;
  return interview.rounds.length < ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS && !last.satisfied && last.questions.length > 0;
}

/** The sentence that blocks the primary: the first question of the last round without an answer (a blank «Altro…» included), else null. */
export function describeInterviewBlock(interview: AllocationAdviceInterview): string | null {
  const last = interview.rounds[interview.rounds.length - 1];
  if (!last) return null;
  for (const question of last.questions) {
    const answer = answerOf(last.answers, question.id);
    if (answer === null || describeAnswer(question, answer) === null) {
      return `Rispondi a «${question.text}», o scegli «Preferisco non dire».`;
    }
  }
  return null;
}

/** The round the scene shows or asks, 1-based (the rail's `reached`, the eyebrow's N): the next one while asking, the last one otherwise, never below 1. */
export function currentRoundNumber(interview: AllocationAdviceInterview, asking: boolean): number {
  return asking ? interview.rounds.length + 1 : Math.max(1, interview.rounds.length);
}
