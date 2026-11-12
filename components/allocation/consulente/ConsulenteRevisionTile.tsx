'use client';

/**
 * «Chiedi una modifica» on a finished report (2026-10-20; its own file since 2026-11-08; a page of
 * the book since 2026-11-11): the requests made so far, the textarea, and — before the revision —
 * ONE round of the Consulente's questions about the written request (2026-11-08). «Rivedi il report»
 * first asks the round (`useConsulenteInterview`, the textarea read-only, the skeleton); the round's
 * `QuestionCard`s appear under its note and «Rivedi il report» sends the revision once every
 * question is answered or declined; «Salta le domande» sends it at once with what is there —
 * `{ rounds: [], skipped: true }` while the round is still asked, aborting it. A round with no
 * question sends the revision at once. Under the last request, the round asked before it
 * (`document.revisionInterview`).
 *
 * Split in two for the book: `useRevisionDraft` holds the draft — the request, the round and its
 * answers, the round in flight — and is called ONCE by the book, so leaving the page and coming
 * back finds them; `RevisionBody` draws it, and the page's footer draws the two buttons from the
 * draft's `primary` and `showSkip`. The page asks the model and does not wear `generated`;
 * «Rivedi il report» takes the accent on hover and focus, «Salta le domande» never. The report
 * keeps `useConsulenteRevision`, whose `revising` disables «Applica».
 */

import { useState } from 'react';
import type { AllocationAdviceDocument, AllocationAdviceInterview } from '@/types/allocationAdvice';
import { interviewReducer, describeInterviewBlock } from '@/lib/utils/allocationAdviceInterview';
import { INTERVIEW_COPY, REVISION_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { answerOf, type QuestionAnswerValue } from '@/lib/utils/questionSet';
import { formatDate } from '@/lib/utils/formatters';
import { AI_GENERATED_EYEBROW_CLASS } from '@/lib/constants/aiAccent';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QuestionCard } from '@/components/ui/question-card';
import { cn } from '@/lib/utils';
import { InterviewSkeleton } from './ConsulenteInterviewScene';
import { InterviewRoundRows } from './ConsulenteInterviewTile';
import { useConsulenteInterview } from './useConsulenteInterview';
import type { useConsulenteRevision } from './useConsulenteRevision';

/** The draft of «Chiedi una modifica»: its state, its round, its handlers and what the page draws from them. */
export function useRevisionDraft(ownerId: string, document: AllocationAdviceDocument, revision: ReturnType<typeof useConsulenteRevision>) {
  const [request, setRequest] = useState('');
  // The round asked about THIS request, with the answers so far; null before «Rivedi il report».
  const [round, setRound] = useState<AllocationAdviceInterview | null>(null);
  const interview = useConsulenteInterview(ownerId);
  const revising = revision.state.kind === 'running';
  const asking = interview.state.kind === 'asking';
  const requests = document.revisions ?? [];
  const text = request.trim();
  const block = round ? describeInterviewBlock(round) : null;
  const last = round?.rounds[0] ?? null;

  const done = () => {
    setRequest('');
    setRound(null);
  };
  const askRound = () => {
    interview.requestRound({ answers: document.answers, interview: { rounds: [], skipped: false }, revision: { requests: text } }, (received) => {
      const asked: AllocationAdviceInterview = { rounds: [received], skipped: false };
      // Nothing to ask: the revision goes at once.
      if (received.questions.length === 0) revision.revise(text, asked, done);
      else setRound(asked);
    });
  };
  const sendRevision = () => {
    if (!round) return;
    revision.revise(text, round, done);
  };
  const skipQuestions = () => {
    if (asking || interview.state.kind === 'failed') interview.abort();
    revision.revise(text, round ? interviewReducer(round, { type: 'skip' }) : { rounds: [], skipped: true }, done);
  };
  const answer = (questionId: string, value: QuestionAnswerValue | null) => setRound((current) => (current ? interviewReducer(current, { type: 'answer', questionId, value }) : current));

  const busy = revising || asking;
  const status =
    revision.state.kind === 'failed'
      ? { text: revision.state.error, tone: 'text-destructive' }
      : interview.state.kind === 'failed'
        ? { text: interview.state.error, tone: 'text-destructive' }
        : revising
          ? { text: REVISION_COPY.running, tone: 'text-muted-foreground' }
          : block
            ? { text: block, tone: 'text-warning-foreground' }
            : { text: '', tone: 'text-muted-foreground' };

  const primary =
    interview.state.kind === 'failed'
      ? { label: INTERVIEW_COPY.retry, onClick: askRound, disabled: revising || text === '' }
      : round
        ? { label: INTERVIEW_COPY.revise, onClick: sendRevision, disabled: busy || block !== null }
        : { label: INTERVIEW_COPY.revise, onClick: askRound, disabled: busy || text === '' };
  // «Salta le domande» exists once a round is asked, received or failed; the revision in flight disables it.
  const showSkip = asking || round !== null || interview.state.kind === 'failed';
  const lastRevisionRound = document.revisionInterview?.rounds[0] ?? null;

  return { request, setRequest, round, last, answer, asking, revising, status, primary, showSkip, skipQuestions, requests, lastRevisionRound };
}

export type RevisionDraft = ReturnType<typeof useRevisionDraft>;

/** The page's aside: «in corso» while the revision runs, else how many requests were made. */
export function describeRevisionAside(draft: RevisionDraft): string {
  if (draft.revising) return 'in corso';
  return `${draft.requests.length} ${draft.requests.length === 1 ? 'richiesta' : 'richieste'}`;
}

/** The page's body: the requests so far, the textarea, the skeleton or the round, the status line. */
export function RevisionBody({ draft }: { draft: RevisionDraft }) {
  const { request, setRequest, round, last, answer, asking, revising, status, requests, lastRevisionRound } = draft;
  return (
    <>
      {requests.length > 0 && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] leading-[1.45] text-foreground" aria-label="Le richieste fatte">
          {requests.map((row, index) => (
            <li key={index}>
              {row.request} <span className="text-muted-foreground">· {formatDate(row.at)}</span>
              {index === requests.length - 1 && lastRevisionRound && lastRevisionRound.questions.length > 0 && (
                <div className="mt-2" data-revision-interview="">
                  <p className={cn(TILE_SUB_EYEBROW_CLASS, AI_GENERATED_EYEBROW_CLASS)}>{INTERVIEW_COPY.revisionAsked}</p>
                  <InterviewRoundRows questions={lastRevisionRound.questions} answers={lastRevisionRound.answers} className="mt-1" />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="consulente-revision">{REVISION_COPY.label}</Label>
        <Textarea id="consulente-revision" rows={3} value={request} onChange={(event) => setRequest(event.target.value)} placeholder={REVISION_COPY.placeholder} disabled={revising} readOnly={asking || round !== null} maxLength={1000} />
      </div>
      {asking && <InterviewSkeleton className="mt-4" />}
      {!asking && last && last.questions.length > 0 && (
        <div className="mt-4 flex flex-col gap-4" data-revision-round="">
          <p className="text-[14px] leading-[1.5] text-foreground">{last.note}</p>
          {last.questions.map((question, index) => (
            <QuestionCard key={question.id} question={question} index={index + 1} total={last.questions.length} answer={answerOf(last.answers, question.id)} onAnswer={(value) => answer(question.id, value)} />
          ))}
        </div>
      )}
      <p role="status" className={cn('mt-2 min-h-[1.25rem] text-[12px]', status.tone)}>
        {status.text}
      </p>
    </>
  );
}
