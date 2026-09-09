/**
 * Tests for lib/utils/allocazioneNarrative.ts — the words of Allocazione: the verdict that
 * answers «sono allineato al piano, e cosa faccio con i prossimi soldi?» and the reading line
 * of every tile.
 *
 * Same mocking as the other `*Narrative.test.ts`: chartService's it-IT percentage formatter
 * drags the Firebase chain in, which is mocked away. Every phrasing is pinned here, and a
 * missing input drops its clause instead of printing a placeholder (The Narrative Honesty Rule).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildAllocazioneVerdict,
  describeAllocazioneHeader,
  describeBalance,
  describeBalanceFooter,
  describeBand,
  describeClasses,
  describeExcluded,
  describeExposure,
  describeExposureAside,
  describeExposureEmpty,
  describeExposureFooter,
  describeFrozen,
  describePension,
  describePensionAside,
  describePlan,
  describePlanFooter,
  formatLeverage,
  type AllocazioneVerdictInput,
} from '@/lib/utils/allocazioneNarrative';
import type { ClassGap, HoldingsGroup, PlanView } from '@/lib/utils/allocazioneSummary';
import type { RebalanceMove } from '@/lib/utils/allocationUtils';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

/** The screen prints a no-break space before €; the tests read it as a normal one. */
const flat = (text: string | undefined) => text?.replace(/[  ]/g, ' ');
const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/[  ]/g, ' ') : null);

function gap(overrides: Partial<ClassGap> = {}): ClassGap {
  return {
    assetClass: 'equity',
    label: 'Azioni',
    currentPercentage: 58.3,
    targetPercentage: 55,
    differencePp: 3.3,
    differenceValue: 8085,
    currentValue: 142835,
    action: 'VENDI',
    ...overrides,
  };
}

const EQUITY_OVER = gap();
const BONDS_UNDER = gap({ assetClass: 'bonds', label: 'Obbligazioni', currentPercentage: 21.7, targetPercentage: 25, differencePp: -3.3, differenceValue: -8085, currentValue: 53165, action: 'COMPRA' });
const CASH_OK = gap({ assetClass: 'cash', label: 'Liquidità', currentPercentage: 9.8, targetPercentage: 10, differencePp: -0.2, differenceValue: -490, currentValue: 24010, action: 'OK' });
const COMMODITY_OK = gap({ assetClass: 'commodity', label: 'Materie Prime', currentPercentage: 5.2, targetPercentage: 5, differencePp: 0.2, differenceValue: 490, currentValue: 12740, action: 'OK' });
const CRYPTO_OK = gap({ assetClass: 'crypto', label: 'Criptovalute', currentPercentage: 5, targetPercentage: 5, differencePp: 0, differenceValue: 0, currentValue: 12250, action: 'OK' });
const ALL_GAPS = [EQUITY_OVER, BONDS_UNDER, CASH_OK, COMMODITY_OK, CRYPTO_OK];

function verdictInput(overrides: Partial<AllocazioneVerdictInput> = {}): AllocazioneVerdictInput {
  return {
    hasAssets: true,
    excludedValue: 180000,
    score: 97,
    isBalanced: false,
    band: { type: 'fixed', pp: 2 },
    offTarget: [EQUITY_OVER, BONDS_UNDER],
    leverage: null,
    nextMoney: {
      amount: 1000,
      slices: [
        { key: 'bonds', label: 'Obbligazioni', amount: 940, kind: 'class' },
        { key: 'cash', label: 'Liquidità', amount: 60, kind: 'class' },
      ],
    },
    orphans: [],
    ...overrides,
  };
}

const holdings = (n: number, total: number): HoldingsGroup => ({
  count: n,
  total,
  holdings: [],
  rows: [],
});

describe('formatLeverage / describeBand', () => {
  it('prints leverage the Italian way with the times sign', () => {
    expect(formatLeverage(1.3)).toBe('1,30×');
    expect(formatLeverage(1)).toBe('1,00×');
  });

  it('names the band as the pill shows it', () => {
    expect(describeBand({ type: 'fixed', pp: 2 })).toBe('±2%');
    expect(describeBand({ type: 'fixed', pp: 3.5 })).toBe('±3,5%');
    expect(describeBand({ type: 'rule525' })).toBe('5/25');
  });
});

