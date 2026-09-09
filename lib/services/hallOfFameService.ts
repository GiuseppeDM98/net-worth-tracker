/**
 * Hall of Fame Service
 *
 * The client-side writer and reader of `hall-of-fame/{userId}`, plus the note CRUD.
 *
 * It owns the I/O and NOTHING else: what a record is, and what a ranking is, live in the pure
 * `lib/utils/hallOfFameRecords.ts` — the same module the server writer
 * (`hallOfFameService.server.ts`) and the periodic email use. This file used to carry its own
 * copy of the record builders, which is exactly how the app and the email drift apart.
 *
 * Rankings are pre-calculated on write so the page reads one document instead of the whole
 * history; the page's own reading layer is `lib/utils/hallOfFameSummary.ts`.
 */

import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { HallOfFameData, HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { getUserSnapshots } from './snapshotService';
import { getAllExpenses } from './expenseService';
import { toDate } from '@/lib/utils/dateHelpers';
import {
  buildHallOfFameRankings,
  calculateMonthlyRecords,
  calculateYearlyRecords,
} from '@/lib/utils/hallOfFameRecords';

const COLLECTION_NAME = 'hall-of-fame';

/**
 * Fetch Hall of Fame data for a user
 *
 * Returns pre-calculated rankings of best/worst months and years
 * based on net worth growth, income, and expenses.
 *
 * @param userId - The user ID to fetch data for
 * @returns Hall of Fame data or null if not found
 */
export async function getHallOfFameData(userId: string): Promise<HallOfFameData | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      ...data,
      updatedAt: toDate(data.updatedAt),
    } as HallOfFameData;
  } catch (error) {
    console.error('Error fetching Hall of Fame data:', error);
    throw error;
  }
}

/**
 * Recalculate and store every ranking for a user.
 *
 * Called after a snapshot is created from the Panoramica; the daily cron and the recalculate
 * route use the Admin-SDK twin. Existing notes are read back and re-written untouched: a
 * ranking update must never cost the user a note.
 *
 * @param userId - The user ID to update Hall of Fame for
 */
export async function updateHallOfFame(userId: string): Promise<void> {
  try {
    // Fetch all snapshots and expenses to calculate comprehensive rankings
    const [snapshots, expenses] = await Promise.all([
      getUserSnapshots(userId),
      getAllExpenses(userId),
    ]);

    // The record definition and every ranking live in ONE pure module, shared with the
    // server writer and the periodic email: a second copy here drifted the moment either changed.
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);
    const hallOfFameData = {
      userId,
      ...buildHallOfFameRankings(monthlyRecords, yearlyRecords),
      updatedAt: new Date(),
    };

    // GET existing document to preserve notes
    // Critical: User notes must be preserved during ranking updates
    // Pattern copied from server-side hallOfFameService.server.ts
    const docRef = doc(db, COLLECTION_NAME, userId);
    const existingDoc = await getDoc(docRef);
    const existingNotes = existingDoc.exists()
      ? (existingDoc.data()?.notes || [])
      : [];

    // SET with notes preservation
    await setDoc(docRef, {
      ...hallOfFameData,
      notes: existingNotes,  // Preserve user notes during ranking update
    });

    console.log(`Hall of Fame updated for user ${userId}`);
  } catch (error) {
    console.error('Error updating Hall of Fame:', error);
    throw error;
  }
}

/**
 * Get notes for a specific period and section
 *
 * Filters the notes array to find notes matching a specific section, year, and optional month.
 * Used by NoteIconCell to determine if note icon should be displayed.
 *
 * @param notes - All notes array from HallOfFameData
 * @param section - Section key to filter by (e.g., 'bestMonthsByNetWorthGrowth')
 * @param year - Year to match (Italy timezone)
 * @param month - Optional month to match (1-12, undefined for yearly notes)
 * @returns Array of matching notes (typically 0 or 1 in normal usage)
 */
export function getNotesForPeriod(
  notes: HallOfFameNote[],
  section: HallOfFameSectionKey,
  year: number,
  month?: number
): HallOfFameNote[] {
  return notes.filter(
    (note) => note.year === year && note.month === month && note.sections.includes(section)
  );
}

