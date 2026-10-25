/**
 * Tests for lib/utils/idealAllocationEditor.ts — what the objectives' editor (Allocazione ›
 * Accumulo) reads from the saved targets and the portfolio, and the
 * range checks «Salva i criteri» runs.
 */
import { describe, it, expect } from 'vitest';
import { buildObjectivesEditorContext, describeClassTargets, findIdealAllocationProblem } from '@/lib/utils/idealAllocationEditor';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

const asset = (overrides: Partial<Asset>): Asset =>
  ({ id: 'a', name: 'VWCE', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 100, allocationRole: 'tradable', ...overrides }) as Asset;
const valueOf = (a: Asset) => a.quantity * (a.currentPrice ?? 0);

describe('buildObjectivesEditorContext', () => {
  const targets = {
    equity: { targetPercentage: 60, subCategoryConfig: { enabled: true, categories: [{ name: 'Mondo', targetPercentage: 100 }] } },
    bonds: { targetPercentage: 40 },
  } as unknown as AssetAllocationTarget;

  it('splits the classes by whether their sub-categories are on', () => {
    const context = buildObjectivesEditorContext(targets, [asset({})], valueOf);
    expect(context.factorClassOptions.map((c) => c.assetClass)).toEqual(['equity']);
    expect(context.secondLevelReadyClasses.map((c) => c.assetClass)).toEqual(['bonds']);
  });

  it('offers only tradable instruments to the limits', () => {
    const context = buildObjectivesEditorContext(
      targets,
      [asset({ id: 'a', name: 'VWCE' }), asset({ id: 'f', name: 'FONDO', allocationRole: 'frozen' }), asset({ id: 'x', name: 'CASA', allocationRole: 'excluded' })],
      valueOf,
    );
    expect(context.tradableAssets).toEqual([{ id: 'a', label: 'VWCE' }]);
  });
});

describe('findIdealAllocationProblem', () => {
  it('accepts consistent limits', () => {
    expect(findIdealAllocationProblem({ instrumentLimits: [{ minPct: 5, maxPct: 40 }], groupLimits: [{ label: 'Leva', maxPct: 20 }] })).toBeNull();
  });

  it('refuses a minimum above the maximum, a value out of range and a group cap out of range', () => {
    expect(findIdealAllocationProblem({ instrumentLimits: [{ minPct: 50, maxPct: 40 }], groupLimits: [] })).toMatch(/minimo/);
    expect(findIdealAllocationProblem({ instrumentLimits: [{ maxPct: 120 }], groupLimits: [] })).toMatch(/tra 0 e 100/);
    expect(findIdealAllocationProblem({ instrumentLimits: [], groupLimits: [{ label: '', maxPct: -1 }] })).toMatch(/senza etichetta/);
  });
});

// AL18 (D-AL5): the class targets, read-only, inside the criteria's modal.
describe('describeClassTargets', () => {
  it('lists the classes with a target, in the targets\' order, with the leverage they imply', () => {
    const view = describeClassTargets({ equity: { targetPercentage: 70 }, bonds: { targetPercentage: 20 }, commodity: { targetPercentage: 0 } } as unknown as AssetAllocationTarget, 0.9);
    expect(view.rows.map((row) => [row.label, row.assetClass])).toEqual([['Azioni', 'equity'], ['Obbligazioni', 'bonds']]);
    expect(view.rows[0].valueText).toContain('70');
    expect(view.leverageText).toContain('nessuna leva');
  });

  it('names the leverage when the targets add up to more than 100%', () => {
    const view = describeClassTargets({ equity: { targetPercentage: 90 }, bonds: { targetPercentage: 20 } } as unknown as AssetAllocationTarget, 1.1);
    expect(view.leverageText).toBe('Somma 110%: leva 1,10×.');
  });

  it('says «importo fisso» for a cash target held as an amount, and nothing without targets', () => {
    const view = describeClassTargets({ equity: { targetPercentage: 100 }, cash: { targetPercentage: 5, useFixedAmount: true, fixedAmount: 5000 } } as unknown as AssetAllocationTarget, 1);
    expect(view.rows.map((row) => row.valueText)[1]).toBe('importo fisso');
    expect(describeClassTargets(null, 1)).toEqual({ rows: [], leverageText: null });
    expect(describeClassTargets({} as AssetAllocationTarget, 1).leverageText).toBeNull();
  });
});
