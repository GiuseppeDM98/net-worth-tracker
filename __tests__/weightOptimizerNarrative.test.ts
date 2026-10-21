import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { ConflictReport, ObjectiveReport, OptimizerWarning, SecondLevelGap } from '@/lib/utils/weightOptimizer';
import {
  describeConflict,
  describeModelDebtNote,
  describeObjectiveLabel,
  describeObjectiveRow,
  describeOptimizerMode,
  describeOptimizerSnapshot,
  describeOptimizerWarning,
  describeSecondLevelGaps,
  formatObjectiveAchieved,
  formatObjectiveGap,
  formatObjectiveTarget,
  MODEL_DEBT_BASE_NOTE,
  OPTIMIZER_MODE_LABELS,
} from '@/lib/utils/weightOptimizerNarrative';

function objective(overrides: Partial<ObjectiveReport> = {}): ObjectiveReport {
  return {
    id: 'class:equity',
    kind: 'class',
    label: 'Classe Azioni',
    priority: 'essential',
    targetValue: 102.0,
    achievedValue: 101.6,
    gapPp: -0.4,
    ...overrides,
  };
}

describe('describeObjectiveLabel', () => {
  it('class', () => {
    expect(describeObjectiveLabel('class', 'equity')).toBe('Classe Azioni');
  });

  it('leverage', () => {
    expect(describeObjectiveLabel('leverage')).toBe('Leva');
  });

  it('factor: the class-scope idiom, not a parenthetical', () => {
    expect(describeObjectiveLabel('factor', 'equity', 'Momentum')).toBe("Momentum nell'azionario");
    expect(describeObjectiveLabel('factor', 'bonds', 'Governativi')).toBe("Governativi nell'obbligazionario");
  });

  it('group', () => {
    expect(describeObjectiveLabel('group', undefined, undefined, 'Leva')).toBe('Gruppo Leva');
  });
});

describe('gap / target / achieved formatting', () => {
  it('a pp objective: one decimal, typographic minus', () => {
    const o = objective({ targetValue: 102.0, achievedValue: 101.6, gapPp: -0.4 });
    expect(formatObjectiveTarget(o)).toBe('102,0%');
    expect(formatObjectiveAchieved(o)).toBe('101,6%');
    expect(formatObjectiveGap(o)).toBe('−0,4 pp');
  });

  it('a positive gap carries a plus sign', () => {
    const o = objective({ targetValue: 60, achievedValue: 60.4, gapPp: 0.4 });
    expect(formatObjectiveGap(o)).toBe('+0,4 pp');
  });

  it('a leverage objective: two decimals and ×, gap in ×  not pp', () => {
    const o = objective({ kind: 'leverage', id: 'leverage', label: 'Leva', targetValue: 1.23, achievedValue: 1.19, gapPp: -4 });
    expect(formatObjectiveTarget(o)).toBe('1,23×');
    expect(formatObjectiveAchieved(o)).toBe('1,19×');
    expect(formatObjectiveGap(o)).toBe('−0,04×');
  });

  it('describeObjectiveRow composes target → achieved (gap)', () => {
    const o = objective({ label: 'Azioni', targetValue: 102.0, achievedValue: 101.6, gapPp: -0.4 });
    expect(describeObjectiveRow(o)).toBe('Azioni 102,0% → 101,6% (−0,4 pp)');
  });
});

describe('describeConflict', () => {
  it('rebuilds the achieved figures from each objective\'s own targetValue', () => {
    const objectives: ObjectiveReport[] = [
      objective({ id: 'leverage', kind: 'leverage', label: 'Leva', targetValue: 1.23, achievedValue: 1.23, gapPp: 0 }),
      objective({ id: 'factor:equity:Momentum', kind: 'factor', label: "Momentum nell'azionario", targetValue: 66.1, achievedValue: 66.1, gapPp: 0 }),
    ];
    const conflict: ConflictReport = {
      removedObjectiveId: 'leverage',
      improvements: [{ objectiveId: 'factor:equity:Momentum', fromGapPp: 0, toGapPp: -4.1 }],
    };
    expect(describeConflict(conflict, objectives)).toBe(
      "Senza il criterio «Leva»: Momentum nell'azionario da 66,1% a 62,0%."
    );
  });

  it('drops an improvement whose objective is missing from the list', () => {
    const objectives: ObjectiveReport[] = [objective({ id: 'leverage', kind: 'leverage', label: 'Leva' })];
    const conflict: ConflictReport = {
      removedObjectiveId: 'leverage',
      improvements: [{ objectiveId: 'unknown', fromGapPp: 0, toGapPp: -1 }],
    };
    expect(describeConflict(conflict, objectives)).toBe("Senza il criterio «Leva»: .");
  });
});

