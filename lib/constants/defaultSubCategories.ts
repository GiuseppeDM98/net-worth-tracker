import { AssetClass } from '@/types/assets';

/**
 * Sotto-categorie predefinite per ogni asset class
 * Queste verranno utilizzate come valori di default quando l'utente
 * abilita le sotto-categorie per una specifica asset class
 */
export const DEFAULT_SUB_CATEGORIES: Record<AssetClass, string[]> = {
  equity: [
    'All-World',
    'Momentum',
    'Quality',
    'Value',
    'Pension',
    'Private Equity',
    'High Risk',
    'Single Stocks',
  ],
  bonds: [
    'Government Bonds',
    'Corporate Bonds',
  ],
  crypto: [
    'Bitcoin',
    'Altcoins',
  ],
  realestate: [
    'REIT',
    'Direct Property',
  ],
  cash: [],
  commodity: [
    'Gold',
    'Other Commodities',
  ],
};

/**
 * Target percentuali di default per le sotto-categorie equity
 */
export const DEFAULT_EQUITY_SUB_TARGETS: Record<string, number> = {
  'All-World': 40,
  'Momentum': 10,
  'Quality': 10,
  'Value': 10,
  'Pension': 15,
  'Private Equity': 5,
  'High Risk': 5,
  'Single Stocks': 5,
};
