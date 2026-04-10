import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  AssistantGoalEvaluationResult,
  AssistantCreateThreadInput,
  AssistantMemoryDocument,
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantMessage,
  AssistantMode,
  AssistantPreferences,
  AssistantThread,
  AssistantThreadDetail,
} from '@/types/assistant';
import { toDate } from '@/lib/utils/dateHelpers';
import { getDefaultAssistantPreferences } from './webSearchPolicy';
import { parseStructuredGoalFromText } from './goalEvaluation';

const THREADS_COLLECTION = 'assistantThreads';
const MEMORY_COLLECTION = 'assistantMemory';
const SETTINGS_COLLECTION = 'assetAllocationTargets';

export class AssistantStoreError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AssistantStoreError';
    this.status = status;
  }
}

function sanitizePreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function getDefaultThreadTitle(mode: AssistantMode): string {
  if (mode === 'month_analysis') return 'Nuova analisi mensile';
  if (mode === 'year_analysis') return 'Nuova analisi annuale';
  if (mode === 'ytd_analysis') return 'Nuova analisi YTD';
  if (mode === 'history_analysis') return 'Nuova analisi storico';
  return 'Nuova conversazione';
}

function buildThreadTitleFromPrompt(prompt: string, mode: AssistantMode): string {
  const collapsedPrompt = sanitizePreview(prompt);
  if (!collapsedPrompt) {
    return getDefaultThreadTitle(mode);
  }

  return collapsedPrompt.slice(0, 60);
}

function mapThread(docId: string, data: Record<string, any>): AssistantThread {
  return {
    id: docId,
    userId: data.userId,
    title: data.title,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    lastMessagePreview: data.lastMessagePreview ?? '',
    messageCount: data.messageCount ?? 0,
    mode: data.mode,
    pinnedMonth: data.pinnedMonth ?? null,
    pinnedYear: data.pinnedYear ?? null,
  };
}

function mapMessage(threadId: string, docId: string, data: Record<string, any>): AssistantMessage {
  return {
    id: docId,
    threadId,
    userId: data.userId,
    role: data.role,
    content: data.content,
    createdAt: toDate(data.createdAt),
    mode: data.mode,
    monthContext: data.monthContext ?? null,
    webSearchUsed: data.webSearchUsed,
  };
}

function mapMemoryItem(doc: Record<string, any>, userId: string): AssistantMemoryItem {
  return {
    id: doc.id,
    userId,
    category: doc.category,
    text: doc.text,
    structuredGoal: doc.structuredGoal,
    sourceThreadId: doc.sourceThreadId,
    sourceMessageId: doc.sourceMessageId,
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
    completedAt: doc.completedAt ? toDate(doc.completedAt) : undefined,
    derivedFromContext: doc.derivedFromContext,
    evidenceSummary: doc.evidenceSummary,
    lastEvaluationAt: doc.lastEvaluationAt ? toDate(doc.lastEvaluationAt) : undefined,
    lastEvaluationResult: doc.lastEvaluationResult,
    status: doc.status,
  };
}

function mapMemorySuggestion(doc: Record<string, any>, userId: string): AssistantMemorySuggestion {
  return {
    id: doc.id,
    userId,
    itemId: doc.itemId,
    type: doc.type,
    status: doc.status,
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
    evidenceSummary: doc.evidenceSummary,
    evaluation: doc.evaluation,
  };
}

function serializeMemoryItem(item: AssistantMemoryItem) {
  return {
    id: item.id,
    userId: item.userId,
    category: item.category,
    text: item.text,
    status: item.status,
    createdAt: Timestamp.fromDate(item.createdAt),
    updatedAt: Timestamp.fromDate(item.updatedAt),
    ...(item.structuredGoal ? { structuredGoal: item.structuredGoal } : {}),
    ...(item.sourceThreadId ? { sourceThreadId: item.sourceThreadId } : {}),
    ...(item.sourceMessageId ? { sourceMessageId: item.sourceMessageId } : {}),
    ...(item.completedAt ? { completedAt: Timestamp.fromDate(item.completedAt) } : {}),
    ...(item.derivedFromContext !== undefined ? { derivedFromContext: item.derivedFromContext } : {}),
    ...(item.evidenceSummary ? { evidenceSummary: item.evidenceSummary } : {}),
    ...(item.lastEvaluationAt ? { lastEvaluationAt: Timestamp.fromDate(item.lastEvaluationAt) } : {}),
    ...(item.lastEvaluationResult ? { lastEvaluationResult: item.lastEvaluationResult } : {}),
  };
}

