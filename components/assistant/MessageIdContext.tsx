'use client';

/**
 * What a card inside an assistant message knows about its message (2026-11).
 *
 * The cards are rendered by ReactMarkdown's `pre` interceptor, which lives in a module-level
 * components map (a map rebuilt per render would remount the whole message) — so nothing can be
 * handed down as props, and the message reaches its cards through this context instead:
 *
 * - `useMessageBlocks()`: where the fenced blocks of the message ARE (`listFencedBlocks`), so the
 *   interceptor finds a block's rank by its source offset and never counts while it renders, and
 *   the mode the message is shown in (an expense block is a card in Registra alone);
 * - `useMessageId()`: the message's id and thread, the outcomes already recorded on it, and
 *   `recordProposal`, bound to this message.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { listFencedBlocks, listNestedFencedBlocks } from '@/lib/utils/expenseProposal';
import { GOAL_PROPOSAL_LANGUAGE } from '@/lib/utils/goalProposal';
import type { AssistantMessage, AssistantMode, AssistantProposalState } from '@/types/assistant';

type ProposalOutcome = Omit<AssistantProposalState, 'at'>;

interface MessageContextValue {
  messageId: string;
  threadId: string;
  proposals: Record<string, AssistantProposalState>;
  recordProposal: (key: string, state: ProposalOutcome) => void;
  blocks: { language: string; offset: number; index: number }[];
  mode: AssistantMode;
}

const NO_PROPOSALS: Record<string, AssistantProposalState> = {};

// Outside a provider a card behaves as one of a message that never reached the server: its id is
// local, so it offers no button (lib/utils/expenseProposal.ts → describeExpenseProposalState).
const MessageContext = createContext<MessageContextValue>({
  messageId: 'local-none',
  threadId: 'pending',
  proposals: NO_PROPOSALS,
  recordProposal: () => {},
  blocks: [],
  mode: 'chat',
});

interface MessageIdProviderProps {
  message: AssistantMessage;
  mode: AssistantMode;
  /** Already bound to the message's id and thread. */
  recordProposal: (key: string, state: ProposalOutcome) => void;
  children: ReactNode;
}

export function MessageIdProvider({ message, mode, recordProposal, children }: MessageIdProviderProps) {
  const value: MessageContextValue = {
    messageId: message.id,
    threadId: message.threadId,
    proposals: message.proposals ?? NO_PROPOSALS,
    recordProposal,
    // The top-level blocks, then the goal blocks the model quoted or listed (keyed after them).
    blocks: [...listFencedBlocks(message.content), ...listNestedFencedBlocks(message.content, GOAL_PROPOSAL_LANGUAGE)],
    mode,
  };
  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
}

export function useMessageId(): Pick<MessageContextValue, 'messageId' | 'threadId' | 'proposals' | 'recordProposal'> {
  const { messageId, threadId, proposals, recordProposal } = useContext(MessageContext);
  return { messageId, threadId, proposals, recordProposal };
}

export function useMessageBlocks(): Pick<MessageContextValue, 'blocks' | 'mode'> {
  const { blocks, mode } = useContext(MessageContext);
  return { blocks, mode };
}

/**
 * Saves a card's outcome on its message document. Never throws: `false` on any failure, and the
 * caller says so — by then the row is written and the session already shows the outcome.
 */
export async function patchMessageProposal(args: {
  ownerId: string;
  threadId: string;
  messageId: string;
  key: string;
  state: ProposalOutcome;
}): Promise<boolean> {
  const { ownerId, threadId, messageId, key, state } = args;
  try {
    const response = await authenticatedFetch(
      `/api/ai/assistant/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId, key, ...state }),
      },
    );
    return response.ok;
  } catch (error) {
    console.error('Error saving the proposal outcome:', error);
    return false;
  }
}
