import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { HallOfFameData, MonthlyRecord, YearlyRecord } from '@/types/hall-of-fame';
import { MonthlySnapshot } from '@/types/assets';
import { getUserSnapshots } from './snapshotService';
import { getAllExpenses, calculateTotalIncome, calculateTotalExpenses } from './expenseService';
import { Expense } from '@/types/expenses';

const COLLECTION_NAME = 'hall-of-fame';
const MAX_MONTHLY_RECORDS = 20;
const MAX_YEARLY_RECORDS = 10;

/**
 * Recupera i dati Hall of Fame per un utente
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
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
    } as HallOfFameData;
  } catch (error) {
    console.error('Error fetching Hall of Fame data:', error);
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

    // Filtra spese del mese corrente
    const monthExpenses = expenses.filter(expense => {
      const expenseDate = expense.date instanceof Date
        ? expense.date
        : expense.date.toDate();
      return expenseDate.getFullYear() === current.year &&
             expenseDate.getMonth() + 1 === current.month;
    });

    const totalIncome = calculateTotalIncome(monthExpenses);
    const totalExpenses = Math.abs(calculateTotalExpenses(monthExpenses));

    monthlyRecords.push({
      year: current.year,
      month: current.month,
      monthYear: formatMonthYear(current.month, current.year),
      netWorthDiff,
      totalIncome,
      totalExpenses,
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

    // Filtra spese dell'anno
    const yearExpenses = expenses.filter(expense => {
      const expenseDate = expense.date instanceof Date
        ? expense.date
        : expense.date.toDate();
      return expenseDate.getFullYear() === year;
    });

    const totalIncome = calculateTotalIncome(yearExpenses);
    const totalExpenses = Math.abs(calculateTotalExpenses(yearExpenses));

    yearlyRecords.push({
      year,
      netWorthDiff,
      totalIncome,
      totalExpenses,
    });
  }

  return yearlyRecords;
}

/**
 * Aggiorna la Hall of Fame per un utente
 */
export async function updateHallOfFame(userId: string): Promise<void> {
  try {
    // Recupera tutti gli snapshot e le spese dell'utente
    const [snapshots, expenses] = await Promise.all([
      getUserSnapshots(userId),
      getAllExpenses(userId),
    ]);

    // Calcola record mensili e annuali
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);

    // Crea i ranking
    const hallOfFameData: HallOfFameData = {
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

    // Salva su Firebase
    const docRef = doc(db, COLLECTION_NAME, userId);
    await setDoc(docRef, hallOfFameData);

    console.log(`Hall of Fame updated for user ${userId}`);
  } catch (error) {
    console.error('Error updating Hall of Fame:', error);
    throw error;
  }
}