function serializeMemorySuggestion(suggestion: AssistantMemorySuggestion) {
  return {
    id: suggestion.id,
    userId: suggestion.userId,
    itemId: suggestion.itemId,
    type: suggestion.type,
    status: suggestion.status,
    evidenceSummary: suggestion.evidenceSummary,
    evaluation: suggestion.evaluation,
    createdAt: Timestamp.fromDate(suggestion.createdAt),
    updatedAt: Timestamp.fromDate(suggestion.updatedAt),
  };
}

async function getSyncedAssistantPreferences(userId: string): Promise<AssistantPreferences> {
  const settingsSnapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(userId).get();
  const settings = settingsSnapshot.exists ? settingsSnapshot.data() : null;
  const defaults = getDefaultAssistantPreferences();

  return {
    responseStyle: settings?.assistantResponseStyle ?? defaults.responseStyle,
    includeMacroContext: settings?.assistantMacroContextEnabled ?? defaults.includeMacroContext,
    memoryEnabled: settings?.assistantMemoryEnabled ?? defaults.memoryEnabled,
    includeDummySnapshots: settings?.assistantIncludeDummySnapshots ?? defaults.includeDummySnapshots,
  };
}

async function syncAssistantPreferencesToSettings(
  userId: string,
  preferences: AssistantPreferences
): Promise<void> {
  await adminDb.collection(SETTINGS_COLLECTION).doc(userId).set(
    {
      userId,
      assistantResponseStyle: preferences.responseStyle,
      assistantMacroContextEnabled: preferences.includeMacroContext,
      assistantMemoryEnabled: preferences.memoryEnabled,
      assistantIncludeDummySnapshots: preferences.includeDummySnapshots,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export function isAssistantStoreError(error: unknown): error is AssistantStoreError {
  return error instanceof AssistantStoreError;
}

export async function listAssistantThreads(userId: string): Promise<AssistantThread[]> {
  const snapshot = await adminDb
    .collection(THREADS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('updatedAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => mapThread(doc.id, doc.data()));
}

export async function createAssistantThread(
  input: AssistantCreateThreadInput & { title?: string }
): Promise<AssistantThread> {
  const now = Timestamp.now();
  const mode = input.mode ?? 'chat';
  const threadRef = adminDb.collection(THREADS_COLLECTION).doc();
  const threadData = {
    userId: input.userId,
    title: input.title ?? getDefaultThreadTitle(mode),
    mode,
    pinnedMonth: input.pinnedMonth ?? null,
    pinnedYear: input.pinnedYear ?? null,
    lastMessagePreview: '',
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await threadRef.set(threadData);

  return mapThread(threadRef.id, threadData);
}

export async function getAssistantThread(threadId: string, userId: string): Promise<AssistantThread> {
  const threadSnapshot = await adminDb.collection(THREADS_COLLECTION).doc(threadId).get();

  if (!threadSnapshot.exists) {
    throw new AssistantStoreError(404, 'Thread non trovato');
  }

  const thread = mapThread(threadSnapshot.id, threadSnapshot.data() as Record<string, any>);

  if (thread.userId !== userId) {
    throw new AssistantStoreError(403, 'Thread non appartenente all’utente autenticato');
  }

  return thread;
}

export async function getAssistantThreadDetail(
  threadId: string,
  userId: string
): Promise<AssistantThreadDetail> {
  const thread = await getAssistantThread(threadId, userId);
  const messagesSnapshot = await adminDb
    .collection(THREADS_COLLECTION)
    .doc(threadId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();

  return {
    thread,
    messages: messagesSnapshot.docs.map((doc) => mapMessage(threadId, doc.id, doc.data())),
  };
}

export async function appendAssistantMessage(
  threadId: string,
  message: Omit<AssistantMessage, 'id' | 'threadId' | 'createdAt'>
): Promise<AssistantMessage> {
  const now = Timestamp.now();
  const messageRef = adminDb
    .collection(THREADS_COLLECTION)
    .doc(threadId)
    .collection('messages')
    .doc();
  const messageData = {
    userId: message.userId,
    role: message.role,
    content: message.content,
    mode: message.mode,
    monthContext: message.monthContext ?? null,
    webSearchUsed: message.webSearchUsed ?? false,
    createdAt: now,
  };

  // Persist the message and atomically increment the thread's messageCount
  // so the thread list always reflects an accurate count without a separate read.
  await Promise.all([
    messageRef.set(messageData),
    adminDb
      .collection(THREADS_COLLECTION)
      .doc(threadId)
      .set({ messageCount: FieldValue.increment(1) }, { merge: true }),
  ]);

  return mapMessage(threadId, messageRef.id, messageData);
}

export async function updateAssistantThreadMetadata(
  threadId: string,
  updates: {
    title?: string;
    lastMessagePreview?: string;
    mode?: AssistantMode;
    pinnedMonth?: AssistantThread['pinnedMonth'];
    pinnedYear?: AssistantThread['pinnedYear'];
  }
): Promise<void> {
  await adminDb.collection(THREADS_COLLECTION).doc(threadId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function getAssistantMemoryDocument(userId: string): Promise<AssistantMemoryDocument> {
  const [memorySnapshot, syncedPreferences] = await Promise.all([
    adminDb.collection(MEMORY_COLLECTION).doc(userId).get(),
    getSyncedAssistantPreferences(userId),
  ]);

  if (!memorySnapshot.exists) {
    return {
      preferences: syncedPreferences,
      items: [],
      suggestions: [],
      updatedAt: null,
      hasDummySnapshots: false,
    };
  }

  const data = memorySnapshot.data() as Record<string, any>;
  const storedPreferences = data.preferences ?? {};

  return {
    preferences: {
      responseStyle: storedPreferences.responseStyle ?? syncedPreferences.responseStyle,
      includeMacroContext:
        storedPreferences.includeMacroContext ?? syncedPreferences.includeMacroContext,
      memoryEnabled: storedPreferences.memoryEnabled ?? syncedPreferences.memoryEnabled,
      includeDummySnapshots:
        storedPreferences.includeDummySnapshots ?? syncedPreferences.includeDummySnapshots,
    },
    items: Array.isArray(data.items)
      ? data.items.map((item: Record<string, any>) => mapMemoryItem(item, userId))
      : [],
    suggestions: Array.isArray(data.suggestions)
      ? data.suggestions.map((suggestion: Record<string, any>) => mapMemorySuggestion(suggestion, userId))
      : [],
    updatedAt: data.updatedAt ? toDate(data.updatedAt) : null,
    hasDummySnapshots: false,
  };
}

export async function updateAssistantMemoryDocument(
  userId: string,
  updates: {
    preferences?: Partial<AssistantPreferences>;
    item?: Partial<AssistantMemoryItem> & Pick<AssistantMemoryItem, 'id' | 'text' | 'category'>;
    suggestion?: Partial<AssistantMemorySuggestion> & Pick<AssistantMemorySuggestion, 'id' | 'itemId' | 'type' | 'status' | 'evidenceSummary' | 'evaluation'>;
  }
): Promise<AssistantMemoryDocument> {
  const current = await getAssistantMemoryDocument(userId);
  const now = Timestamp.now();
  const preferences: AssistantPreferences = {
    ...current.preferences,
    ...updates.preferences,
  };

  const items = [...current.items];
  const suggestions = [...current.suggestions];

  if (updates.item) {
    const itemIndex = items.findIndex((item) => item.id === updates.item!.id);
    const structuredGoal =
      updates.item.category === 'goal'
        ? (updates.item.structuredGoal ?? parseStructuredGoalFromText(updates.item.text))
        : undefined;
    const baseItem: AssistantMemoryItem = {
      id: updates.item.id,
      userId,
      category: updates.item.category,
      text: updates.item.text,
      structuredGoal,
      sourceThreadId: updates.item.sourceThreadId,
      sourceMessageId: updates.item.sourceMessageId,
      createdAt: itemIndex >= 0 ? items[itemIndex].createdAt : now.toDate(),
      updatedAt: now.toDate(),
      completedAt:
        updates.item.status === 'completed'
          ? (updates.item.completedAt ?? now.toDate())
          : undefined,
      derivedFromContext: updates.item.derivedFromContext,
      evidenceSummary: updates.item.evidenceSummary,
      lastEvaluationAt: updates.item.lastEvaluationAt,
      lastEvaluationResult: updates.item.lastEvaluationResult,
      status: updates.item.status ?? 'active',
    };

    if (itemIndex >= 0) {
      items[itemIndex] = {
        ...items[itemIndex],
        ...baseItem,
      };
    } else {
      items.unshift(baseItem);
    }
  }

  if (updates.suggestion) {
    const suggestionIndex = suggestions.findIndex((suggestion) => suggestion.id === updates.suggestion!.id);
    const existingSuggestion = suggestionIndex >= 0 ? suggestions[suggestionIndex] : undefined;
    const suggestion: AssistantMemorySuggestion = {
      id: updates.suggestion.id,
      userId,
      itemId: updates.suggestion.itemId,
      type: updates.suggestion.type,
      status: updates.suggestion.status,
      createdAt: existingSuggestion?.createdAt ?? now.toDate(),
      updatedAt: now.toDate(),
      evidenceSummary: updates.suggestion.evidenceSummary,
      evaluation: updates.suggestion.evaluation,
    };

    if (suggestionIndex >= 0) {
      suggestions[suggestionIndex] = suggestion;
    } else {
      suggestions.unshift(suggestion);
    }
  }

  await Promise.all([
    adminDb.collection(MEMORY_COLLECTION).doc(userId).set(
      {
        preferences,
        items: items.map(serializeMemoryItem),
        suggestions: suggestions.map(serializeMemorySuggestion),
        updatedAt: now,
      },
      { merge: true }
    ),
    syncAssistantPreferencesToSettings(userId, preferences),
  ]);

  return {
    preferences,
    items,
    suggestions,
    updatedAt: now.toDate(),
    hasDummySnapshots: false,
  };
}

export async function deleteAssistantMemoryDocument(
  userId: string,
  options: { itemId?: string; resetAll?: boolean }
): Promise<AssistantMemoryDocument> {
  const current = await getAssistantMemoryDocument(userId);

  if (options.resetAll) {
    const cleared = {
      preferences: current.preferences,
      items: [],
      suggestions: [],
      updatedAt: new Date(),
      hasDummySnapshots: false,
    };

    await adminDb.collection(MEMORY_COLLECTION).doc(userId).set(
      {
        preferences: cleared.preferences,
        items: [],
        suggestions: [],
        updatedAt: Timestamp.fromDate(cleared.updatedAt),
      },
      { merge: true }
    );

    return cleared;
  }

  if (!options.itemId) {
    throw new AssistantStoreError(400, 'itemId o resetAll sono obbligatori');
  }

  const filteredItems = current.items.filter((item) => item.id !== options.itemId);
  const filteredSuggestions = current.suggestions.filter((suggestion) => suggestion.itemId !== options.itemId);

  await adminDb.collection(MEMORY_COLLECTION).doc(userId).set(
    {
      preferences: current.preferences,
      items: filteredItems.map(serializeMemoryItem),
      suggestions: filteredSuggestions.map(serializeMemorySuggestion),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  return {
    preferences: current.preferences,
    items: filteredItems,
    suggestions: filteredSuggestions,
    updatedAt: new Date(),
    hasDummySnapshots: false,
  };
}

export async function setAssistantGoalEvaluation(
  userId: string,
  itemId: string,
  evaluation: AssistantGoalEvaluationResult
): Promise<AssistantMemoryDocument> {
  const current = await getAssistantMemoryDocument(userId);
  const item = current.items.find((entry) => entry.id === itemId);

  if (!item) {
    throw new AssistantStoreError(404, 'Obiettivo memoria non trovato');
  }

  return updateAssistantMemoryDocument(userId, {
    item: {
      ...item,
      lastEvaluationAt: new Date(),
      lastEvaluationResult: evaluation,
    },
  });
}

/**
 * Deletes a thread and all its messages.
 * Verifies ownership before deletion — throws AssistantStoreError 403 if the
 * thread exists but belongs to a different user.
 *
 * Firestore Admin SDK does not cascade-delete subcollections automatically,
 * so messages are deleted in a batch before removing the parent document.
 */
export async function deleteAssistantThread(threadId: string, userId: string): Promise<void> {
  // Verify ownership first — never delete without confirming the caller owns the thread
  await getAssistantThread(threadId, userId);

  const messagesRef = adminDb
    .collection(THREADS_COLLECTION)
    .doc(threadId)
    .collection('messages');

  // Delete messages in batches of 400 (well under Firestore 500-write limit)
  const BATCH_SIZE = 400;
  let snapshot = await messagesRef.limit(BATCH_SIZE).get();

  while (!snapshot.empty) {
    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    snapshot = await messagesRef.limit(BATCH_SIZE).get();
  }

  await adminDb.collection(THREADS_COLLECTION).doc(threadId).delete();
}

export { buildThreadTitleFromPrompt, getDefaultThreadTitle };
