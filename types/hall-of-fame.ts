import { Timestamp } from 'firebase/firestore';

/**
 * Type union for Hall of Fame section identifiers
 *
 * Provides type-safe keys for all ranking categories (monthly and yearly).
 * Used to associate notes with specific sections and prevent typos.
 */
export type HallOfFameSectionKey =
  | 'bestMonthsByNetWorthGrowth'
  | 'bestMonthsByIncome'
  | 'worstMonthsByNetWorthDecline'
  | 'worstMonthsByExpenses'
  | 'bestYearsByNetWorthGrowth'
  | 'bestYearsByIncome'
  | 'worstYearsByNetWorthDecline'
  | 'worstYearsByExpenses';

/**
 * Dedicated Hall of Fame note
 *
 * Independent note system for Hall of Fame rankings (not related to History snapshot notes).
 * Each note can be associated with multiple sections (e.g., same event affects both
 * "worst months by expenses" and "worst months by net worth decline").
 *
 * Lifecycle:
 * - Created when user manually adds note for a specific period
 * - Persists even if period drops out of top rankings (data preservation)
 * - Displayed only in tables where period is currently ranked AND section is selected
 *
 * Storage:
 * - Stored as array in hall-of-fame/{userId} document
 * - Max ~100-200 notes expected per user (no pagination needed)
 */
export interface HallOfFameNote {
  id: string; // UUID generated with crypto.randomUUID() (RFC 4122)
  text: string; // Note text (max 500 characters)
  sections: HallOfFameSectionKey[]; // Ranking sections where this note should appear
  year: number; // Year in Italy timezone (via getItalyYear)
  month?: number; // Month 1-12 in Italy timezone (undefined for yearly notes)
  createdAt: Date | Timestamp; // Creation timestamp
  updatedAt: Date | Timestamp; // Last update timestamp
}

/**
 * Record di un singolo mese per la Hall of Fame
 */
export interface MonthlyRecord {
  year: number;
  month: number; // 1-12
  monthYear: string; // formato "MM/YYYY" per display
  netWorthDiff: number; // Differenza NW rispetto al mese precedente (current - previous). Positivo = crescita, negativo = decremento.
  previousNetWorth: number; // Valore NW del mese precedente (per calcolo %)
  totalIncome: number; // Entrate del mese
  totalExpenses: number; // Spese del mese
}

/**
 * Record di un singolo anno per la Hall of Fame
 */
export interface YearlyRecord {
  year: number;
  netWorthDiff: number; // Differenza NW tra inizio e fine anno
  startOfYearNetWorth: number; // Valore NW a inizio anno (per calcolo %)
  totalIncome: number; // Entrate totali dell'anno
  totalExpenses: number; // Spese totali dell'anno
}

/**
 * Dati completi della Hall of Fame per un utente
 */
export interface HallOfFameData {
  userId: string;

  // Dedicated notes system (independent from History snapshot notes)
  notes: HallOfFameNote[]; // All notes for this user, with multi-section support

  // Rankings Mensili (Top 20 - numero maggiore per visualizzazione dettagliata mese per mese)
  bestMonthsByNetWorthGrowth: MonthlyRecord[]; // Migliori mesi per crescita NW
  bestMonthsByIncome: MonthlyRecord[]; // Migliori mesi per entrate
  worstMonthsByNetWorthDecline: MonthlyRecord[]; // Peggiori mesi per decremento NW
  worstMonthsByExpenses: MonthlyRecord[]; // Peggiori mesi per spese

  // Rankings Annuali (Top 10 - numero minore per focus sui trend annuali più significativi)
  bestYearsByNetWorthGrowth: YearlyRecord[]; // Migliori anni per crescita NW
  bestYearsByIncome: YearlyRecord[]; // Migliori anni per entrate
  worstYearsByNetWorthDecline: YearlyRecord[]; // Peggiori anni per decremento NW
  worstYearsByExpenses: YearlyRecord[]; // Peggiori anni per spese

  updatedAt: Date | Timestamp;
}
