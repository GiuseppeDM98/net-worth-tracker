/**
 * «Il colloquio» on the report (2026-11-08, decision 53): the rounds the Consulente asked before
 * the strategy, each with its note and its questions, and what the user answered — the user's own
 * words recapped, so the tile does NOT wear `generated` (the third exception of DESIGN.md → The
 * AI-Accent Rule, decision 79). No hooks; nothing with zero rounds or without an interview.
 */

import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import type { AllocationAdviceInterview } from '@/types/allocationAdvice';
import { describeInterviewAside, INTERVIEW_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { answerOf, describeAnswer, type Question, type QuestionAnswer } from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';

/** One round's questions with their answers, shared with the revision tile's recap. */
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

export function ConsulenteInterviewTile({ interview }: { interview: AllocationAdviceInterview | null | undefined }) {
  const aside = describeInterviewAside(interview);
  if (!interview || aside === null) return null;
  return (
    <Tile eyebrow={INTERVIEW_COPY.tileTitle} aside={aside}>
      <div className="mt-3 flex flex-col gap-4">
        {interview.rounds.map((round, index) => (
          <div key={index}>
            <p className={TILE_SUB_EYEBROW_CLASS}>{INTERVIEW_COPY.roundEyebrow(index + 1)}</p>
            <p className="mt-1 text-[13px] leading-[1.5] text-foreground">{round.note}</p>
            <InterviewRoundRows questions={round.questions} answers={round.answers} className="mt-1" />
          </div>
        ))}
      </div>
    </Tile>
  );
}
