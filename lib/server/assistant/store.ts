import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AssistantCreateThreadInput,
  AssistantMemoryDocument,
  AssistantMemoryItem,
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
  return mode === 'month_analysis' ? 'Nuova analisi mensile' : 'Nuova conversazione';
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
    mode: data.mode,
    pinnedMonth: data.pinnedMonth ?? null,
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
    sourceThreadId: doc.sourceThreadId,
    sourceMessageId: doc.sourceMessageId,
    createdAt: toDate(doc.createdAt),
    updatedAt: toDate(doc.updatedAt),
    status: doc.status,
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
    lastMessagePreview: '',
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

  await messageRef.set(messageData);

  return mapMessage(threadId, messageRef.id, messageData);
}

export async function updateAssistantThreadMetadata(
  threadId: string,
  updates: {
    title?: string;
    lastMessagePreview?: string;
    mode?: AssistantMode;
    pinnedMonth?: AssistantThread['pinnedMonth'];
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
      updatedAt: null,
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
    },
    items: Array.isArray(data.items)
      ? data.items.map((item: Record<string, any>) => mapMemoryItem(item, userId))
      : [],
    updatedAt: data.updatedAt ? toDate(data.updatedAt) : null,
  };
}

export async function updateAssistantMemoryDocument(
  userId: string,
  updates: {
    preferences?: Partial<AssistantPreferences>;
    item?: Partial<AssistantMemoryItem> & Pick<AssistantMemoryItem, 'id' | 'text' | 'category'>;
  }
): Promise<AssistantMemoryDocument> {
  const current = await getAssistantMemoryDocument(userId);
  const now = Timestamp.now();
  const preferences: AssistantPreferences = {
    ...current.preferences,
    ...updates.preferences,
  };

  const items = [...current.items];

  if (updates.item) {
    const itemIndex = items.findIndex((item) => item.id === updates.item!.id);
    const baseItem: AssistantMemoryItem = {
      id: updates.item.id,
      userId,
      category: updates.item.category,
      text: updates.item.text,
      sourceThreadId: updates.item.sourceThreadId,
      sourceMessageId: updates.item.sourceMessageId,
      createdAt: itemIndex >= 0 ? items[itemIndex].createdAt : now.toDate(),
      updatedAt: now.toDate(),
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

  const serializedItems = items.map((item) => ({
    ...item,
    createdAt: Timestamp.fromDate(item.createdAt),
    updatedAt: Timestamp.fromDate(item.updatedAt),
  }));

  await Promise.all([
    adminDb.collection(MEMORY_COLLECTION).doc(userId).set(
      {
        preferences,
        items: serializedItems,
        updatedAt: now,
      },
      { merge: true }
    ),
    syncAssistantPreferencesToSettings(userId, preferences),
  ]);

  return {
    preferences,
    items,
    updatedAt: now.toDate(),
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
      updatedAt: new Date(),
    };

    await adminDb.collection(MEMORY_COLLECTION).doc(userId).set(
      {
        preferences: cleared.preferences,
        items: [],
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

  await adminDb.collection(MEMORY_COLLECTION).doc(userId).set(
    {
      preferences: current.preferences,
      items: filteredItems.map((item) => ({
        ...item,
        createdAt: Timestamp.fromDate(item.createdAt),
        updatedAt: Timestamp.fromDate(item.updatedAt),
      })),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  return {
    preferences: current.preferences,
    items: filteredItems,
    updatedAt: new Date(),
  };
}

export { buildThreadTitleFromPrompt, getDefaultThreadTitle };
