'use client';

/**
 * A question the Assistente asks inside its message, in Registra (2026-11; DESIGN.md § 5 → The
 * Question-Card Rule): ONE ```assistant-question block is ONE card, and ONE «Rispondi» under the
 * message's last card sends every answer as one user message, one line per question.
 *
 * Rendered by the `pre` interceptor with the block's rank among the message's question blocks
 * (`readAssistantQuestionBlocks`, never a render counter), so its outcome key
 * `proposalKey('question', index)` is the same after a reload. In order:
 * - no entry for it (a message outside Registra) → the plain code block;
 * - past the per-message cap → nothing;
 * - a block with problems (bad JSON, a refused question, an entity rule broken) → the code block;
 * - answered (`status: 'answered'` on the message) → the read-only card, «Risposta: …»;
 * - not answerable (an older message, a stream running) → the read-only card, «Non risposta qui»;
 * - otherwise the card, «Altro…» on an entity question a pick among the page's own items.
 *
 * It is what the model wrote: the accent border and eyebrow (The AI-Accent Rule); «Rispondi» asks
 * the model, so it takes the accent on hover and focus only.
 */
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuestionCard } from '@/components/ui/question-card';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { patchMessageProposal, useMessageId } from '@/components/assistant/MessageIdContext';
import { isValidQuestionBlock, useMessageQuestions, type QuestionDraft } from '@/components/assistant/MessageQuestionsContext';
import { useRegisterRefs } from '@/components/assistant/RegisterRefsContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { AI_CONTROL_ACCENT_CLASS, AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { ANSWER_STATE_NOT_SAVED } from '@/lib/utils/dialogNarrative';
import { proposalKey } from '@/lib/utils/expenseProposal';
import { describeAnswer, formatQuestionAnswersAsMessage, isEntityQuestion, type EntityQuestionKind, type Question } from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';
import type { AssistantProposalState } from '@/types/assistant';

export const QUESTION_EYEBROW = "L'Assistente chiede";
export const QUESTION_NOT_ANSWERED_HERE = 'Non risposta qui';

const OTHER_SELECT_LABELS: Record<Exclude<EntityQuestionKind, 'category'>, string> = {
  account: 'Scegli fra tutti i conti',
  center: 'Scegli fra tutti i centri di costo',
  member: 'Scegli fra tutti gli intestatari',
  loan: 'Scegli fra tutti i prestiti',
};

type Refs = ReturnType<typeof useRegisterRefs>;

/** The page's items an entity question may pick among: never the model's list. */
function otherSelectItems(kind: Exclude<EntityQuestionKind, 'category'>, questionId: string, refs: Refs): { id: string; name: string }[] {
  if (kind === 'center') return refs.costCenters.filter((center) => !center.archivedAt).map(({ id, name }) => ({ id, name }));
  if (kind === 'member') return refs.members.map(({ id, name }) => ({ id, name }));
  if (kind === 'loan') return refs.loans.map(({ id, name }) => ({ id, name }));
  const accounts = refs.cashAssets.map(({ id, name }) => ({ id, name }));
  // A transfer's two ends may be a property: listed as such, after the accounts.
  if (questionId !== 'account:from' && questionId !== 'account:to') return accounts;
  return [...accounts, ...refs.properties.map(({ id, name }) => ({ id, name: `${name} (immobile)` }))];
}

interface AnswerEntry {
  index: number;
  question: Question;
  draft: QuestionDraft;
}

/** Records each answer on the message and saves it; true when every save held. Module-level: no branch inside the caller's await chain. */
async function saveAnswers(args: {
  entries: AnswerEntry[];
  ownerId: string;
  threadId: string;
  messageId: string;
  recordProposal: (key: string, state: Omit<AssistantProposalState, 'at'>) => void;
}): Promise<boolean> {
  const { entries, ownerId, threadId, messageId, recordProposal } = args;
  let allSaved = true;
  for (const { index, question, draft } of entries) {
    const key = proposalKey('question', index);
    const state = { status: 'answered' as const, answer: describeAnswer(question, draft.value, draft.labels) ?? '' };
    recordProposal(key, state);
    const saved = await patchMessageProposal({ ownerId, threadId, messageId, key, state });
    allSaved = allSaved && saved;
  }
  return allSaved;
}

/** The selector of a question's read-only answer line: the focus lands there after «Rispondi». */
const answerLineSelector = (messageId: string, index: number) => `[data-question-answer="${CSS.escape(`${messageId}:${index}`)}"]`;