describe('buildAllocazioneVerdict', () => {
  it('names the score, the drifts in points and where the next money goes', () => {
    const verdict = buildAllocazioneVerdict(verdictInput());
    expect(verdict.headline).toBe('Allineato al 97%.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno; con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità.',
    );
  });

  it('is positive when every class is within the band, and says which band', () => {
    const verdict = buildAllocazioneVerdict(verdictInput({ isBalanced: true, offTarget: [], score: 99 }));
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Tutte le classi sono entro la soglia del ±2%; con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità.',
    );
  });

  it('names the 5/25 rule as a rule, not a band', () => {
    const verdict = buildAllocazioneVerdict(verdictInput({ isBalanced: true, offTarget: [], band: { type: 'rule525' }, nextMoney: null }));
    expect(plain(verdict.sentence)).toBe('Tutte le classi rispettano la regola 5/25.');
  });

  it('turns negative below 80 and lists three drifts with a comma before the last «e»', () => {
    const verdict = buildAllocazioneVerdict(
      verdictInput({
        score: 74,
        offTarget: [
          gap({ differencePp: 12.4 }),
          gap({ assetClass: 'bonds', label: 'Obbligazioni', differencePp: -9.1, action: 'COMPRA' }),
          gap({ assetClass: 'cash', label: 'Liquidità', differencePp: -3.3, action: 'COMPRA' }),
        ],
        nextMoney: null,
      }),
    );
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toBe(
      'Le azioni pesano 12,4 pp più del target, le obbligazioni 9,1 pp meno e la liquidità 3,3 pp meno.',
    );
  });

  it('drops the next-money clause when nothing would be bought', () => {
    const verdict = buildAllocazioneVerdict(verdictInput({ nextMoney: { amount: 1000, slices: [] } }));
    expect(plain(verdict.sentence)).toBe('Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno.');
  });

  it('names instruments, not classes, when the next money is planned per instrument', () => {
    const verdict = buildAllocazioneVerdict(
      verdictInput({
        nextMoney: {
          amount: 1000,
          slices: [
            { key: 'a1', label: '3USL', amount: 640, kind: 'instrument' },
            { key: 'a2', label: 'IWDA', amount: 360, kind: 'instrument' },
          ],
        },
      }),
    );
    expect(plain(verdict.sentence)).toContain('compreresti 640 € di 3USL e 360 € di IWDA.');
  });

  it('states the leverage against its target, or in line with it', () => {
    const off = buildAllocazioneVerdict(verdictInput({ leverage: { current: 1.3, target: 1.5 }, nextMoney: null }));
    expect(plain(off.sentence)).toBe(
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno; la leva è 1,30× contro un target di 1,50×.',
    );
    const inLine = buildAllocazioneVerdict(verdictInput({ leverage: { current: 1.5, target: 1.5 }, nextMoney: null }));
    expect(plain(inLine.sentence)).toContain('; la leva è 1,50×, in linea col target.');
  });

  it('declares an orphaned target in a sentence of its own', () => {
    const one = buildAllocazioneVerdict(
      verdictInput({
        nextMoney: null,
        orphans: [{ assetClass: 'realestate', subCategory: 'Prima casa', label: 'Immobili → Prima casa', targetPercentage: 70, excludedValue: 180000 }],
      }),
    );
    expect(plain(one.sentence)).toBe(
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno. Il target Immobili → Prima casa (70%) non è raggiungibile: il suo valore è tutto in asset esclusi.',
    );
    const two = buildAllocazioneVerdict(
      verdictInput({
        nextMoney: null,
        orphans: [
          { assetClass: 'realestate', label: 'Immobili', targetPercentage: 30, excludedValue: 180000 },
          { assetClass: 'realestate', subCategory: 'Prima casa', label: 'Immobili → Prima casa', targetPercentage: 70, excludedValue: 180000 },
        ],
      }),
    );
    expect(plain(two.sentence)).toContain(
      'I target Immobili (30%) e Immobili → Prima casa (70%) non sono raggiungibili: il loro valore è tutto in asset esclusi.',
    );
  });

  it('has a neutral empty state, and a different one when everything is excluded', () => {
    const empty = buildAllocazioneVerdict(verdictInput({ hasAssets: false, excludedValue: 0 }));
    expect(empty.headline).toBe('Nessun asset da allocare.');
    expect(empty.tone).toBe('neutral');
    expect(plain(empty.sentence)).toBe('Aggiungi un asset in Patrimonio per confrontare la tua allocazione con i target.');

    const excluded = buildAllocazioneVerdict(verdictInput({ hasAssets: false, excludedValue: 180000 }));
    expect(excluded.headline).toBe("Tutto il patrimonio è escluso dall'allocazione.");
    expect(plain(excluded.sentence)).toBe(
      'I 180.000 € che possiedi sono in asset esclusi dal ribilanciamento: cambia il ruolo di un asset in Patrimonio per vederlo qui.',
    );
  });
});

