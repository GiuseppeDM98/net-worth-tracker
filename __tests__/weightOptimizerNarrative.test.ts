import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { ConflictReport, ObjectiveReport, OptimizerSaleReport, OptimizerWarning, SecondLevelGap } from '@/lib/utils/weightOptimizer';
import {
  describeConflict,
  describeModelDebtNote,
  describeObjectiveLabel,
  describeObjectiveRow,
  describeOptimizerMode,
  describeOptimizerSnapshot,
  describeOptimizerWarning,
  describeSecondLevelGaps,
  describeTargetedSaleTotal,
  formatSaleTaxCell,
  formatObjectiveAchieved,
  formatObjectiveGap,
  formatObjectiveTarget,
  MODEL_DEBT_BASE_NOTE,
  OPTIMIZER_MODE_LABELS,
  describeAmountAboveLiquidity,
  describeIdealCompositionStatus,
  describeModelTileReading,
  describeNegativeFixed,
  MODEL_STALE_ASIDE,
  MODEL_STALE_READING,
  MODEL_TILE_EMPTY_READING,
  MODEL_TILE_READ_FAILURE_READING,
  NEGATIVE_LIQUIDITY_NOTE,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
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
  const labelOf = (key: string) => (key === 'p1' ? 'ETFMONDO' : key);

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
    expect(describeOptimizerWarning({ code: 'proxy_mismatch', key: 'p1' }, labelOf)).toContain('ETFMONDO');
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

describe('the targeted mode, «Con vendite mirate»', () => {
  const NBSP = /[\u00A0\u202F]/g;
  const plain = (text: string) => text.replace(NBSP, ' ');
  // Four-digit euros print ungrouped («8000 €»), as every other figure of the app (owner, 2026-11-18).
  const sale = (overrides: Partial<OptimizerSaleReport> = {}): OptimizerSaleReport => ({
    taxCapEur: 500,
    minTaxEur: 0,
    soldEur: 8000,
    taxEur: 400,
    liquiditySpentEur: 0,
    idealTaxEur: 900,
    capBinding: true,
    perCandidate: [],
    ...overrides,
  });

  it('has its own label and description', () => {
    expect(OPTIMIZER_MODE_LABELS.targeted).toBe('Con vendite mirate');
    expect(describeOptimizerMode('targeted')).toBe(
      'Con vendite mirate vende solo ciò che conviene di più, finché le tasse restano sotto il tetto; gli strumenti spuntati non si vendono.'
    );
  });

  it('says the sale and the cap when the cap binds', () => {
    expect(plain(describeTargetedSaleTotal(sale()))).toBe('Vendi 8000 €, paghi circa 400 € di tasse (tetto 500 €).');
  });

  it('says it is Ideale when the cap does not bind', () => {
    expect(plain(describeTargetedSaleTotal(sale({ capBinding: false, soldEur: 20000, taxEur: 900, taxCapEur: 10000 })))).toBe(
      "Vendi 20.000 €, paghi circa 900 € di tasse: è l'Ideale, il tetto di 10.000 € non serve."
    );
  });

  it('says nothing is sold — the reachable weights — when nothing is sold nor spent', () => {
    expect(plain(describeTargetedSaleTotal(sale({ soldEur: 0, taxEur: 0, taxCapEur: 0 })))).toBe(
      'Nessuna vendita: i pesi sono quelli raggiungibili col PAC.'
    );
  });

  it('names the liquidity it spends apart from the sale', () => {
    expect(plain(describeTargetedSaleTotal(sale({ liquiditySpentEur: 3000 })))).toBe(
      'Vendi 8000 €, paghi circa 400 € di tasse, usi 3000 € di liquidità (tetto 500 €).'
    );
    expect(plain(describeTargetedSaleTotal(sale({ soldEur: 0, taxEur: 0, liquiditySpentEur: 3000 })))).toBe(
      'Nessuna vendita: usi 3000 € di liquidità.'
    );
  });

  it('names the tax the Impostazioni limits force when it exceeds the cap', () => {
    expect(plain(describeTargetedSaleTotal(sale({ taxCapEur: 0, minTaxEur: 100, taxEur: 100, soldEur: 10000 })))).toBe(
      'I limiti in Impostazioni obbligano a pagare almeno 100 € di tasse, oltre il tetto di 0 €: vendi 10.000 €, paghi circa 100 € di tasse.'
    );
  });

  it('prints the tax on a row in sale, 0,00 € on a sale at a loss, — on a row that sells nothing', () => {
    expect(plain(formatSaleTaxCell(2000, 250))).toBe('250,00 €');
    expect(plain(formatSaleTaxCell(1000, 0))).toBe('0,00 €');
    expect(plain(formatSaleTaxCell(0, 0))).toBe('—');
  });

  it("makes the total line the dialog's reading once the targeted mode has a result", () => {
    const run = { status: 'ok' as const, sale: sale({ liquiditySpentEur: 3000 }) };
    const reading = describeIdealCompositionStatus(run, [], 5000, { instrumentCount: 3, baseEur: 100000 });
    expect(plain(textOf(reading.narrative))).toBe('Vendi 8000 €, paghi circa 400 € di tasse, usi 3000 € di liquidità (tetto 500 €).');
    expect(reading.tone).toBe('neutral');
    expect(plain(textOf(describeIdealCompositionStatus(run, [], -2000, { instrumentCount: 3, baseEur: 100000 }).narrative))).toBe(
      `Vendi 8000 €, paghi circa 400 € di tasse, usi 3000 € di liquidità (tetto 500 €). ${NEGATIVE_LIQUIDITY_NOTE}`
    );
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
    const gaps = ['ETFMONDO', 'ETFSVIL', 'ETFEM', 'ETFMOM', 'ETFVAL', 'ETFUSA'].map((name, i) =>
      gap({ assetId: `a${i}`, assetName: name })
    );
    expect(describeSecondLevelGaps(gaps)).toEqual([
      '6 strumenti nella classe Azioni senza sottocategoria: ETFMONDO, ETFSVIL, ETFEM, ETFMOM, ETFVAL e altri 1.',
    ]);
  });

  it('keeps missing and unknown as separate sentences', () => {
    const gaps = [
      gap({ assetId: 'a1', assetName: 'ETFMONDO', reason: 'missing' }),
      gap({ assetId: 'a2', assetName: 'ETFSVIL', reason: 'unknown' }),
    ];
    const lines = describeSecondLevelGaps(gaps);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('1 strumento nella classe Azioni senza sottocategoria: ETFMONDO.');
    expect(lines[1]).toBe('1 strumento nella classe Azioni con una sottocategoria non configurata: ETFSVIL.');
  });
});

describe('the model tile says its base ignores the debts', () => {
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

// ---------------------------------------------------------------------------
// The calculation's dialog and the model tile (2026-11-12)
// ---------------------------------------------------------------------------

const textOf = (narrative: Array<{ text: string }>) => narrative.map((s) => s.text).join('').replace(/[  ]/g, ' ');
const okRun = { status: 'ok', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 1, converged: true } as const;

describe('describeIdealCompositionStatus — the reading IS the status', () => {
  const context = { instrumentCount: 3, baseEur: 100000 };

  it('before «Calcola»: what to do, and that nothing is saved', () => {
    const r = describeIdealCompositionStatus(null, [], 5000, context);
    expect(r.tone).toBe('neutral');
    expect(textOf(r.narrative)).toBe('Scegli la modalità e premi «Calcola»: niente si salva finché non lo chiedi.');
  });

  it('a result: how many instruments, on which base', () => {
    const r = describeIdealCompositionStatus({ ...okRun }, [], 5000, context);
    expect(textOf(r.narrative)).toBe('Pesi proposti per 3 strumenti su una base di 100.000 €.');
    expect(textOf(describeIdealCompositionStatus({ ...okRun }, [], 5000, { instrumentCount: 1, baseEur: 1000 }).narrative)).toBe(
      'Pesi proposti per 1 strumento su una base di 1000 €.'
    );
  });

  it('bounds that cannot reach 100, or nothing to weigh: the status sentences, in the negative tone', () => {
    const infeasible = describeIdealCompositionStatus({ ...okRun, status: 'infeasible_bounds' }, [], 5000, context);
    expect(infeasible.tone).toBe('negative');
    expect(textOf(infeasible.narrative)).toBe(OPTIMIZER_STATUS_INFEASIBLE_BOUNDS);
    const none = describeIdealCompositionStatus({ ...okRun, status: 'no_candidates' }, [], 5000, context);
    expect(none.tone).toBe('negative');
    expect(textOf(none.narrative)).toBe(OPTIMIZER_STATUS_NO_CANDIDATES);
  });

  it('a property under its mortgage wins over everything, in the negative tone', () => {
    const r = describeIdealCompositionStatus({ ...okRun }, ['Casa'], 5000, context);
    expect(r.tone).toBe('negative');
    expect(textOf(r.narrative)).toBe('Casa vale meno dei suoi debiti: il modello non si calcola su una base con una quota negativa.');
    expect(describeNegativeFixed(['Casa', 'Box'])).toBe(
      'Casa e Box valgono meno dei loro debiti: il modello non si calcola su una base con una quota negativa.'
    );
  });

  it('liquidity below zero: the run proceeds and the reading says so', () => {
    expect(textOf(describeIdealCompositionStatus(null, [], -2000, context).narrative)).toBe(
      `Scegli la modalità e premi «Calcola»: niente si salva finché non lo chiedi. ${NEGATIVE_LIQUIDITY_NOTE}`
    );
    expect(textOf(describeIdealCompositionStatus({ ...okRun }, [], -2000, context).narrative)).toBe(
      `Pesi proposti per 3 strumenti su una base di 100.000 €. ${NEGATIVE_LIQUIDITY_NOTE}`
    );
  });

  it('an amount above the accounts', () => {
    expect(describeAmountAboveLiquidity(10000).replace(/[  ]/g, ' ')).toBe("Sui conti hai 10.000 €: l'importo non può superarla.");
  });
});

describe('describeModelTileReading', () => {
  const base = {
    readFailed: false,
    instrumentCount: 2,
    origin: 'manual' as const,
    updatedAt: new Date('2026-11-10T12:00:00'),
    snapshot: undefined,
    toBuyEur: 1500,
    stale: false,
  };

  it('a fresh model: the count, the origin and what it takes to get there', () => {
    expect(textOf(describeModelTileReading(base))).toBe('2 strumenti. Scritto a mano il 10/11/2026. Per portare il portafoglio sul modello servono 1500 € di acquisti.');
    expect(textOf(describeModelTileReading({ ...base, instrumentCount: 1, toBuyEur: 0 }))).toBe('1 strumento. Scritto a mano il 10/11/2026. Il portafoglio è già sul modello.');
  });

  it('a stale model opens with the stale sentence', () => {
    expect(textOf(describeModelTileReading({ ...base, stale: true }))).toBe(
      `${MODEL_STALE_READING} 2 strumenti. Scritto a mano il 10/11/2026. Per portare il portafoglio sul modello servono 1500 € di acquisti.`
    );
    expect(MODEL_STALE_ASIDE).toBe('superato');
  });

  it('no model, or a failed read', () => {
    expect(textOf(describeModelTileReading({ ...base, instrumentCount: null }))).toBe(MODEL_TILE_EMPTY_READING);
    expect(textOf(describeModelTileReading({ ...base, readFailed: true }))).toBe(MODEL_TILE_READ_FAILURE_READING);
  });
});
