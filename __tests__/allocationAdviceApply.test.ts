/**
 * What «Applica» would write (lib/utils/allocationAdviceApply.ts): the targets document from
 * the proposal, the role changes that change something, the goal document with created,
 * updated, removed goals and capped quotas, the base of today's allocation, the loss rows.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';

// `goalMath` reaches `assetService`, which initialises the client SDK at import: mocked away,
// as every pure suite that crosses it does (assistantMonthContextService.test.ts).
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
import type { GoalBasedInvestingData } from '@/types/goals';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import {
  buildTargetsFromProposal,
  currentAllocationOnBase,
  findAssetByName,
  lossScenarios,
  planGoalDocument,
  planRoleChanges,
} from '@/lib/utils/allocationAdviceApply';

const NOW = new Date('2026-10-20T12:00:00.000Z');

function asset(overrides: Partial<Asset> & Pick<Asset, 'id' | 'name' | 'type' | 'assetClass' | 'quantity' | 'currentPrice'>): Asset {
  return { userId: 'u1', ticker: '', currency: 'EUR', createdAt: NOW, updatedAt: NOW, ...overrides } as Asset;
}

const ETF = asset({ id: 'a-etf', name: 'ETF Mondo', type: 'etf', assetClass: 'equity', quantity: 100, currentPrice: 120 });
const BOND = asset({ id: 'a-bond', name: 'BTP Esempio', type: 'bond', assetClass: 'bonds', quantity: 5000, currentPrice: 1 });
const PENSION = asset({ id: 'a-pension', name: 'Fondo pensione', type: 'pensionFund', assetClass: 'equity', quantity: 30000, currentPrice: 1, allocationRole: 'excluded' });
const HOME = asset({ id: 'a-home', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 200000, currentPrice: 1, allocationRole: 'excluded' });
const MORTGAGE = asset({ id: 'a-loan', name: 'Mutuo casa', type: 'loan', assetClass: 'realestate', quantity: 80000, currentPrice: 1, financedAssetId: 'a-home' });
const ASSETS = [ETF, BOND, PENSION, HOME, MORTGAGE];

const valueOf = (a: Asset) => (a.type === 'loan' ? -a.quantity * a.currentPrice : a.quantity * a.currentPrice);

const PROPOSAL: AllocationAdviceProposal = {
  summary: 'Riequilibrio.',
  classes: [
    { assetClass: 'equity', targetPercentage: 60, rationale: '', subTargets: [{ name: 'All World', targetPercentage: 70 }, { name: 'Small cap', targetPercentage: 30 }] },
    { assetClass: 'bonds', targetPercentage: 40, rationale: '', subTargets: [] },
    { assetClass: 'cash', targetPercentage: 0, fixedAmount: 10000.4, rationale: '', subTargets: [] },
  ],
  assetRoles: [
    { assetName: 'Fondo pensione', role: 'frozen', reason: 'Conta nella base.' },
    { assetName: 'ETF Mondo', role: 'tradable', reason: 'Già così.' },
    { assetName: 'Mutuo casa', role: 'tradable', reason: 'Un prestito non ha ruolo.' },
    { assetName: 'Oro fisico', role: 'frozen', reason: 'Non esiste.' },
  ],
  goals: [
    { goalId: 'g1', name: 'Casa nuova', targetAmount: 60000, targetDateIso: '2031-01-01', priority: 'alta', assignments: [{ assetName: 'ETF Mondo', percentage: 70 }], rationale: 'Aggiornato.' },
    { name: 'Auto', targetAmount: 20000, priority: 'media', assignments: [{ assetName: 'ETF Mondo', percentage: 50 }, { assetName: 'Oro fisico', percentage: 10 }], rationale: 'Nuovo.' },
  ],
  reviewByIso: '2028-10-20',
  reviewReason: 'Due anni.',
  risks: [],
};

describe('buildTargetsFromProposal', () => {
  it('writes each class with its sleeves, the config enabled only with sleeves, the fixed cash as the page stores it', () => {
    const targets = buildTargetsFromProposal(PROPOSAL);
    expect(targets.equity).toEqual({
      targetPercentage: 60,
      subCategoryConfig: { enabled: true, categories: ['All World', 'Small cap'] },
      subTargets: { 'All World': 70, 'Small cap': 30 },
    });
    expect(targets.bonds).toEqual({ targetPercentage: 40, subCategoryConfig: { enabled: false, categories: [] } });
    expect(targets.cash).toEqual({ targetPercentage: 0, useFixedAmount: true, fixedAmount: 10000, subCategoryConfig: { enabled: false, categories: [] } });
    expect(Object.keys(targets)).toEqual(['equity', 'bonds', 'cash']);
  });
});

describe('planRoleChanges', () => {
  it('keeps only the changes that change something, skips a loan, reports an unknown name', () => {
    const { changes, unmatched } = planRoleChanges(PROPOSAL, ASSETS);
    expect(changes).toEqual([{ assetId: 'a-pension', assetName: 'Fondo pensione', from: 'excluded', to: 'frozen', reason: 'Conta nella base.' }]);
    expect(unmatched).toEqual(['Oro fisico']);
  });

  it('matches a name whatever its case and spaces', () => {
    expect(findAssetByName(ASSETS, '  etf mondo ')?.id).toBe('a-etf');
    expect(findAssetByName(ASSETS, 'ETF Luna')).toBeNull();
  });

  it('matches the printed «name (TICKER)» form and the ticker alone, with or without the exchange (2026-10-20)', () => {
    const swda = asset({ id: 'a-swda', name: 'iShares Core MSCI World UCITS ETF USD (Acc)', ticker: 'SWDA.MI', type: 'etf', assetClass: 'equity', quantity: 10, currentPrice: 100 });
    const list = [...ASSETS, swda];
    expect(findAssetByName(list, 'iShares Core MSCI World UCITS ETF USD (Acc)')?.id).toBe('a-swda');
    expect(findAssetByName(list, 'iShares Core MSCI World UCITS ETF USD (Acc) (SWDA)')?.id).toBe('a-swda');
    expect(findAssetByName(list, 'iShares Core MSCI World UCITS ETF USD (Acc) (SWDA.MI)')?.id).toBe('a-swda');
    expect(findAssetByName(list, 'SWDA')?.id).toBe('a-swda');
    expect(findAssetByName(list, 'swda.mi')?.id).toBe('a-swda');
    // A ticker two instruments share names neither; a blank names nothing.
    const twin = asset({ id: 'a-twin', name: 'Altro', ticker: 'SWDA.DE', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 1 });
    expect(findAssetByName([...list, twin], 'SWDA')).toBeNull();
    expect(findAssetByName(list, '  ')).toBeNull();
  });

  it('matches the display alias the prompt prints in place of the ticker (2026-10-23)', () => {
    const etc = asset({ id: 'a-etc', name: 'ETC Metallo', ticker: 'XS0000000000.SG', displayTicker: 'METL', type: 'etf', assetClass: 'commodity', quantity: 10, currentPrice: 10 });
    const list = [...ASSETS, etc];
    expect(findAssetByName(list, 'ETC Metallo (METL)')?.id).toBe('a-etc');
    expect(findAssetByName(list, 'METL')?.id).toBe('a-etc');
    expect(findAssetByName(list, 'ETC Metallo (XS0000000000.SG)')?.id).toBe('a-etc');
  });
});

describe('planGoalDocument', () => {
  const EXISTING: GoalBasedInvestingData = {
    goals: [
      { id: 'g1', name: 'Casa', priority: 'media', color: '#EF4444', createdAt: NOW, updatedAt: NOW, targetAmount: 50000 },
      { id: 'g2', name: 'Vecchio', priority: 'bassa', color: '#8B5CF6', createdAt: NOW, updatedAt: NOW },
      { id: 'g3', name: 'Intoccato', priority: 'bassa', color: '#22C55E', createdAt: NOW, updatedAt: NOW },
    ],
    assignments: [
      { goalId: 'g1', assetId: 'a-bond', percentage: 100 },
      { goalId: 'g2', assetId: 'a-etf', percentage: 20 },
      { goalId: 'g3', assetId: 'a-etf', percentage: 10 },
    ],
  };

  it('updates the named goal, creates the new one, removes the one marked, keeps the untouched one with its quotas', () => {
    const plan = planGoalDocument(PROPOSAL, EXISTING, ASSETS, ['g2'], NOW);
    expect(plan.created).toEqual(['Auto']);
    expect(plan.updated).toEqual(['Casa nuova']);
    expect(plan.removed).toEqual(['Vecchio']);
    expect(plan.unmatched).toEqual(['Oro fisico']);
    const goals = plan.document?.goals ?? [];
    expect(goals.map((goal) => goal.name)).toEqual(['Casa nuova', 'Intoccato', 'Auto']);
    expect(goals[0]).toMatchObject({ id: 'g1', targetAmount: 60000, targetDate: '2031-01-01', priority: 'alta', notes: 'Aggiornato.', color: '#EF4444' });
    // The new goal takes a colour none of the kept ones uses.
    expect(['#EF4444', '#22C55E']).not.toContain(goals[2].color);
    // The untouched goal keeps its quota; the updated one's old quota is replaced; the removed one's is gone.
    const assignments = plan.document?.assignments ?? [];
    expect(assignments).toContainEqual({ goalId: 'g3', assetId: 'a-etf', percentage: 10 });
    expect(assignments.find((row) => row.goalId === 'g1' && row.assetId === 'a-bond')).toBeUndefined();
    expect(assignments.find((row) => row.goalId === 'g2')).toBeUndefined();
  });

  it('caps the quotas of one asset at 100% across the goals by scaling the proposed ones, and says so', () => {
    const plan = planGoalDocument(PROPOSAL, EXISTING, ASSETS, ['g2'], NOW);
    // ETF Mondo: 10 (untouched g3) + 70 (g1) + 50 (Auto) = 130 → the proposed 120 scaled to 90.
    const etfRows = (plan.document?.assignments ?? []).filter((row) => row.assetId === 'a-etf');
    const total = etfRows.reduce((sum, row) => sum + ('percentage' in row ? row.percentage : 0), 0);
    expect(total).toBeCloseTo(100, 1);
    expect(etfRows.find((row) => row.goalId === 'g3')).toEqual({ goalId: 'g3', assetId: 'a-etf', percentage: 10 });
    expect(plan.rescaled).toEqual(['ETF Mondo']);
  });

  it('answers no document when the proposal names no goal and nothing is removed', () => {
    const plan = planGoalDocument({ ...PROPOSAL, goals: [] }, EXISTING, ASSETS, [], NOW);
    expect(plan.document).toBeNull();
  });

  it('starts from nothing when the account has no goal document', () => {
    const plan = planGoalDocument(PROPOSAL, null, ASSETS, [], NOW);
    expect(plan.document?.goals.map((goal) => goal.name)).toEqual(['Casa nuova', 'Auto']);
    expect(plan.updated).toEqual([]);
    expect(plan.created).toEqual(['Casa nuova', 'Auto']);
  });
});

describe('currentAllocationOnBase and lossScenarios', () => {
  it('measures the base as tradable + frozen, net of the debts that follow them', () => {
    const { baseTotal, pctByClass } = currentAllocationOnBase(ASSETS, valueOf);
    // The home and its mortgage are excluded; the pension fund is excluded here too.
    expect(baseTotal).toBe(12000 + 5000);
    expect(pctByClass.equity).toBeCloseTo((12000 / 17000) * 100, 6);
    expect(pctByClass.realestate).toBeUndefined();
  });

  it('prints the three losses in euro on the base', () => {
    expect(lossScenarios(17000)).toEqual([
      { pct: 10, eur: 1700 },
      { pct: 25, eur: 4250 },
      { pct: 40, eur: 6800 },
    ]);
  });
});
