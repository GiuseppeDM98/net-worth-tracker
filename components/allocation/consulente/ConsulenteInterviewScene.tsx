'use client';

/**
 * The INTERVIEW as a scene of the Wizard (2026-11-08, doc/guide/consulente.md § The path; DESIGN.md →
 * The Path-Scene Rule): after the summary, inside the path's card, the Consulente's rounds of
 * questions. Top to bottom: the eyebrow «Colloquio · tornata N di 3» (the scene's only
 * `TILE_EYEBROW_CLASS`, decision 57), the last round's `note` as the headline, the round's
 * `QuestionCard`s — or, while a round is asked, the skeleton of two cards under the previous
 * note (decision 56) — and the footer: «Indietro», «Salta il colloquio» (never accented, though it
 * starts the strategy: decision 78) and ONE primary — «Continua» while another round can be asked,
 * «Avvia la ricerca» otherwise, «Riprova» after a failed round — which takes the AI accent on hover
 * and focus only (decision 36) and waits until every question is answered or declined.
 *
 * The Wizard owns the state (the draft's interview, `useConsulenteInterview`) and the slide in
 * and out of this scene; here only what the card shows. A new round replaces the cards inside the
 * same scene, each entering with `cardEnterVariants` (the motion table's «Question card,
 * entering»; under reduced motion the translate is dropped and the card appears).
 */

import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { QuestionCard } from '@/components/ui/question-card';
import { Skeleton } from '@/components/ui/skeleton';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import { ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS, type AllocationAdviceInterview } from '@/types/allocationAdvice';
import { canRequestRound, currentRoundNumber, describeInterviewBlock } from '@/lib/utils/allocationAdviceInterview';
import { INTERVIEW_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { cardEnterVariants } from '@/lib/utils/motionVariants';
import { answerOf, type QuestionAnswerValue } from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';
import type { ConsulenteInterviewState } from './useConsulenteInterview';

const HEADLINE_CLASS = 'text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]';
const BUTTON_CLASS = 'h-11 desktop:h-9';
const PRIMARY_CLASS = cn(BUTTON_CLASS, 'border border-transparent', AI_CONTROL_ACCENT_CLASS);

/** The wait for a round: two question-shaped blocks, `aria-busy`, ONE status line (the skeletons are `aria-hidden`). */
export function InterviewSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" className={cn('flex flex-col gap-4', className)}>
      <p role="status" className="text-[13px] text-muted-foreground">
        {INTERVIEW_COPY.asking}
      </p>
      {[0, 1].map((index) => (
        <div key={index} className="rounded-xl border border-border p-4 desktop:p-5">
          <Skeleton className="h-2.5 w-32" />
          <Skeleton className="mt-3 h-5 w-3/4" />
          <Skeleton className="mt-2 h-3.5 w-1/2" />
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ConsulenteInterviewSceneProps {
  interview: AllocationAdviceInterview;
  round: ConsulenteInterviewState;
  configured: boolean;
  /** The headline the Wizard focuses once the slide has landed. */
  headlineRef: RefObject<HTMLParagraphElement | null>;
  onAnswer: (questionId: string, value: QuestionAnswerValue | null) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onRun: () => void;
  onRetry: () => void;
}

export function ConsulenteInterviewScene({ interview, round, configured, headlineRef, onAnswer, onBack, onSkip, onContinue, onRun, onRetry }: ConsulenteInterviewSceneProps) {
  const asking = round.kind === 'asking';
  const last = interview.rounds[interview.rounds.length - 1] ?? null;
  const roundNumber = currentRoundNumber(interview, asking);
  const block = describeInterviewBlock(interview);
  const headline = last ? last.note : INTERVIEW_COPY.waitingHeadline;
  const status = round.kind === 'failed' ? round.error : block;
  const next = canRequestRound(interview);

  const primary =
    round.kind === 'failed'
      ? { label: INTERVIEW_COPY.retry, onClick: onRetry, disabled: !configured }
      : next
        ? { label: INTERVIEW_COPY.next, onClick: onContinue, disabled: !configured || asking || block !== null }
        : { label: INTERVIEW_COPY.run, onClick: onRun, disabled: !configured || asking || block !== null };

  return (
    <>
      <h2 className={TILE_EYEBROW_CLASS}>{INTERVIEW_COPY.eyebrow(roundNumber, ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS)}</h2>
      <p ref={headlineRef} tabIndex={-1} className={cn(HEADLINE_CLASS, 'mt-3 outline-none')}>
        {headline}
      </p>
      <div className="mt-5">
        {asking ? (
          <InterviewSkeleton />
        ) : last && last.questions.length > 0 ? (
          <div className="flex flex-col gap-4" data-interview-round={interview.rounds.length}>
            {last.questions.map((question, index) => (
              <motion.div key={`${interview.rounds.length}:${question.id}`} variants={cardEnterVariants} initial="enter" animate="center">
                <QuestionCard question={question} index={index + 1} total={last.questions.length} answer={answerOf(last.answers, question.id)} onAnswer={(value) => onAnswer(question.id, value)} />
              </motion.div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={onBack} disabled={asking}>
          {INTERVIEW_COPY.back}
        </Button>
        <div className="flex flex-col gap-2 tablet:items-end">
          <p role="status" className={cn('min-h-[1.25rem] text-[12px]', round.kind === 'failed' ? 'text-destructive' : 'text-warning-foreground')}>
            {status ?? ''}
          </p>
          <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:items-center">
            <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={onSkip} disabled={!configured}>
              {INTERVIEW_COPY.skip}
            </Button>
            <Button type="button" className={PRIMARY_CLASS} onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
