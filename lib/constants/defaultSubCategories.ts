import { AssetClass } from '@/types/assets';

/**
 * Sotto-categorie predefinite per ogni asset class
 * Queste verranno utilizzate come valori di default quando l'utente
 * abilita le sotto-categorie per una specifica asset class
 */
export const DEFAULT_SUB_CATEGORIES: Record<AssetClass, string[]> = {
  equity: [],
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
  trendFollowing: [],
  carry: [],
};

