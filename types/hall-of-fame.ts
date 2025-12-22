import { Timestamp } from 'firebase/firestore';

/**
 * Record di un singolo mese per la Hall of Fame
 */
export interface MonthlyRecord {
  year: number;
  month: number; // 1-12
  monthYear: string; // formato "MM/YYYY" per display
  netWorthDiff: number; // Differenza NW rispetto al mese precedente
  netWorthDiffPercentage: number; // Variazione % NW rispetto al mese precedente
  totalIncome: number; // Entrate del mese
  totalExpenses: number; // Spese del mese
  note?: string; // Nota opzionale dallo snapshot (max 500 chars)
}

/**
 * Record di un singolo anno per la Hall of Fame
 */
export interface YearlyRecord {
  year: number;
  netWorthDiff: number; // Differenza NW tra inizio e fine anno
  netWorthDiffPercentage: number; // Variazione % NW rispetto all'anno precedente
  totalIncome: number; // Entrate totali dell'anno
  totalExpenses: number; // Spese totali dell'anno
}

/**
 * Dati completi della Hall of Fame per un utente
 */
export interface HallOfFameData {
  userId: string;

  // Rankings Mensili (Top 20)
  bestMonthsByNetWorthGrowth: MonthlyRecord[]; // Migliori mesi per crescita NW
  bestMonthsByIncome: MonthlyRecord[]; // Migliori mesi per entrate
  worstMonthsByNetWorthDecline: MonthlyRecord[]; // Peggiori mesi per decremento NW
  worstMonthsByExpenses: MonthlyRecord[]; // Peggiori mesi per spese

  // Rankings Annuali (Top 10)
  bestYearsByNetWorthGrowth: YearlyRecord[]; // Migliori anni per crescita NW
  bestYearsByIncome: YearlyRecord[]; // Migliori anni per entrate
  worstYearsByNetWorthDecline: YearlyRecord[]; // Peggiori anni per decremento NW
  worstYearsByExpenses: YearlyRecord[]; // Peggiori anni per spese

  updatedAt: Date | Timestamp;
}