interface AssistantQuestionBlockProps {
  /** The block's rank among the message's ```assistant-question blocks. */
  index: number;
  /** The plain code block, for a block that does not render as a card. */
  codeBlock: ReactNode;
}

export function AssistantQuestionBlock({ index, codeBlock }: AssistantQuestionBlockProps) {
  const { ownerId } = useActiveAccount();
  const refs = useRegisterRefs();
  const { messageId, threadId, proposals, recordProposal } = useMessageId();
  const { blocks, answerable, answers, setAnswer } = useMessageQuestions();
  const [sending, setSending] = useState(false);

  const block = blocks.find((candidate) => candidate.index === index);
  if (!block) return <>{codeBlock}</>;
  if (!block.kept) return null;
  if (!isValidQuestionBlock(block) || !block.question) return <>{codeBlock}</>;
  const question = block.question;

  const validBlocks = blocks.filter(isValidQuestionBlock);
  const persisted = proposals[proposalKey('question', index)];
  const answeredLine = persisted?.status === 'answered' ? `Risposta: ${persisted.answer ?? ''}` : !answerable ? QUESTION_NOT_ANSWERED_HERE : null;

  const kind = isEntityQuestion(question);
  const selectKind = kind === null || kind === 'category' ? null : kind;
  // With a failed read the page's lists are empty: «Altro…» is the free-text row, as on the Consulente.
  const items = selectKind && !refs.readFailed ? otherSelectItems(selectKind, question.id, refs) : null;
  const otherSelect = selectKind && items ? { label: OTHER_SELECT_LABELS[selectKind], items } : undefined;
  const labels: Record<string, string> = Object.fromEntries((items ?? []).map((item) => [item.id, item.name]));

  // «Rispondi» stands under the LAST valid card, while one of them is still open.
  const isLast = validBlocks[validBlocks.length - 1]?.index === index;
  const open = validBlocks.filter((candidate) => proposals[proposalKey('question', candidate.index)]?.status !== 'answered');
  const showRespond = isLast && answerable && open.length > 0;
  const entries: AnswerEntry[] = open.flatMap((candidate) => {
    const draft = answers[candidate.index];
    return draft && candidate.question ? [{ index: candidate.index, question: candidate.question, draft }] : [];
  });
  const text = entries.length === open.length ? formatQuestionAnswersAsMessage(entries.map(({ question: q, draft }) => ({ question: q, answer: draft.value, labels: draft.labels }))) : null;
  const canRespond = showRespond && text !== null && !sending && Boolean(ownerId);

  const respond = async () => {
    if (!canRespond || !ownerId || text === null) return;
    setSending(true);
    const allSaved = await saveAnswers({ entries, ownerId, threadId, messageId, recordProposal });
    if (!allSaved) toast.error(ANSWER_STATE_NOT_SAVED);
    // The focus first, the message after: the new message scrolls the conversation to its end,
    // and a focus moved after it would pull the page back up.
    document.querySelector<HTMLElement>(answerLineSelector(messageId, entries[0].index))?.focus({ preventScroll: true });
    await refs.submitAnswer(text);
    setSending(false);
  };

  return (
    <div className="not-prose my-3">
      {answeredLine !== null ? (
        <div className={cn('rounded-xl border bg-muted/40 p-4 desktop:p-5', AI_GENERATED_SURFACE_CLASS)} data-question-card={question.id}>
          <p className={cn(TILE_SUB_EYEBROW_CLASS, AI_GENERATED_EYEBROW_CLASS)}>{QUESTION_EYEBROW}</p>
          <p className="mt-2 text-[16px] font-medium leading-[1.4] text-foreground desktop:text-[20px]">{question.text}</p>
          <p
            tabIndex={-1}
            data-question-answer={`${messageId}:${index}`}
            className={cn('mt-2 text-[13px] outline-none', persisted?.status === 'answered' ? 'text-foreground' : 'text-muted-foreground')}
          >
            {answeredLine}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-muted/40">
          <QuestionCard
            question={question}
            index={validBlocks.findIndex((candidate) => candidate.index === index) + 1}
            total={validBlocks.length}
            answer={answers[index]?.value ?? null}
            onAnswer={(value) => setAnswer(index, value, labels)}
            eyebrow={QUESTION_EYEBROW}
            decline={kind === null}
            otherSelect={otherSelect}
          />
        </div>
      )}
      {showRespond && (
        <div className="mt-3 flex justify-end">
          <Button className={cn('h-11 border border-transparent', AI_CONTROL_ACCENT_CLASS)} onClick={respond} disabled={!canRespond}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Rispondi
          </Button>
        </div>
      )}
    </div>
  );
}
