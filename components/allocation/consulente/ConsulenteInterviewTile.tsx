/**
 * «Il colloquio» on the report (2026-11-08; a page of the book since 2026-11-11): the rounds the
 * Consulente asked before the strategy, each with its note and its questions, and what the user
 * answered — the user's own words recapped, so the page does NOT wear `generated` (DESIGN.md → The
 * AI-Accent Rule). No hooks; nothing with zero rounds or without an interview. The page's aside is
 * `describeInterviewAside`.
 */

import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import type { AllocationAdviceInterview } from '@/types/allocationAdvice';
import { describeInterviewAside, INTERVIEW_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { answerOf, describeAnswer, type Question, type QuestionAnswer } from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';

/** One round's questions with their answers, shared with the recap on «Chiedi una modifica». */
export function InterviewRoundRows({ questions, answers, className }: { questions: Question[]; answers: QuestionAnswer[]; className?: string }) {
  if (questions.length === 0) return <p className={cn('text-[13px] text-muted-foreground', className)}>{INTERVIEW_COPY.noQuestions}</p>;
  return (
    <ul className={cn('divide-y divide-border', className)}>
      {questions.map((question) => {
        const answer = answerOf(answers, question.id);
        const described = answer === null ? null : describeAnswer(question, answer);
        return (
          <li key={question.id} className="py-2">
            <p className="text-[13px] leading-[1.45] text-muted-foreground">{question.text}</p>
            <p className={cn('text-[13px] leading-[1.45]', described === null ? 'text-muted-foreground italic' : 'text-foreground')}>{described ?? INTERVIEW_COPY.unanswered}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** The page «Il colloquio»: every round's sub-eyebrow, note and rows; nothing without an interview or with zero rounds. */
export function InterviewBody({ interview }: { interview: AllocationAdviceInterview | null | undefined }) {
  if (!interview || describeInterviewAside(interview) === null) return null;
  return (
    <div className="mt-3 flex flex-col gap-4">
      {interview.rounds.map((round, index) => (
        <div key={index}>
          <p className={TILE_SUB_EYEBROW_CLASS}>{INTERVIEW_COPY.roundEyebrow(index + 1)}</p>
          <p className="mt-1 text-[13px] leading-[1.5] text-foreground">{round.note}</p>
          <InterviewRoundRows questions={round.questions} answers={round.answers} className="mt-1" />
        </div>
      ))}
    </div>
  );
}
