/**
 * Two pure steps on the Assistente's message list (2026-11), shared by the stream buffer and the
 * cached thread detail (lib/hooks/useAssistantStreaming.ts).
 *
 * A message is born in the browser with a `local-…` id and only the stream's `done` event names
 * the document the server wrote. A card's outcome is saved ON that document, so the local message
 * must take the server id — otherwise «Conferma» would PATCH a message that does not exist and a
 * reload would offer the same row again.
 */
import type { AssistantMessage, AssistantProposalState } from '@/types/assistant';

/**
 * The local message takes the id (and the thread id) the server gave it. Only the message whose
 * id is `localId` changes; without `messageId` nothing does — a stream stopped before `done`
 * keeps its `local-` id, which is how a card knows it has nowhere to save an outcome.
 */
export function adoptStreamMessageId(
  messages: AssistantMessage[],
  localId: string,
  done: { messageId?: string; threadId?: string },
): AssistantMessage[] {
  const { messageId, threadId } = done;
  if (!messageId) return messages;
  return messages.map((message) =>
    message.id === localId ? { ...message, id: messageId, threadId: threadId ?? message.threadId } : message,
  );
}

/** The outcome of one card written on its message; the other messages and the other cards are untouched. */
export function applyProposalToMessages(
  messages: AssistantMessage[],
  messageId: string,
  key: string,
  state: AssistantProposalState,
): AssistantMessage[] {
  return messages.map((message) =>
    message.id === messageId ? { ...message, proposals: { ...message.proposals, [key]: state } } : message,
  );
}

/**
 * What the conversation follows to its end: a new message, the text of the last one growing, another
 * thread. A card's outcome is NOT in it — pressing «Conferma» or «Ignora» on a card in the middle
 * of a long answer must leave the page where the user is reading (the owner's tour, 2026-11-11:
 * every click sent the page to its bottom, because the outcome makes a new message list).
 */
export function conversationScrollSignal(messages: AssistantMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return '';
  return `${last.threadId}:${messages.length}:${last.content.length}`;
}