/**
 * Add a new Hall of Fame note
 *
 * Creates a new note with UUID and timestamps, then appends it to the notes array.
 * Pattern: GET existing doc → add to notes array → setDoc (no merge)
 *
 * Why no merge: Firestore recursive merge prevents array element deletion.
 * Following pattern from assetAllocationService.ts (lines 68-139).
 *
 * @param userId - User ID
 * @param noteData - Note details (text, sections, year, optional month)
 * @returns The created note with generated ID and timestamps
 * @throws Error if Hall of Fame data not found or validation fails
 */
export async function addHallOfFameNote(
  userId: string,
  noteData: {
    text: string;
    sections: HallOfFameSectionKey[];
    year: number;
    month?: number;
  }
): Promise<HallOfFameNote> {
  try {
    // Validate text length (max 500 characters)
    const trimmedText = noteData.text.trim();
    if (trimmedText.length === 0) {
      throw new Error('Note text cannot be empty');
    }
    if (trimmedText.length > 500) {
      throw new Error('Note text cannot exceed 500 characters');
    }

    // Validate sections array (at least 1 section required)
    if (noteData.sections.length === 0) {
      throw new Error('At least one section must be selected');
    }

    // Generate new note with UUID and timestamps
    const newNote: HallOfFameNote = {
      id: crypto.randomUUID(), // Built-in browser API, RFC 4122 compliant
      text: trimmedText,
      sections: noteData.sections,
      year: noteData.year,
      month: noteData.month,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // GET existing document
    const docRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Hall of Fame data not found. Create a snapshot first.');
    }

    const existingData = docSnap.data() as HallOfFameData;

    // Modify notes array in memory
    const updatedNotes = [...(existingData.notes || []), newNote];

    // SET complete document (no merge - critical for nested objects)
    await setDoc(docRef, {
      ...existingData,
      notes: updatedNotes,
      updatedAt: new Date(),
    });

    return newNote;
  } catch (error) {
    console.error('Error adding Hall of Fame note:', error);
    throw error;
  }
}

/**
 * Update an existing Hall of Fame note
 *
 * Finds note by ID and updates text and/or sections.
 * Year and month are immutable (to update period, delete and recreate note).
 * Pattern: GET → find & replace → setDoc (no merge)
 *
 * @param userId - User ID
 * @param noteId - UUID of the note to update
 * @param updates - Fields to update (text and/or sections)
 * @throws Error if Hall of Fame data or note not found
 */
export async function updateHallOfFameNote(
  userId: string,
  noteId: string,
  updates: {
    text?: string;
    sections?: HallOfFameSectionKey[];
  }
): Promise<void> {
  try {
    // Validate text length if provided
    if (updates.text !== undefined) {
      const trimmedText = updates.text.trim();
      if (trimmedText.length === 0) {
        throw new Error('Note text cannot be empty');
      }
      if (trimmedText.length > 500) {
        throw new Error('Note text cannot exceed 500 characters');
      }
      updates.text = trimmedText;
    }

    // Validate sections array if provided
    if (updates.sections !== undefined && updates.sections.length === 0) {
      throw new Error('At least one section must be selected');
    }

    // GET existing document
    const docRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Hall of Fame data not found');
    }

    const existingData = docSnap.data() as HallOfFameData;
    const notes = existingData.notes || [];

    // Find and update the note
    const noteIndex = notes.findIndex((n) => n.id === noteId);
    if (noteIndex === -1) {
      throw new Error('Note not found');
    }

    const updatedNotes = [...notes];
    updatedNotes[noteIndex] = {
      ...updatedNotes[noteIndex],
      ...updates,
      updatedAt: new Date(),
    };

    // SET complete document (no merge)
    await setDoc(docRef, {
      ...existingData,
      notes: updatedNotes,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating Hall of Fame note:', error);
    throw error;
  }
}

/**
 * Delete a Hall of Fame note
 *
 * Removes note from the notes array by filtering out the matching ID.
 * Pattern: GET → filter out → setDoc (no merge)
 *
 * @param userId - User ID
 * @param noteId - UUID of the note to delete
 * @throws Error if Hall of Fame data not found
 */
export async function deleteHallOfFameNote(userId: string, noteId: string): Promise<void> {
  try {
    // GET existing document
    const docRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Hall of Fame data not found');
    }

    const existingData = docSnap.data() as HallOfFameData;
    const notes = existingData.notes || [];

    // Filter out the note
    const updatedNotes = notes.filter((n) => n.id !== noteId);

    // SET complete document (no merge)
    await setDoc(docRef, {
      ...existingData,
      notes: updatedNotes,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error deleting Hall of Fame note:', error);
    throw error;
  }
}
