/**
 * The question blocks of an Assistente message (2026-11): what the chat renders as question cards
 * and what «Rispondi» sends. Pure, client-safe.
 *
 * A ```assistant-question block holds ONE question object, read by the ONE parser of questions
 * (`parseQuestionsLenient`, wrapped as `[obj]`) with the entity rules on top; its index is its rank
 * among the message's question blocks as `listFencedBlocks` finds them — never a counter kept while
 * rendering — so a card's outcome key (`proposalKey('question', index)`) is the same on every render.
 */
import type { AssistantMessage } from '@/types/assistant';
import { listFencedBlocks } from '@/lib/utils/expenseProposal';
import { ASSISTANT_QUESTION_LANGUAGE, entityQuestionProblems, keepQuestionBlock, parseQuestionsLenient, type Question } from '@/lib/utils/questionSet';

export interface QuestionBlockEntry {
  /** The block's rank among the message's question blocks. */
  index: number;
  /** The question as parsed; null when the block holds none. */
  question: Question | null;
  /** Why the block renders as its code instead of a card; empty for a card. */
  problems: string[];
  /** Within the per-message cap (`keepQuestionBlock`): a block past it renders as nothing. */
  kept: boolean;
}

/** One block's body as a question, with what is wrong with it. */
function readQuestionBody(body: string): { question: Question | null; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { question: null, problems: ['JSON non valido'] };
  }
  const { questions, refused } = parseQuestionsLenient([raw]);
  const question = questions[0] ?? null;
  return { question, problems: question ? [...refused, ...entityQuestionProblems(question)] : refused };
}

/** Every ```assistant-question block of a message, in order, read and capped. */
export function readAssistantQuestionBlocks(content: string): QuestionBlockEntry[] {
  return listFencedBlocks(content)
    .filter((block) => block.language === ASSISTANT_QUESTION_LANGUAGE)
    .map((block, index) => ({ index, ...readQuestionBody(content.slice(block.bodyStart, block.bodyEnd)), kept: keepQuestionBlock(index) }));
}

/**
 * Whether a message's question cards may still be answered: a register message, the thread's
 * LAST assistant message, saved on the server (a `local-` id has nowhere to keep the answers) and
 * nothing streaming. An older question is not answered in place: the conversation moved on.
 */
export function isAnswerableQuestionMessage(
  message: Pick<AssistantMessage, 'id' | 'mode'>,
  lastAssistantMessageId: string | undefined,
  streamingMessageId: string | undefined,
): boolean {
  return (
    message.mode === 'register' &&
    message.id === lastAssistantMessageId &&
    !message.id.startsWith('local-') &&
    streamingMessageId === undefined
  );
}
