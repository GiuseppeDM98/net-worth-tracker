'use client';

/**
 * The question cards of ONE assistant message (2026-11): which blocks there are, whether they may
 * still be answered, and the answers being given. The cards sit under ReactMarkdown's module-level
 * components map and cannot take props, and ONE «Rispondi» sends all of them in one message — so
 * the message holds the answers here, and each card reads and writes its own.
 *
 * The default (no provider) is a message with no question: no blocks, nothing answerable.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { QuestionBlockEntry } from '@/lib/utils/assistantQuestionBlocks';
import type { QuestionAnswerValue } from '@/lib/utils/questionSet';

export interface QuestionDraft {
  value: QuestionAnswerValue;
  /** The names of the entities the card could pick from, for the reply's line («Conto E [acc-5]»). */
  labels: Record<string, string>;
}

interface MessageQuestionsValue {
  blocks: QuestionBlockEntry[];
  /** A kept block holding a question with no problem: the message asks, so its proposals wait. */
  hasQuestionBlock: boolean;
  answerable: boolean;
  answers: Record<number, QuestionDraft>;
  setAnswer: (index: number, value: QuestionAnswerValue, labels: Record<string, string>) => void;
}

const NO_BLOCKS: QuestionBlockEntry[] = [];
const NO_ANSWERS: Record<number, QuestionDraft> = {};

const MessageQuestionsContext = createContext<MessageQuestionsValue>({
  blocks: NO_BLOCKS,
  hasQuestionBlock: false,
  answerable: false,
  answers: NO_ANSWERS,
  setAnswer: () => {},
});

/** Whether a block renders as a card a reply can answer: kept, parsed, with no problem. */
export function isValidQuestionBlock(block: QuestionBlockEntry): boolean {
  return block.kept && block.question !== null && block.problems.length === 0;
}

interface MessageQuestionsProviderProps {
  blocks: QuestionBlockEntry[];
  answerable: boolean;
  children: ReactNode;
}

export function MessageQuestionsProvider({ blocks, answerable, children }: MessageQuestionsProviderProps) {
  const [answers, setAnswers] = useState<Record<number, QuestionDraft>>(NO_ANSWERS);
  const value: MessageQuestionsValue = {
    blocks,
    hasQuestionBlock: blocks.some(isValidQuestionBlock),
    answerable,
    answers,
    setAnswer: (index, answer, labels) => setAnswers((current) => ({ ...current, [index]: { value: answer, labels } })),
  };
  return <MessageQuestionsContext.Provider value={value}>{children}</MessageQuestionsContext.Provider>;
}

export function useMessageQuestions(): MessageQuestionsValue {
  return useContext(MessageQuestionsContext);
}