describe('describeAllocazioneHeader', () => {
  it('says the total, the class count and where the targets come from', () => {
    expect(flat(describeAllocazioneHeader({ marketValue: 245000, classCount: 5, targetSource: 'settings' }))).toBe('245.000 € allocati · 5 classi · target dalle impostazioni');
    expect(flat(describeAllocazioneHeader({ marketValue: 12000, classCount: 1, targetSource: 'goals' }))).toBe('12.000 € allocati · 1 classe · target dagli obiettivi');
  });

  it('is absent without assets', () => {
    expect(describeAllocazioneHeader({ marketValue: 0, classCount: 0, targetSource: 'settings' })).toBeUndefined();
  });
});

describe('describeBalance', () => {
  const base = { marketValue: 245000, misallocationPct: 3.5, leverageGapPp: 0, offTargetCount: 2, classCount: 5, band: { type: 'fixed', pp: 2 } as const };

  it('reads the misallocation on the allocated total and the off-target count under the band', () => {
    expect(plain(describeBalance(base))).toBe(
      'Su 245.000 € allocati il 3,5% è fuori posizione; entro la soglia del ±2% sono 2 classi su 5 fuori target.',
    );
  });

  it('says when nothing is off target, and when nothing is out of position', () => {
    expect(plain(describeBalance({ ...base, offTargetCount: 0 }))).toBe(
      'Su 245.000 € allocati il 3,5% è fuori posizione; entro la soglia del ±2% nessuna classe è fuori target.',
    );
    expect(plain(describeBalance({ ...base, misallocationPct: 0.02, offTargetCount: 0 }))).toBe(
      'Su 245.000 € allocati nulla è fuori posizione: ogni classe è sul suo target.',
    );
    expect(plain(describeBalance({ ...base, offTargetCount: 1 }))).toContain('è 1 classe su 5 fuori target');
  });

  it('names wealth in classes without a target instead of calling it a leverage gap', () => {
    expect(plain(describeBalance({ ...base, misallocationPct: 0.02, untargeted: { pct: 78, labels: ['Immobili', 'Liquidità'] } }))).toBe(
      "Su 245.000 € allocati lo 0,0% è fuori posizione e il 78% è in classi senza target (Immobili, Liquidità); entro la soglia del ±2% sono 2 classi su 5 fuori target.",
    );
    expect(plain(describeBalance({ ...base, untargeted: { pct: 0.2, labels: ['Immobili'] } }))).not.toContain('senza target');
  });

  it('keeps a leverage gap apart from the misallocation', () => {
    expect(plain(describeBalance({ ...base, leverageGapPp: -20 }))).toBe(
      "Su 245.000 € allocati il 3,5% è fuori posizione e l'esposizione è 20 pp sotto il target di leva; entro la soglia del ±2% sono 2 classi su 5 fuori target.",
    );
    expect(plain(describeBalance({ ...base, leverageGapPp: 4.4, band: { type: 'rule525' } }))).toBe(
      "Su 245.000 € allocati il 3,5% è fuori posizione e l'esposizione è 4 pp sopra il target di leva; con la regola 5/25 sono 2 classi su 5 fuori target.",
    );
  });
});

describe('describeBalanceFooter', () => {
  it('names what is inside the total but untouchable, and what is outside it', () => {
    expect(plain(describeBalanceFooter({ frozen: holdings(1, 42000), excluded: holdings(1, 180000), netWorth: 425000 }))).toBe(
      'Nel totale 42.000 € non negoziabili (1 asset: contano nelle percentuali, nessun piano li muove). Fuori dal totale 180.000 € esclusi (1 asset): il patrimonio è 425.000 €.',
    );
  });

  it('drops the empty half and is null with neither', () => {
    expect(plain(describeBalanceFooter({ frozen: holdings(0, 0), excluded: holdings(2, 200000), netWorth: 445000 }))).toBe(
      'Fuori dal totale 200.000 € esclusi (2 asset): il patrimonio è 445.000 €.',
    );
    expect(describeBalanceFooter({ frozen: holdings(0, 0), excluded: holdings(0, 0), netWorth: 245000 })).toBeNull();
  });
});

