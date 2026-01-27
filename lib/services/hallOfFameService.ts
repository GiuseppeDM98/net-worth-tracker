/**
 * Hall of Fame Service
 *
 * Calculates and stores portfolio performance rankings (best/worst months and years).
 *
 * Features:
 * - Monthly rankings: Net worth growth, income, expenses (top 20)
 * - Yearly rankings: Annual performance metrics (top 10)
 * - Current period highlighting: Identifies if current month/year is in top rankings
 * - Pre-calculated data: Rankings stored in Firestore for fast retrieval
 *
 * Calculation logic:
 * - Monthly: Month-over-month net worth change + income/expense totals for that month
 * - Yearly: Year-over-year net worth change + annual income/expense totals
 */

import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { HallOfFameData, MonthlyRecord, YearlyRecord, HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { MonthlySnapshot } from '@/types/assets';
import { getUserSnapshots } from './snapshotService';
import { getAllExpenses, calculateTotalIncome, calculateTotalExpenses } from './expenseService';
import { Expense } from '@/types/expenses';
import { getItalyMonthYear, getItalyYear, toDate } from '@/lib/utils/dateHelpers';

const COLLECTION_NAME = 'hall-of-fame';
const MAX_MONTHLY_RECORDS = 20;
const MAX_YEARLY_RECORDS = 10;

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
 * Format month and year as MM/YYYY string
 *
 * @param month - Month number (1-12)
 * @param year - Year number
 * @returns Formatted string in MM/YYYY format
 */
function formatMonthYear(month: number, year: number): string {
  return `${month.toString().padStart(2, '0')}/${year}`;
}

/**
 * Calculate monthly records from all snapshots
 *
 * Computes month-over-month net worth changes and aggregates
 * income/expenses for each month to identify best/worst periods.
 *
 * @param snapshots - All monthly snapshots for the user
 * @param expenses - All expenses for the user
 * @returns Array of monthly records with net worth diff and expense totals
 */
function calculateMonthlyRecords(
  snapshots: MonthlySnapshot[],
  expenses: Expense[]
): MonthlyRecord[] {
  // Sort snapshots chronologically (oldest first) to calculate month-over-month changes
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const monthlyRecords: MonthlyRecord[] = [];

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const current = sortedSnapshots[i];
    const previous = sortedSnapshots[i - 1];

    // Calculate net worth difference between consecutive months
    const netWorthDiff = current.totalNetWorth - previous.totalNetWorth;
    const previousNetWorth = previous.totalNetWorth;

    // Filter expenses for the current month to aggregate income/expense totals
    const monthExpenses = expenses.filter(expense => {
      const { month, year } = getItalyMonthYear(toDate(expense.date));
      return year === current.year && month === current.month;
    });

    const totalIncome = calculateTotalIncome(monthExpenses);
    const totalExpenses = Math.abs(calculateTotalExpenses(monthExpenses));

    monthlyRecords.push({
      year: current.year,
      month: current.month,
      monthYear: formatMonthYear(current.month, current.year),
      netWorthDiff,
      previousNetWorth,
      totalIncome,
      totalExpenses,
    });
  }

  return monthlyRecords;
}

/**
 * Calculate yearly records from all snapshots
 *
 * Aggregates snapshots by year to compute year-over-year net worth
 * changes and total income/expenses for ranking best/worst years.
 *
 * @param snapshots - All monthly snapshots for the user
 * @param expenses - All expenses for the user
 * @returns Array of yearly records with annual net worth diff and totals
 */
