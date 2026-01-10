import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { HallOfFameData, MonthlyRecord, YearlyRecord } from '@/types/hall-of-fame';
import { MonthlySnapshot } from '@/types/assets';
import { calculateTotalIncome, calculateTotalExpenses } from './expenseService';
import { Expense } from '@/types/expenses';
import { getItalyMonthYear, getItalyYear } from '@/lib/utils/dateHelpers';

const COLLECTION_NAME = 'hall-of-fame';
const SNAPSHOTS_COLLECTION = 'monthly-snapshots';
const EXPENSES_COLLECTION = 'expenses';
const MAX_MONTHLY_RECORDS = 20;
const MAX_YEARLY_RECORDS = 10;

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
        createdAt: data.createdAt?.toDate() || new Date(),
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
        date: data.date?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    }) as Expense[];
  } catch (error) {
    console.error('Error getting expenses (server):', error);
    throw error;
  }
}

/**
 * Formatta mese e anno in formato MM/YYYY
 */
function formatMonthYear(month: number, year: number): string {
  return `${month.toString().padStart(2, '0')}/${year}`;
}

/**
 * Calcola i record mensili da tutti gli snapshot
 */
function calculateMonthlyRecords(
  snapshots: MonthlySnapshot[],
  expenses: Expense[]
): MonthlyRecord[] {
  // Ordina snapshot per data (più vecchio prima)
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const monthlyRecords: MonthlyRecord[] = [];

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const current = sortedSnapshots[i];
    const previous = sortedSnapshots[i - 1];

    // Calcola differenza NW
    const netWorthDiff = current.totalNetWorth - previous.totalNetWorth;
    const previousNetWorth = previous.totalNetWorth;

    // Filtra spese del mese corrente
    const monthExpenses = expenses.filter(expense => {
      const expenseDate = expense.date instanceof Date
        ? expense.date
        : expense.date.toDate();
      const { month, year } = getItalyMonthYear(expenseDate);
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
      ...(current.note && { note: current.note }),
    });
  }

  return monthlyRecords;
}

/**
 * Calcola i record annuali da tutti gli snapshot
 */
function calculateYearlyRecords(
  snapshots: MonthlySnapshot[],
  expenses: Expense[]
): YearlyRecord[] {
  // Raggruppa snapshot per anno
  const snapshotsByYear = snapshots.reduce((acc, snapshot) => {
    if (!acc[snapshot.year]) {
      acc[snapshot.year] = [];
    }
    acc[snapshot.year].push(snapshot);
    return acc;
  }, {} as Record<number, MonthlySnapshot[]>);

  const yearlyRecords: YearlyRecord[] = [];

  for (const [yearStr, yearSnapshots] of Object.entries(snapshotsByYear)) {
    const year = parseInt(yearStr);

    // Ordina per mese
    const sorted = yearSnapshots.sort((a, b) => a.month - b.month);

    // Controlla se abbiamo almeno gennaio e un altro mese per calcolare la differenza
    if (sorted.length < 2) continue;

    const firstSnapshot = sorted[0];
    const lastSnapshot = sorted[sorted.length - 1];

    // Calcola differenza NW annuale
    const netWorthDiff = lastSnapshot.totalNetWorth - firstSnapshot.totalNetWorth;
    const startOfYearNetWorth = firstSnapshot.totalNetWorth;

    // Filtra spese dell'anno
    const yearExpenses = expenses.filter(expense => {
      const expenseDate = expense.date instanceof Date
        ? expense.date
        : expense.date.toDate();
      return getItalyYear(expenseDate) === year;
    });

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
 * Aggiorna la Hall of Fame per un utente (versione server-side con Admin SDK)
 */
export async function updateHallOfFame(userId: string): Promise<void> {
  try {
    // Recupera tutti gli snapshot e le spese dell'utente
    const [snapshots, expenses] = await Promise.all([
      getUserSnapshotsServer(userId),
      getAllExpensesServer(userId),
    ]);

    // Calcola record mensili e annuali
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);

    // Crea i ranking
    const hallOfFameData = {
      userId,

      // Migliori mesi per crescita NW (ordinati per netWorthDiff decrescente)
      bestMonthsByNetWorthGrowth: [...monthlyRecords]
        .filter(r => r.netWorthDiff > 0)
        .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Migliori mesi per entrate
      bestMonthsByIncome: [...monthlyRecords]
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Peggiori mesi per decremento NW (ordinati per netWorthDiff crescente, cioè valori più negativi)
      worstMonthsByNetWorthDecline: [...monthlyRecords]
        .filter(r => r.netWorthDiff < 0)
        .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Peggiori mesi per spese
      worstMonthsByExpenses: [...monthlyRecords]
        .sort((a, b) => b.totalExpenses - a.totalExpenses)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Migliori anni per crescita NW
      bestYearsByNetWorthGrowth: [...yearlyRecords]
        .filter(r => r.netWorthDiff > 0)
        .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
        .slice(0, MAX_YEARLY_RECORDS),

      // Migliori anni per entrate
      bestYearsByIncome: [...yearlyRecords]
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, MAX_YEARLY_RECORDS),

      // Peggiori anni per decremento NW
      worstYearsByNetWorthDecline: [...yearlyRecords]
        .filter(r => r.netWorthDiff < 0)
        .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
        .slice(0, MAX_YEARLY_RECORDS),

      // Peggiori anni per spese
      worstYearsByExpenses: [...yearlyRecords]
        .sort((a, b) => b.totalExpenses - a.totalExpenses)
        .slice(0, MAX_YEARLY_RECORDS),

      updatedAt: Timestamp.now(),
    };

    // Salva su Firebase usando Admin SDK
    await adminDb.collection(COLLECTION_NAME).doc(userId).set(hallOfFameData);

    console.log(`Hall of Fame updated for user ${userId} (server-side)`);
  } catch (error) {
    console.error('Error updating Hall of Fame (server):', error);
    throw error;
  }
}