describe('describePlan', () => {
  const band = { type: 'fixed', pp: 2 } as const;
  const move = (overrides: Partial<RebalanceMove> = {}): RebalanceMove => ({
    assetClass: 'equity',
    label: 'Azioni',
    action: 'VENDI' as const,
    amount: 8085,
    requestedAmount: 8085,
    limitedByFrozen: false,
    differencePp: 3.3,
    currentPercentage: 58.3,
    targetPercentage: 55,
    ...overrides,
  });

  it('reads a rebalance as sells then buys, counting the operations', () => {
    const view: PlanView = {
      mode: 'rebalance',
      moves: [move(), move({ assetClass: 'bonds', label: 'Obbligazioni', action: 'COMPRA', amount: 8085, requestedAmount: 8085, differencePp: -3.3, currentPercentage: 21.7, targetPercentage: 25 })],
      trades: null,
      resultingLeverageRatio: null,
    };
    expect(plain(describePlan(view, band))).toBe(
      'Per rientrare nella soglia: vendi 8085 € di azioni e compra 8085 € di obbligazioni, due operazioni a saldo zero.',
    );
  });

  it('says what you CAN sell when frozen wealth caps a sell', () => {
    const view: PlanView = {
      mode: 'rebalance',
      moves: [
        move({ assetClass: 'bonds', label: 'Obbligazioni', amount: 2000, requestedAmount: 8000, limitedByFrozen: true }),
        move({ assetClass: 'crypto', label: 'Criptovalute', amount: 0, requestedAmount: 3000, limitedByFrozen: true }),
        move({ assetClass: 'equity', label: 'Azioni', action: 'COMPRA', amount: 11000, requestedAmount: 11000 }),
      ],
      trades: null,
      resultingLeverageRatio: null,
    };
    expect(plain(describePlan(view, band))).toBe(
      'Per rientrare nella soglia: vendi i 2000 € negoziabili di obbligazioni (il gap è 8000 €), le criptovalute sono sopra target ma tutte non negoziabili, e compra 11.000 € di azioni, due operazioni.',
    );
  });

  it('is calm when nothing moves', () => {
    expect(plain(describePlan({ mode: 'rebalance', moves: [], trades: null, resultingLeverageRatio: null }, band))).toBe(
      'Tutto in linea: nessuna operazione necessaria entro la soglia del ±2%.',
    );
    expect(plain(describePlan({ mode: 'rebalance', moves: [], trades: [], resultingLeverageRatio: 1.5 }, band))).toBe(
      'Tutto in linea: nessuna operazione riporta esposizione e leva più vicine al target.',
    );
  });

  it('reads instrument trades under leverage with the resulting leverage', () => {
    const view: PlanView = {
      mode: 'rebalance',
      moves: [],
      trades: [
        { assetId: 'a', ticker: '3USL', displayTicker: '3USL', name: 'WisdomTree S&P 500 3x', amount: -3000 },
        { assetId: 'b', ticker: 'IWDA', displayTicker: 'IWDA', name: 'iShares Core MSCI World', amount: 3000 },
      ],
      resultingLeverageRatio: 1.45,
    };
    expect(plain(describePlan(view, band))).toBe(
      'Per rientrare nella soglia: vendi 3000 € di 3USL e compra 3000 € di IWDA; la leva risultante è 1,45×.',
    );
  });

  it('reads a contribution, naming who gets nothing because it is over target', () => {
    const view: PlanView = {
      mode: 'contribute',
      amount: 1000,
      nodes: [
        { key: 'bonds', label: 'Obbligazioni', amount: 940, currentValue: 53165, newValue: 54105, newPercentage: 22, targetPercentage: 25, children: [] },
        { key: 'cash', label: 'Liquidità', amount: 60, currentValue: 24010, newValue: 24070, newPercentage: 9.8, targetPercentage: 10, children: [] },
      ],
      trades: null,
      overTarget: ['Azioni'],
    };
    expect(plain(describePlan(view, band))).toBe(
      'Con 1000 € in più: 940 € in obbligazioni e 60 € in liquidità, senza vendere nulla; le azioni non ne prendono.',
    );
  });

  it('asks for an amount, and says when no purchase helps', () => {
    expect(plain(describePlan({ mode: 'contribute', amount: 0, nodes: [], trades: null, overTarget: [] }, band))).toBe('Inserisci un importo per vedere dove andrebbe.');
    expect(plain(describePlan({ mode: 'contribute', amount: 500, nodes: [], trades: null, overTarget: [] }, band))).toBe(
      'Con 500 € in più nessun acquisto avvicina il portafoglio al target.',
    );
  });

  it('reads a withdrawal from what is over target', () => {
    const single: PlanView = {
      mode: 'withdraw',
      amount: 1000,
      nodes: [{ key: 'equity', label: 'Azioni', amount: 1000, currentValue: 142835, newValue: 141835, newPercentage: 58.1, targetPercentage: 55, children: [] }],
      trades: null,
      tradableTotal: 203000,
      exceedsPortfolio: false,
      overTarget: ['Azioni'],
    };
    expect(plain(describePlan(single, band))).toBe('Per prelevare 1000 €: tutto dalle azioni, che sono sopra target.');

    const split: PlanView = {
      ...single,
      amount: 5000,
      nodes: [
        { key: 'equity', label: 'Azioni', amount: 4200, currentValue: 142835, newValue: 138635, newPercentage: 57.8, targetPercentage: 55, children: [] },
        { key: 'commodity', label: 'Materie Prime', amount: 800, currentValue: 12740, newValue: 11940, newPercentage: 5, targetPercentage: 5, children: [] },
      ],
    };
    expect(plain(describePlan(split, band))).toBe(
      'Per prelevare 5000 €: 4200 € dalle azioni e 800 € dalle materie prime, partendo da ciò che è sopra target.',
    );
  });

  it('warns when the withdrawal exceeds what can be sold', () => {
    const view: PlanView = { mode: 'withdraw', amount: 300000, nodes: [], trades: null, tradableTotal: 203000, exceedsPortfolio: true, overTarget: [] };
    expect(plain(describePlan(view, band))).toBe('300.000 € superano i 203.000 € negoziabili: il piano liquida tutto.');
    expect(plain(describePlan({ ...view, amount: 0, exceedsPortfolio: false }, band))).toBe('Inserisci un importo per vedere da dove conviene prelevare.');
  });

  it('keeps the disclaimers as the tile footer, per mode and per engine', () => {
    expect(describePlanFooter('rebalance', false)).toContain('Stima indicativa, non un consiglio finanziario.');
    expect(describePlanFooter('withdraw', false)).toContain('Le tasse sulla plusvalenza non sono considerate.');
    expect(describePlanFooter('contribute', true)).toContain('strumenti reali');
  });
});

