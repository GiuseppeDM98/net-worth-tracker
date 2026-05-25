// Shared constants for Hall of Fame — imported by page, NoteDialog, and NoteViewDialog
// to eliminate the three duplicate SECTION_LABELS / ITALIAN_MONTHS declarations.
import type { HallOfFameSectionKey } from '@/types/hall-of-fame';

export const SECTION_LABELS: Record<HallOfFameSectionKey, string> = {
  bestMonthsByNetWorthGrowth:  'Miglior Mese: Crescita Patrimonio',
  bestMonthsByIncome:          'Miglior Mese: Entrate',
  worstMonthsByNetWorthDecline:'Peggior Mese: Calo Patrimonio',
  worstMonthsByExpenses:       'Peggior Mese: Spese',
  bestYearsByNetWorthGrowth:   'Miglior Anno: Crescita Patrimonio',
  bestYearsByIncome:           'Miglior Anno: Entrate',
  worstYearsByNetWorthDecline: 'Peggior Anno: Calo Patrimonio',
  worstYearsByExpenses:        'Peggior Anno: Spese',
};

export const MONTHLY_SECTION_KEYS: HallOfFameSectionKey[] = [
  'bestMonthsByNetWorthGrowth',
  'bestMonthsByIncome',
  'worstMonthsByNetWorthDecline',
  'worstMonthsByExpenses',
];

export const YEARLY_SECTION_KEYS: HallOfFameSectionKey[] = [
  'bestYearsByNetWorthGrowth',
  'bestYearsByIncome',
  'worstYearsByNetWorthDecline',
  'worstYearsByExpenses',
];
