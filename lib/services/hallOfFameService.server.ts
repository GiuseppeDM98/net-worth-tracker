import { adminDb } from '@/lib/firebase/admin';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { toDate } from '@/lib/utils/dateHelpers';
import {
  buildHallOfFameRankings,
  calculateMonthlyRecords,
  calculateYearlyRecords,
} from '@/lib/utils/hallOfFameRecords';

const COLLECTION_NAME = 'hall-of-fame';
const SNAPSHOTS_COLLECTION = 'monthly-snapshots';
const EXPENSES_COLLECTION = 'expenses';

/**
 * Recupera tutti gli snapshot per un utente (versione server-side)
 */
async function getUserSnapshotsServer(userId: string): Promise<MonthlySnapshot[]> {
  try {
    const snapshotsSnapshot = await adminDb
      .collection(SNAPSHOTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('year', 'asc')
      .orderBy('month', 'asc')
      .get();

    return snapshotsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: toDate(data.createdAt),
      };
    }) as MonthlySnapshot[];
  } catch (error) {
    console.error('Error getting snapshots (server):', error);
    throw error;
  }
}

/**
 * Recupera tutte le spese per un utente (versione server-side)
 */
async function getAllExpensesServer(userId: string): Promise<Expense[]> {
  try {
    const expensesSnapshot = await adminDb
      .collection(EXPENSES_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .get();

    return expensesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: toDate(data.date),
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      };
    }) as Expense[];
  } catch (error) {
    console.error('Error getting expenses (server):', error);
    throw error;
  }
}

/**
 * Aggiorna la Hall of Fame per un utente (versione server-side con Admin SDK)
 */
export async function updateHallOfFame(userId: string): Promise<void> {
  try {
    // Recupera tutti gli snapshot e le spese dell'utente
    const [snapshots, expenses] = await Promise.all([
      getUserSnapshotsServer(userId),
      getAllExpensesServer(userId),
    ]);

    // One definition of a record and of a ranking, shared with the client writer and the
    // periodic email (lib/utils/hallOfFameRecords.ts). This file owns the Admin-SDK I/O only.
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);
    const hallOfFameData = {
      userId,
      ...buildHallOfFameRankings(monthlyRecords, yearlyRecords),
      updatedAt: new Date(),
    };

    // Preserve existing notes when recalculating rankings
    // Critical: Notes must not be lost during ranking updates (which happen after every new snapshot)
    // Pattern: GET existing → merge notes → SET complete doc
    const existingDocRef = adminDb.collection(COLLECTION_NAME).doc(userId);
    const existingDoc = await existingDocRef.get();
    const existingNotes = existingDoc.exists ? existingDoc.data()?.notes || [] : [];

    // Salva su Firebase usando Admin SDK, preserving notes
    await existingDocRef.set({
      ...hallOfFameData,
      notes: existingNotes, // Preserve user notes during recalculation
    });

    console.log(`Hall of Fame updated for user ${userId} (server-side)`);
  } catch (error) {
    console.error('Error updating Hall of Fame (server):', error);
    throw error;
  }
}