describe('describeClasses', () => {
  const band = { type: 'fixed', pp: 2 } as const;

  it('names the largest euro gap and the classes in line', () => {
    expect(plain(describeClasses(ALL_GAPS, band))).toBe(
      'Il gap più grande in euro è Azioni, 8085 € sopra il target; Liquidità, Materie Prime e Criptovalute sono in linea.',
    );
  });

  it('reads a class under target, and a single in-line class', () => {
    const under = [BONDS_UNDER, gap({ differencePp: 1.2, differenceValue: 2900 , action: 'OK' }), CASH_OK];
    expect(plain(describeClasses(under, band))).toBe(
      'Il gap più grande in euro è Obbligazioni, 8085 € sotto il target; Azioni e Liquidità sono in linea.',
    );
  });

  it('when everything is in line, counts the classes and names the farthest', () => {
    const inLine = [gap({ differencePp: 1.2, differenceValue: 2900, action: 'OK' }), CASH_OK, COMMODITY_OK, CRYPTO_OK, gap({ assetClass: 'bonds', label: 'Obbligazioni', differencePp: -1.4, differenceValue: -3400, action: 'OK' })];
    expect(plain(describeClasses(inLine, band))).toBe(
      'Tutte e cinque le classi sono entro la soglia del ±2%; la più lontana è Obbligazioni, 1,4 pp sotto il target.',
    );
  });

  it('is null without classes', () => {
    expect(describeClasses([], band)).toBeNull();
  });
});

