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
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
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
    const netWorthDiffPercentage =
      previous.totalNetWorth !== 0 ? (netWorthDiff / previous.totalNetWorth) * 100 : 0;

    // Filter expenses for the current month to aggregate income/expense totals
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
      netWorthDiffPercentage,
      totalIncome,
      totalExpenses,
      ...(current.note && { note: current.note }),
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

  // Find the last snapshot of each year for percentage calculations
  const lastSnapshotsOfYear: Record<number, MonthlySnapshot> = {};
  for (const year in snapshotsByYear) {
    const snapshotsInYear = snapshotsByYear[year].sort((a, b) => b.month - a.month);
    if (snapshotsInYear.length > 0) {
      lastSnapshotsOfYear[year] = snapshotsInYear[0];
    }
  }

  const yearlyRecords: YearlyRecord[] = [];

  const sortedYears = Object.keys(snapshotsByYear)
    .map(Number)
    .sort((a, b) => a - b);

  for (const year of sortedYears) {
    const yearSnapshots = snapshotsByYear[year].sort((a, b) => a.month - b.month);

    if (yearSnapshots.length === 0) continue;

    const firstSnapshotOfYear = yearSnapshots[0];
    const lastSnapshotOfYear = yearSnapshots[yearSnapshots.length - 1];

    const previousYear = year - 1;
    const lastSnapshotOfPreviousYear = lastSnapshotsOfYear[previousYear];

    let netWorthDiff = 0;
    let netWorthDiffPercentage = 0;

    // Calculate year-over-year change if previous year's data exists
    if (lastSnapshotOfPreviousYear) {
      netWorthDiff = lastSnapshotOfYear.totalNetWorth - lastSnapshotOfPreviousYear.totalNetWorth;
      if (lastSnapshotOfPreviousYear.totalNetWorth !== 0) {
        netWorthDiffPercentage = (netWorthDiff / lastSnapshotOfPreviousYear.totalNetWorth) * 100;
      }
    } else {
      // For the first year, calculate change from the beginning to the end of the year
      netWorthDiff = lastSnapshotOfYear.totalNetWorth - firstSnapshotOfYear.totalNetWorth;
      if (firstSnapshotOfYear.totalNetWorth !== 0) {
        netWorthDiffPercentage = (netWorthDiff / firstSnapshotOfYear.totalNetWorth) * 100;
      }
    }

    // Filter all expenses for this year to calculate annual income/expense totals
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
      netWorthDiffPercentage,
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
