'use client';

/**
 * «Chiedi una modifica» on a finished report (2026-10-20; its own file since 2026-11-08): the
 * requests made so far, the textarea, and — before the revision — ONE round of the Consulente's
 * questions about the written request (decision 24, doc/ai/AI-04-colloquio.md). «Rivedi il report»
 * first asks the round (`useConsulenteInterview`, the textarea read-only, the skeleton); the round's
 * `QuestionCard`s appear under its note and «Rivedi il report» sends the revision once every
 * question is answered or declined; «Salta le domande» sends it at once with what is there —
 * `{ rounds: [], skipped: true }` while the round is still asked, aborting it. A round with no
 * question sends the revision at once. Under the last request, the round asked before it
 * (`document.revisionInterview`).
 *
 * The tile asks the model and does not wear `generated`; «Rivedi il report» and «Riprova» take the
 * accent on hover and focus (decision 36), «Salta le domande» never (decision 78). The report keeps
 * `useConsulenteRevision`, whose `revising` disables «Applica» there.
 */

import { useState } from 'react';
import type { AllocationAdviceDocument, AllocationAdviceInterview } from '@/types/allocationAdvice';
import { interviewReducer, describeInterviewBlock } from '@/lib/utils/allocationAdviceInterview';
import { INTERVIEW_COPY, REVISION_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { answerOf, type QuestionAnswerValue } from '@/lib/utils/questionSet';
import { formatDate } from '@/lib/utils/formatters';
import { AI_CONTROL_ACCENT_CLASS, AI_GENERATED_EYEBROW_CLASS } from '@/lib/constants/aiAccent';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QuestionCard } from '@/components/ui/question-card';
import { cn } from '@/lib/utils';
import { InterviewSkeleton } from './ConsulenteInterviewScene';
import { InterviewRoundRows } from './ConsulenteInterviewTile';
import { useConsulenteInterview } from './useConsulenteInterview';
import type { useConsulenteRevision } from './useConsulenteRevision';

const BUTTON_CLASS = 'h-11 desktop:h-9';
const PRIMARY_CLASS = cn(BUTTON_CLASS, 'border border-transparent', AI_CONTROL_ACCENT_CLASS);

export interface ConsulenteRevisionTileProps {
  ownerId: string;
  document: AllocationAdviceDocument;
  revision: ReturnType<typeof useConsulenteRevision>;
}

export function ConsulenteRevisionTile({ ownerId, document, revision }: ConsulenteRevisionTileProps) {
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

  return (
    <Tile eyebrow="Chiedi una modifica" aside={revising ? 'in corso' : `${requests.length} ${requests.length === 1 ? 'richiesta' : 'richieste'}`} reading={[{ text: REVISION_COPY.reading }]}>
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
      <div className="mt-3 flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
        {showSkip && (
          <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={skipQuestions} disabled={revising}>
            {INTERVIEW_COPY.skipQuestions}
          </Button>
        )}
        <Button type="button" className={PRIMARY_CLASS} onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </Button>
      </div>
    </Tile>
  );
}
