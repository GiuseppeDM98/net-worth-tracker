// Shared constants for Hall of Fame — imported by page, the two note windows and the summary
// layer, so a ranking is named the same way everywhere a note mentions it.
import type { HallOfFameSectionKey } from '@/types/hall-of-fame';

/**
 * A ranking's name, in the tiles' own vocabulary: the eyebrow's subject plus the period.
 * Until 2026-09-24 these were «Miglior Mese: Crescita Patrimonio» — a Title-Case label with a
 * colon that matched no tile, no pill and no verdict, so a note's reader met a third name for
 * the ranking they had just left.
 */
export const SECTION_LABELS: Record<HallOfFameSectionKey, string> = {
  bestMonthsByNetWorthGrowth: 'Crescita del patrimonio · mese',
  bestMonthsByIncome: 'Entrate · mese',
  worstMonthsByNetWorthDecline: 'Calo del patrimonio · mese',
  worstMonthsByExpenses: 'Spese · mese',
  bestMonthsBySavings: 'Risparmio · mese',
  bestYearsByNetWorthGrowth: 'Crescita del patrimonio · anno',
  bestYearsByIncome: 'Entrate · anno',
  worstYearsByNetWorthDecline: 'Calo del patrimonio · anno',
  worstYearsByExpenses: 'Spese · anno',
  bestYearsBySavings: 'Risparmio · anno',
};

/** The same names without the period, for a list already grouped under «mensili» / «annuali». */
export const SECTION_SUBJECTS: Record<HallOfFameSectionKey, string> = {
  bestMonthsByNetWorthGrowth: 'Crescita del patrimonio',
  bestMonthsByIncome: 'Entrate',
  worstMonthsByNetWorthDecline: 'Calo del patrimonio',
  worstMonthsByExpenses: 'Spese',
  bestMonthsBySavings: 'Risparmio',
  bestYearsByNetWorthGrowth: 'Crescita del patrimonio',
  bestYearsByIncome: 'Entrate',
  worstYearsByNetWorthDecline: 'Calo del patrimonio',
  worstYearsByExpenses: 'Spese',
  bestYearsBySavings: 'Risparmio',
};

export const MONTHLY_SECTION_KEYS: HallOfFameSectionKey[] = [
  'bestMonthsByNetWorthGrowth',
  'bestMonthsByIncome',
  'worstMonthsByNetWorthDecline',
  'worstMonthsByExpenses',
  'bestMonthsBySavings',
];

export const YEARLY_SECTION_KEYS: HallOfFameSectionKey[] = [
  'bestYearsByNetWorthGrowth',
  'bestYearsByIncome',
  'worstYearsByNetWorthDecline',
  'worstYearsByExpenses',
  'bestYearsBySavings',
];
