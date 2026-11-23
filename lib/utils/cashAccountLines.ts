/**
 * The cash accounts as the AI blocks print them: a module of its own, so the Assistente's register
 * context reads it without the whole cashflow block (lib/utils/cashflowBlock.ts re-exports it). With
 * the block imported by a client hook too, Turbopack kept the block whole in the Assistente's first
 * chunk (2026-11-17, doc/guide/velocita.md § Registro dei tetti alzati).
 */
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import { isCashAccount } from '@/types/assets';

export interface CashAccountLine { id: string; name: string; balance: number; roles: ('addebito' | 'accredito')[] }

/**
 * EVERY cash account (`isCashAccount`: a money-market ETF with `assetClass: 'cash'` is an instrument,
 * not an account), a closed one included — the register's account list names it too. The balance is
 * the Patrimonio's (`assetValueOf`), the roles are the two default accounts of the expense form.
 */
export function buildCashAccountLines(
  assets: readonly Asset[],
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId'> | null,
  assetValueOf: (asset: Asset) => number,
): CashAccountLine[] {
  return assets
    .filter(isCashAccount)
    .map((asset) => {
      const roles: CashAccountLine['roles'] = [];
      if (settings?.defaultDebitCashAssetId === asset.id) roles.push('addebito');
      if (settings?.defaultCreditCashAssetId === asset.id) roles.push('accredito');
      return { id: asset.id, name: asset.name?.trim() || asset.id, balance: assetValueOf(asset), roles };
    })
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'it'));
}