describe('describeExposure', () => {
  it('names the heaviest holding, the first sector and the biggest issuer', () => {
    expect(
      plain(
        describeExposure({
          topHolding: { name: 'Apple', pct: 4.1, sourceCount: 3 },
          topSector: { label: 'Tecnologia', pct: 24.3 },
          topIssuer: { family: 'iShares', etfShare: 61 },
        }),
      ),
    ).toBe('Il titolo più pesante è Apple (4,1% del portafoglio, in 3 strumenti); il primo settore è Tecnologia (24,3%) e iShares emette il 61% degli ETF.');
  });

  it('drops what is missing and is null with nothing', () => {
    expect(plain(describeExposure({ topHolding: { name: 'Enel', pct: 2, sourceCount: 1 }, topSector: null, topIssuer: null }))).toBe(
      'Il titolo più pesante è Enel (2,0% del portafoglio, in 1 strumento).',
    );
    expect(describeExposure({ topHolding: null, topSector: null, topIssuer: null })).toBeNull();
  });

  it('names what an empty view means', () => {
    expect(describeExposureEmpty('holdings')).toContain('Nessun titolo riconosciuto');
    expect(describeExposureEmpty('sectors')).toBe('Nessun dato settoriale per gli ETF in portafoglio.');
    expect(describeExposureEmpty('issuers')).toBe('Nessun ETF in portafoglio.');
  });

  it('has an aside and a footer', () => {
    expect(describeExposureAside({ analyzedAssets: 12, totalAssets: 16 })).toBe('12 asset su 16 analizzati');
    expect(describeExposureFooter('2026-08-24T06:15:00.000Z')).toBe(
      'Prime ~10 posizioni per ETF da Yahoo Finance: approssimato per i fondi molto diversificati. Nessuna copertura geografica. Aggiornato il 24/08/2026.',
    );
    expect(describeExposureFooter(null)).toBe('Prime ~10 posizioni per ETF da Yahoo Finance: approssimato per i fondi molto diversificati. Nessuna copertura geografica.');
  });
});

describe('describePension', () => {
  const base = {
    fundCount: 1,
    fundValue: 42000,
    fundSlices: [
      { assetClass: 'bonds', label: 'Obbligazioni', value: 29400, percentage: 70 },
      { assetClass: 'equity', label: 'Azioni', value: 12600, percentage: 30 },
    ],
    combinedTotal: 425000,
    combinedSlices: [
      { assetClass: 'realestate', label: 'Immobili', value: 180000, percentage: 42.4 },
      { assetClass: 'equity', label: 'Azioni', value: 142835, percentage: 33.6 },
      { assetClass: 'bonds', label: 'Obbligazioni', value: 53165, percentage: 12.5 },
    ],
    hasExcluded: true,
    allFrozen: true,
  };

  it('reads the fund mix, its role and the whole-wealth mix', () => {
    expect(plain(describePension(base))).toBe(
      'Il fondo pensione (42.000 €) è per il 70% obbligazioni e il 30% azioni ed è già dentro il totale allocato come non negoziabile; sull\'intero patrimonio (425.000 €, esclusi compresi) gli immobili pesano il 42,4% e le azioni il 33,6%.',
    );
  });

  it('handles two funds, one excluded from the allocation, and no excluded wealth', () => {
    expect(plain(describePension({ ...base, fundCount: 2, allFrozen: false, hasExcluded: false }))).toBe(
      'I 2 fondi pensione (42.000 €) sono per il 70% obbligazioni e il 30% azioni, ma non tutti dentro il totale allocato; sull\'intero patrimonio (425.000 €) gli immobili pesano il 42,4% e le azioni il 33,6%.',
    );
  });
});

describe('describePensionAside', () => {
  it('names the funds, their value and the role', () => {
    expect(flat(describePensionAside({ fundNames: ['Cometa'], fundValue: 42000, allFrozen: true }))).toBe('Cometa · 42.000 € · non negoziabile');
    expect(flat(describePensionAside({ fundNames: ['Cometa', 'Fonte'], fundValue: 60000, allFrozen: false }))).toBe('Cometa, Fonte · 60.000 €');
    expect(flat(describePensionAside({ fundNames: [], fundValue: 100, allFrozen: true }))).toBe('Fondo pensione · 100 € · non negoziabile');
  });
});

describe('describeFrozen / describeExcluded', () => {
  it('explain the two roles in the Dettaglio', () => {
    expect(plain(describeFrozen(holdings(1, 42000)))).toBe(
      '1 asset, 42.000 €: contano nel totale e nelle percentuali, ma nessun piano li muove; il ruolo si cambia in Patrimonio.',
    );
    expect(plain(describeExcluded(holdings(2, 200000)))).toBe(
      '2 asset, 200.000 €: nel patrimonio, fuori da ogni calcolo di questa pagina; per questo il totale allocato è più basso del patrimonio netto.',
    );
  });
});