describe('describeOptimizerWarning', () => {
  const labelOf = (key: string) => (key === 'p1' ? 'VWCE' : key);

  it('covers every OptimizerWarning code with a non-empty text', () => {
    const warnings: OptimizerWarning[] = [
      { code: 'factor_unmapped', assetClass: 'equity', subCategory: 'Momentum' },
      { code: 'proxy_mismatch', key: 'p1' },
      { code: 'bound_conflict', key: 'p1' },
      { code: 'not_converged' },
    ];
    for (const warning of warnings) {
      const text = describeOptimizerWarning(warning, labelOf);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('resolves the candidate key through labelOf', () => {
    expect(describeOptimizerWarning({ code: 'proxy_mismatch', key: 'p1' }, labelOf)).toContain('VWCE');
  });

  it('factor_unmapped names the class and the sub-category without labelOf', () => {
    expect(describeOptimizerWarning({ code: 'factor_unmapped', assetClass: 'equity', subCategory: 'Momentum' }, labelOf)).toBe(
      '«Momentum» (Azioni) non ha un peso tra i sotto-criteri: pesa zero nel calcolo.'
    );
  });
});

describe('describeOptimizerMode', () => {
  it('names both modes distinctly', () => {
    expect(OPTIMIZER_MODE_LABELS.reachable).toBe('Raggiungibile col PAC');
    expect(OPTIMIZER_MODE_LABELS.ideal).toBe('Ideale');
    expect(describeOptimizerMode('reachable')).not.toBe(describeOptimizerMode('ideal'));
    expect(describeOptimizerMode('reachable').length).toBeGreaterThan(0);
  });
});

describe('describeOptimizerSnapshot', () => {
  const snapshot = {
    computedAt: new Date(2026, 8, 18), // 18/09
    mode: 'reachable' as const,
    weights: [{ key: 'p1', proposedPct: 60 }],
  };

  it('names the date and the mode when the weights are untouched', () => {
    const positions = [{ id: 'p1', targetPercentage: 60 }];
    expect(describeOptimizerSnapshot(snapshot, positions)).toBe(
      "Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile col PAC)."
    );
  });

  it('adds the hand-edited clause once a weight differs', () => {
    const positions = [{ id: 'p1', targetPercentage: 65 }];
    expect(describeOptimizerSnapshot(snapshot, positions)).toBe(
      "Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile col PAC), poi modificati a mano."
    );
  });

  it('ignores a position the snapshot never proposed a weight for', () => {
    const positions = [{ id: 'other', targetPercentage: 40 }];
    expect(describeOptimizerSnapshot(snapshot, positions)).toBe(
      "Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile col PAC)."
    );
  });
});

describe('describeSecondLevelGaps', () => {
  function gap(overrides: Partial<SecondLevelGap> & { assetId: string; assetName: string }): SecondLevelGap {
    return { assetClass: 'equity', reason: 'missing', ...overrides };
  }

  it('returns nothing for an empty list', () => {
    expect(describeSecondLevelGaps([])).toEqual([]);
  });

  it('names the class, the count and the instruments, capped at 5 with the rest counted', () => {
    const gaps = ['VWCE', 'IWDA', 'EIMI', 'XDEM', 'AVWS', 'CL2'].map((name, i) =>
      gap({ assetId: `a${i}`, assetName: name })
    );
    expect(describeSecondLevelGaps(gaps)).toEqual([
      '6 strumenti nella classe Azioni senza sottocategoria: VWCE, IWDA, EIMI, XDEM, AVWS e altri 1.',
    ]);
  });

  it('keeps missing and unknown as separate sentences', () => {
    const gaps = [
      gap({ assetId: 'a1', assetName: 'VWCE', reason: 'missing' }),
      gap({ assetId: 'a2', assetName: 'IWDA', reason: 'unknown' }),
    ];
    const lines = describeSecondLevelGaps(gaps);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('1 strumento nella classe Azioni senza sottocategoria: VWCE.');
    expect(lines[1]).toBe('1 strumento nella classe Azioni con una sottocategoria non configurata: IWDA.');
  });
});

describe('R11-S2 — the model tile says its base ignores the debts (D-R11-2)', () => {
  const asset = (overrides: Partial<Asset>): Asset =>
    ({ id: 'a', userId: 'u', ticker: 'X', name: 'X', type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 1, currentPrice: 1000, ...overrides }) as Asset;
  const valueOf = (a: Asset) => (a.type === 'loan' ? -a.quantity : a.quantity * a.currentPrice);

  it('a personal loan Bilanciamento nets: the note is there', () => {
    const assets = [asset({ id: 'etf', quantity: 100 }), asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 5000, currentPrice: 1 })];
    expect(describeModelDebtNote(assets, valueOf)).toBe(MODEL_DEBT_BASE_NOTE);
  });

  it('a mortgage on a property inside the allocation: the note is there', () => {
    const assets = [
      asset({ id: 'flat', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000 }),
      asset({ id: 'mortgage', type: 'loan', assetClass: 'realestate', quantity: 120000, currentPrice: 1, financedAssetId: 'flat' }),
    ];
    expect(describeModelDebtNote(assets, valueOf)).toBe(MODEL_DEBT_BASE_NOTE);
  });

  it('a mortgage on an excluded home moves no figure: no note; and no debt at all: no note', () => {
    const home = asset({ id: 'home', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000, allocationRole: 'excluded' });
    const mortgage = asset({ id: 'mortgage', type: 'loan', assetClass: 'realestate', quantity: 120000, currentPrice: 1, financedAssetId: 'home' });
    expect(describeModelDebtNote([home, mortgage], valueOf)).toBeNull();
    expect(describeModelDebtNote([asset({ id: 'etf' })], valueOf)).toBeNull();
  });
});