function calculateYearlyRecords(
  snapshots: MonthlySnapshot[],
  expenses: Expense[]
): YearlyRecord[] {
  // Group snapshots by year to aggregate annual data
  const snapshotsByYear = snapshots.reduce((acc, snapshot) => {
    if (!acc[snapshot.year]) {
      acc[snapshot.year] = [];
    }
    acc[snapshot.year].push(snapshot);
    return acc;
  }, {} as Record<number, MonthlySnapshot[]>);

  const expensesByYear = expenses.reduce((acc, expense) => {
    const year = getItalyYear(toDate(expense.date));
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(expense);
    return acc;
  }, {} as Record<number, Expense[]>);

  const yearlyRecords: YearlyRecord[] = [];
  const years = new Set<number>([
    ...Object.keys(snapshotsByYear).map(Number),
    ...Object.keys(expensesByYear).map(Number),
  ]);

  for (const year of Array.from(years).sort((a, b) => a - b)) {
    const yearSnapshots = snapshotsByYear[year] ?? [];
    const sorted = [...yearSnapshots].sort((a, b) => a.month - b.month);
    const hasNetWorthData = sorted.length >= 2;
    const firstSnapshot = sorted[0];
    const lastSnapshot = sorted[sorted.length - 1];
    const netWorthDiff = hasNetWorthData ? lastSnapshot.totalNetWorth - firstSnapshot.totalNetWorth : 0;
    const startOfYearNetWorth = hasNetWorthData ? firstSnapshot.totalNetWorth : 0;
    const yearExpenses = expensesByYear[year] ?? [];
    const totalIncome = calculateTotalIncome(yearExpenses);
    const totalExpenses = Math.abs(calculateTotalExpenses(yearExpenses));

    yearlyRecords.push({
      year,
      netWorthDiff,
      startOfYearNetWorth,
      totalIncome,
      totalExpenses,
    });
  }

  return yearlyRecords;
}

/**
 * Update Hall of Fame rankings for a user
 *
 * Recalculates all monthly and yearly records from snapshots and expenses,
 * then generates Top 20 monthly and Top 10 yearly rankings across categories:
 * - Best/worst months and years by net worth growth/decline
 * - Best months and years by income
 * - Worst months and years by expenses
 *
 * This should be called after each new monthly snapshot is created.
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

    // Calculate monthly and yearly records from raw data
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);

    // Create rankings by sorting records across different dimensions
    const hallOfFameData: HallOfFameData = {
      userId,
      notes: [], // Initialize empty notes array (notes managed separately via CRUD operations)

      // Best months by net worth growth (sorted descending by netWorthDiff)
      bestMonthsByNetWorthGrowth: [...monthlyRecords]
        .filter(r => r.netWorthDiff > 0)
        .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Best months by income
      bestMonthsByIncome: [...monthlyRecords]
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Worst months by net worth decline (sorted ascending, i.e., most negative values first)
      worstMonthsByNetWorthDecline: [...monthlyRecords]
        .filter(r => r.netWorthDiff < 0)
        .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Worst months by expenses
      worstMonthsByExpenses: [...monthlyRecords]
        .sort((a, b) => b.totalExpenses - a.totalExpenses)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Best years by net worth growth
      bestYearsByNetWorthGrowth: [...yearlyRecords]
        .filter(r => r.netWorthDiff > 0)
        .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
        .slice(0, MAX_YEARLY_RECORDS),

      // Best years by income
      bestYearsByIncome: [...yearlyRecords]
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, MAX_YEARLY_RECORDS),

      // Worst years by net worth decline
      worstYearsByNetWorthDecline: [...yearlyRecords]
        .filter(r => r.netWorthDiff < 0)
        .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
        .slice(0, MAX_YEARLY_RECORDS),

      // Worst years by expenses
      worstYearsByExpenses: [...yearlyRecords]
        .sort((a, b) => b.totalExpenses - a.totalExpenses)
        .slice(0, MAX_YEARLY_RECORDS),

      updatedAt: Timestamp.now(),
    };

    // Salva su Firebase
    const docRef = doc(db, COLLECTION_NAME, userId);
    await setDoc(docRef, hallOfFameData);

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
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
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
      updatedAt: Timestamp.now(),
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
      updatedAt: Timestamp.now(),
    };

    // SET complete document (no merge)
    await setDoc(docRef, {
      ...existingData,
      notes: updatedNotes,
      updatedAt: Timestamp.now(),
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
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error deleting Hall of Fame note:', error);
    throw error;
  }
}
