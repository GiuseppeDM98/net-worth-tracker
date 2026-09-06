import { adminDb } from '@/lib/firebase/admin';
import { DocumentData, FieldValue, Timestamp } from 'firebase-admin/firestore';
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

function mapThread(docId: string, data: DocumentData): AssistantThread {
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

function mapMessage(threadId: string, docId: string, data: DocumentData): AssistantMessage {
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

function mapMemoryItem(doc: DocumentData, userId: string): AssistantMemoryItem {
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

function mapMemorySuggestion(doc: DocumentData, userId: string): AssistantMemorySuggestion {
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

  const thread = mapThread(threadSnapshot.id, threadSnapshot.data() as DocumentData);

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
    };
  }

  const data = memorySnapshot.data() as DocumentData;
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
      ? data.items.map((item: DocumentData) => mapMemoryItem(item, userId))
      : [],
    suggestions: Array.isArray(data.suggestions)
      ? data.suggestions.map((suggestion: DocumentData) => mapMemorySuggestion(suggestion, userId))
      : [],
    updatedAt: data.updatedAt ? toDate(data.updatedAt) : null,
  };
}

/**
 * Computes whether the user has at least one dummy (test fixture) snapshot.
 * The only truthful place to answer this — never fabricate it elsewhere as `false`.
 */
export async function computeHasDummySnapshots(userId: string): Promise<boolean> {
  const snapshot = await adminDb
    .collection('monthly-snapshots')
    .where('userId', '==', userId)
    .where('isDummy', '==', true)
    .limit(1)
    .get();
  return !snapshot.empty;
}

type AssistantMemoryItemInput = Partial<AssistantMemoryItem> &
  Pick<AssistantMemoryItem, 'id' | 'text' | 'category'>;
type AssistantMemorySuggestionInput = Partial<AssistantMemorySuggestion> &
  Pick<AssistantMemorySuggestion, 'id' | 'itemId' | 'type' | 'status' | 'evidenceSummary' | 'evaluation'>;

/**
 * True when two structured goals describe the same target. Compared field by
 * field rather than by JSON string: key order is an implementation detail of
 * whoever built the object, and a false "changed" verdict would expire a
 * durable "Ignora" (see `isSuggestionStillBinding` in goalEvaluation.ts).
 */
function isSameStructuredGoal(
  a: AssistantMemoryItem['structuredGoal'],
  b: AssistantMemoryItem['structuredGoal']
): boolean {
  if (!a || !b) return a === b;
  return (
    a.kind === b.kind &&
    a.targetValue === b.targetValue &&
    a.unit === b.unit &&
    a.direction === b.direction &&
    a.assetClass === b.assetClass &&
    a.subCategory === b.subCategory &&
    a.deadlineIso === b.deadlineIso
  );
}

/**
 * Merges one item patch into the items array. Only fields the caller actually
 * included in `input` overwrite existing metadata — a patch carrying just `text`
 * must not wipe sourceThreadId/evidenceSummary/evaluation history. Previously the
 * merge object set every field unconditionally from `input`, so an absent field
 * became an explicit `undefined` that won the `{...existing, ...patch}` spread.
 *
 * Two rules that are not obvious from the signature:
 *
 * - **The caller owns `structuredGoal`.** This function no longer derives it from
 *   the text (the regex parser is gone): the extraction tool and the
 *   PATCH route decide, and a goal patch that carries no structure clears it —
 *   an un-trackable goal is stated as such in the panel, which is safer than
 *   keeping a structure that contradicts the edited text.
 * - **`updatedAt` marks the last CONTENT change** (text, category, structured
 *   goal, status), not the last write. Re-evaluation stamps must not bump it, or
 *   the durable-ignore rule would treat every daily cron run as a user edit and
 *   the completion banner would come back forever.
 */
function mergeMemoryItem(
  items: AssistantMemoryItem[],
  userId: string,
  input: AssistantMemoryItemInput,
  now: Date
): AssistantMemoryItem[] {
  const itemIndex = items.findIndex((item) => item.id === input.id);
  const structuredGoal = input.category === 'goal' ? input.structuredGoal : undefined;

  const patch: Partial<AssistantMemoryItem> = {
    id: input.id,
    category: input.category,
    text: input.text,
    structuredGoal,
    updatedAt: now,
    ...(input.sourceThreadId !== undefined ? { sourceThreadId: input.sourceThreadId } : {}),
    ...(input.sourceMessageId !== undefined ? { sourceMessageId: input.sourceMessageId } : {}),
    ...(input.derivedFromContext !== undefined ? { derivedFromContext: input.derivedFromContext } : {}),
    ...(input.evidenceSummary !== undefined ? { evidenceSummary: input.evidenceSummary } : {}),
    ...(input.lastEvaluationAt !== undefined ? { lastEvaluationAt: input.lastEvaluationAt } : {}),
    ...(input.lastEvaluationResult !== undefined ? { lastEvaluationResult: input.lastEvaluationResult } : {}),
  };

  if (input.status !== undefined) {
    patch.status = input.status;
    // completedAt tracks an EXPLICIT status change: set on completion, cleared on any
    // other explicit change (reactivateGoal relies on passing completedAt: undefined).
    // A patch that never touches status must never touch completedAt either.
    patch.completedAt = input.status === 'completed' ? (input.completedAt ?? now) : undefined;
  }

  if (itemIndex >= 0) {
    const existing = items[itemIndex];
    const updated = { ...existing, ...patch };
    const contentChanged =
      updated.text !== existing.text ||
      updated.category !== existing.category ||
      updated.status !== existing.status ||
      !isSameStructuredGoal(updated.structuredGoal, existing.structuredGoal);

    if (!contentChanged) {
      updated.updatedAt = existing.updatedAt;
    }

    return items.map((item, idx) => (idx === itemIndex ? updated : item));
  }

  const created = {
    userId,
    createdAt: now,
    status: 'active' as const,
    ...patch,
  } as AssistantMemoryItem;
  return [created, ...items];
}

function mergeMemorySuggestion(
  suggestions: AssistantMemorySuggestion[],
  userId: string,
  input: AssistantMemorySuggestionInput,
  now: Date
): AssistantMemorySuggestion[] {
  const suggestionIndex = suggestions.findIndex((suggestion) => suggestion.id === input.id);
  const existing = suggestionIndex >= 0 ? suggestions[suggestionIndex] : undefined;
  const suggestion: AssistantMemorySuggestion = {
    id: input.id,
    userId,
    itemId: input.itemId,
    type: input.type,
    status: input.status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    evidenceSummary: input.evidenceSummary,
    evaluation: input.evaluation,
  };

  if (suggestionIndex >= 0) {
    return suggestions.map((s, idx) => (idx === suggestionIndex ? suggestion : s));
  }
  return [suggestion, ...suggestions];
}

export async function updateAssistantMemoryDocument(
  userId: string,
  updates: {
    preferences?: Partial<AssistantPreferences>;
    item?: AssistantMemoryItemInput;
    suggestion?: AssistantMemorySuggestionInput;
  }
): Promise<AssistantMemoryDocument> {
  const current = await getAssistantMemoryDocument(userId);
  const now = Timestamp.now();
  const preferences: AssistantPreferences = {
    ...current.preferences,
    ...updates.preferences,
  };

  const items = updates.item ? mergeMemoryItem(current.items, userId, updates.item, now.toDate()) : current.items;
  const suggestions = updates.suggestion
    ? mergeMemorySuggestion(current.suggestions, userId, updates.suggestion, now.toDate())
    : current.suggestions;

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
  };
}

export type AssistantMemoryMutation =
  | { kind: 'item'; item: AssistantMemoryItemInput }
  | { kind: 'suggestion'; suggestion: AssistantMemorySuggestionInput };

/**
 * Applies a batch of item/suggestion mutations to a user's memory document in ONE
 * Firestore transaction, instead of one read-modify-write Firestore round trip per
 * mutation. Consolidates `extractAndSaveMemory`'s ~10 writes per turn into one, and
 * the transaction also serializes correctly against a concurrent panel PATCH — the
 * previous get-then-set sequence could silently lose one side of the race.
 */
export async function applyAssistantMemoryMutations(
  userId: string,
  mutations: AssistantMemoryMutation[]
): Promise<AssistantMemoryDocument> {
  if (mutations.length === 0) {
    return getAssistantMemoryDocument(userId);
  }

  const memoryRef = adminDb.collection(MEMORY_COLLECTION).doc(userId);
  const syncedPreferences = await getSyncedAssistantPreferences(userId);

  return adminDb.runTransaction(async (tx) => {
    // The only read in this transaction — must precede the tx.set below.
    const snapshot = await tx.get(memoryRef);
    const data = snapshot.exists ? (snapshot.data() as DocumentData) : null;
    const storedPreferences = data?.preferences ?? {};
    const preferences: AssistantPreferences = {
      responseStyle: storedPreferences.responseStyle ?? syncedPreferences.responseStyle,
      includeMacroContext: storedPreferences.includeMacroContext ?? syncedPreferences.includeMacroContext,
      memoryEnabled: storedPreferences.memoryEnabled ?? syncedPreferences.memoryEnabled,
      includeDummySnapshots: storedPreferences.includeDummySnapshots ?? syncedPreferences.includeDummySnapshots,
    };

    let items: AssistantMemoryItem[] = Array.isArray(data?.items)
      ? data!.items.map((item: DocumentData) => mapMemoryItem(item, userId))
      : [];
    let suggestions: AssistantMemorySuggestion[] = Array.isArray(data?.suggestions)
      ? data!.suggestions.map((s: DocumentData) => mapMemorySuggestion(s, userId))
      : [];

    const now = Timestamp.now();
    for (const mutation of mutations) {
      if (mutation.kind === 'item') {
        items = mergeMemoryItem(items, userId, mutation.item, now.toDate());
      } else {
        suggestions = mergeMemorySuggestion(suggestions, userId, mutation.suggestion, now.toDate());
      }
    }

    tx.set(
      memoryRef,
      {
        preferences,
        items: items.map(serializeMemoryItem),
        suggestions: suggestions.map(serializeMemorySuggestion),
        updatedAt: now,
      },
      { merge: true }
    );

    return { preferences, items, suggestions, updatedAt: now.toDate() };
  });
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

export { buildThreadTitleFromPrompt };
