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
  describeAllocazioneClosedAnswers,
  describeAllocazioneHeader,
  describeBalance,
  describeBalanceFooter,
  describeBand,
  describeClasses,
  describeExcluded,
  describeExposure,
  describePacOverlap,
  describeExposureBase,
  describeExposureCoverage,
  describeExposureEmpty,
  describeExposureFooter,
  describeExposureMethod,
  describeFrozen,
  describeNegativeClassNote,
  describePension,
  describePensionAside,
  describePlan,
  describePlanFooter,
  formatLeverage,
  type AllocazioneVerdictInput,
  ALLOCAZIONE_CLOSED_ASIDES,
} from '@/lib/utils/allocazioneNarrative';
import { ALLOCAZIONE_SECTION_IDS, type ClassGap, type HoldingsGroup, type PlanView } from '@/lib/utils/allocazioneSummary';
import type { RebalanceMove } from '@/lib/utils/allocationUtils';
import { narrativeToText, splitVerdict, type Narrative } from '@/lib/utils/narrative';
import type { ExposureBucket, ExposureCoverage, ExposureNotApplicable } from '@/types/exposure';

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
    dormant: false,
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
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno. Con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità.',
    );
  });

  it('names the PAC installment in place of Versa when a plan is active (PT2)', () => {
    const verdict = buildAllocazioneVerdict(
      verdictInput({ pac: { monthTotalEur: 3134, instrumentCount: 4, monthLabel: 'ottobre', allClosed: false } }),
    );
    expect(plain(verdict.sentence)).toBe(
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno. Il piano di accumulo compra questo mese 3134 € in 4 strumenti.',
    );
  });

  it('says the installment is closed when every line is (PT3)', () => {
    const verdict = buildAllocazioneVerdict(
      verdictInput({ pac: { monthTotalEur: 3134, instrumentCount: 4, monthLabel: 'ottobre', allClosed: true } }),
    );
    expect(plain(verdict.sentence)).toBe(
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno. La rata di ottobre del piano di accumulo è chiusa.',
    );
  });

  it('articulates the preposition on the score, vowel-initial numbers included', () => {
    const headlineAt = (score: number) => buildAllocazioneVerdict(verdictInput({ score })).headline;
    // The owner's live score was 85, and the page printed «Allineato al 85%» until 2026-09-21.
    expect(headlineAt(85)).toBe("Allineato all'85%.");
    expect(headlineAt(8)).toBe("Allineato all'8%.");
    expect(headlineAt(11)).toBe("Allineato all'11%.");
    expect(headlineAt(1)).toBe("Allineato all'1%.");
    expect(headlineAt(80)).toBe("Allineato all'80%.");
    expect(headlineAt(89)).toBe("Allineato all'89%.");
    // …and the consonant-initial ones keep the plain «al».
    expect(headlineAt(90)).toBe('Allineato al 90%.');
    expect(headlineAt(79)).toBe('Allineato al 79%.');
    expect(headlineAt(0)).toBe('Allineato allo 0%.');
  });

  it('is positive when every class is within the band, and says which band', () => {
    const verdict = buildAllocazioneVerdict(verdictInput({ isBalanced: true, offTarget: [], score: 99 }));
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Tutte le classi sono entro la soglia del ±2%. Con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità.',
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
      'Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno. La leva è 1,30× contro un target di 1,50×.',
    );
    const inLine = buildAllocazioneVerdict(verdictInput({ leverage: { current: 1.5, target: 1.5 }, nextMoney: null }));
    expect(plain(inLine.sentence)).toContain('. La leva è 1,50×, in linea col target.');
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
    children: [],
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
      grossAmount: 1000,
      grossedUp: false,
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

  it('names the GROSS it sells when the request is a net — «prelevare 1000 €» means 1000 in hand', () => {
    const view: PlanView = {
      mode: 'withdraw',
      amount: 1000,
      grossAmount: 1087,
      grossedUp: true,
      nodes: [
        { key: 'equity', label: 'Azioni', amount: 837, currentValue: 142835, newValue: 141998, newPercentage: 58.1, targetPercentage: 55, children: [] },
        { key: 'commodity', label: 'Materie Prime', amount: 250, currentValue: 12740, newValue: 12490, newPercentage: 5, targetPercentage: 5, children: [] },
      ],
      trades: null,
      tradableTotal: 203000,
      exceedsPortfolio: false,
      overTarget: ['Azioni'],
    };
    // The rows below add up to the GROSS, so the sentence has to name it: a reader who checks them
    // must find the figure printed. And the net is already its subject, so the tax clause says only
    // what the broker keeps — never the net twice in one sentence.
    expect(plain(describePlan(view, band, { gross: 1087, tax: 87, net: 1000, unknownReason: null }))).toBe(
      'Per prelevare 1000 € netti vendi 1087 €: 837 € dalle azioni e 250 € dalle materie prime, partendo da ciò che è sopra target; la ritenuta stimata è 87 €.',
    );
  });

  it('names the orders of a leveraged withdrawal under the same net-then-gross head', () => {
    const trades = [
      { assetId: 'cl2', ticker: 'CL2', displayTicker: 'CL2', name: 'Amundi MSCI USA 2x', amount: -760 },
      { assetId: 'ntsg', ticker: 'NTSG', displayTicker: 'NTSG', name: 'WisdomTree Efficient Core', amount: -327 },
    ];
    const view: PlanView = {
      mode: 'withdraw', amount: 1000, grossAmount: 1087, grossedUp: true, nodes: [], trades,
      tradableTotal: 100000, exceedsPortfolio: false, overTarget: [],
    };
    // The grossed head already carries the verb: «netti vendi 1087 €: vendi 760 €…» would say it twice.
    expect(plain(describePlan(view, band, { gross: 1087, tax: 87, net: 1000, unknownReason: null }))).toBe(
      'Per prelevare 1000 € netti vendi 1087 €: 760 € di CL2 e 327 € di NTSG; la ritenuta stimata è 87 €.',
    );
    // Not estimable: no net is promised, the verb comes back and no tax clause is printed.
    expect(plain(describePlan({ ...view, grossAmount: 1000, grossedUp: false }, band, { gross: 1000, tax: null, net: null, unknownReason: 'cost-basis' }))).toBe(
      'Per prelevare 1000 €: vendi 760 € di CL2 e 327 € di NTSG.',
    );
  });

  it('says the net will fall short when even the gross does not fit', () => {
    const view: PlanView = {
      mode: 'withdraw',
      amount: 1000,
      grossAmount: 1050,
      grossedUp: true,
      nodes: [{ key: 'equity', label: 'Azioni', amount: 1050, currentValue: 1050, newValue: 0, newPercentage: 0, targetPercentage: 55, children: [] }],
      trades: null,
      tradableTotal: 1050,
      exceedsPortfolio: true,
      overTarget: [],
    };
    expect(plain(describePlan(view, band, { gross: 1050, tax: 84, net: 966, unknownReason: null }))).toBe(
      'Per prelevare 1000 € netti servirebbe vendere più dei 1050 € negoziabili: il piano liquida tutto; incassi 966 € netti, dopo circa 84 € di ritenuta.',
    );
  });

  it('warns when the withdrawal exceeds what can be sold', () => {
    const view: PlanView = { mode: 'withdraw', amount: 300000, grossAmount: 203000, grossedUp: false, nodes: [], trades: null, tradableTotal: 203000, exceedsPortfolio: true, overTarget: [] };
    expect(plain(describePlan(view, band))).toBe('300.000 € superano i 203.000 € negoziabili: il piano liquida tutto.');
    expect(plain(describePlan({ ...view, amount: 0, exceedsPortfolio: false }, band))).toBe('Inserisci un importo per vedere da dove conviene prelevare.');
  });

  it('keeps the disclaimers as the tile footer, per mode and per engine', () => {
    expect(describePlanFooter('rebalance', false)).toContain('Stima indicativa, non un consiglio finanziario.');
    expect(describePlanFooter('withdraw', false)).toContain('Le tasse sulla plusvalenza non sono considerate.');
    expect(describePlanFooter('contribute', true)).toContain('strumenti reali');
  });

  it('swaps the tax disclaimer for the method once the figure is printed', () => {
    // The two must never coexist: a footer disclaiming a tax the reading just quoted contradicts
    // its own tile.
    const withEstimate = describePlanFooter('rebalance', false, true);
    expect(withEstimate).not.toContain('Le tasse sulla plusvalenza non sono considerate.');
    expect(withEstimate).toContain('La ritenuta è stimata sulla plusvalenza della quota venduta');
    expect(describePlanFooter('withdraw', false, true)).toContain('minusvalenze pregresse');
  });

  it('follows the same tax rule under leverage, whose sells are now priced too', () => {
    for (const mode of ['rebalance', 'withdraw'] as const) {
      expect(describePlanFooter(mode, true, true)).toContain('La ritenuta è stimata sulla plusvalenza della quota venduta');
      expect(describePlanFooter(mode, true, true)).not.toContain('Le tasse sulla plusvalenza non sono considerate.');
      expect(describePlanFooter(mode, true, false)).toContain('Le tasse sulla plusvalenza non sono considerate.');
    }
  });

  describe('the sale tax clause', () => {
    const sells: PlanView = {
      mode: 'rebalance',
      moves: [move()],
      trades: null,
      resultingLeverageRatio: null,
    };

    it('names the net and the withholding after the plan, inside the full stop', () => {
      expect(plain(describePlan(sells, band, { gross: 8085, tax: 997, net: 7088, unknownReason: null }))).toBe(
        'Per rientrare nella soglia: vendi 8085 € di azioni, una sola operazione; incassi 7088 € netti, dopo circa 997 € di ritenuta.',
      );
    });

    it('says there is no withholding rather than printing a zero', () => {
      expect(plain(describePlan(sells, band, { gross: 8085, tax: 0, net: 8085, unknownReason: null }))).toContain(
        '; nessuna ritenuta, le posizioni da vendere non sono in guadagno.',
      );
    });

    it('drops the clause when the tax cannot be estimated, and never softens it', () => {
      const unknown = plain(describePlan(sells, band, { gross: 8085, tax: null, net: null, unknownReason: 'rate' }));
      expect(unknown).toBe('Per rientrare nella soglia: vendi 8085 € di azioni, una sola operazione.');
      expect(unknown).not.toContain('ritenuta');
    });

    it('never carries the clause on a contribution — a contribution sells nothing', () => {
      const contribute: PlanView = {
        mode: 'contribute',
        amount: 1000,
        nodes: [{ key: 'bonds', label: 'Obbligazioni', amount: 1000, currentValue: 53165, newValue: 54165, newPercentage: 24.2, targetPercentage: 25, children: [] }],
        trades: null,
        overTarget: [],
      };
      expect(plain(describePlan(contribute, band, { gross: 8085, tax: 997, net: 7088, unknownReason: null }))).not.toContain('ritenuta');
    });
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
  const highlights = {
    topHolding: { name: 'Apple', pct: 4.1, sourceCount: 3 },
    topSector: { label: 'Tecnologia', pct: 24.3 },
    topIssuer: { family: 'iShares', pct: 61 },
  };

  it('names the heaviest holding, the first sector and the biggest issuer, each on its own base', () => {
    expect(plain(describeExposure(highlights))).toBe(
      "Il titolo più pesante è Apple (4,1% dell'azionario nozionale, in 3 strumenti); il primo settore è Tecnologia (24,3%) e iShares emette il 61,0% degli strumenti quotati.",
    );
  });

  it('drops what is missing and is null with nothing', () => {
    expect(plain(describeExposure({ topHolding: { name: 'Enel', pct: 2, sourceCount: 1 }, topSector: null, topIssuer: null }))).toBe(
      "Il titolo più pesante è Enel (2,0% dell'azionario nozionale, in 1 strumento).",
    );
    expect(describeExposure({ topHolding: null, topSector: null, topIssuer: null })).toBeNull();
  });

  it('opens on the clause of the view the reader is in, keeping the other two', () => {
    expect(plain(describeExposure(highlights, 'sectors'))).toBe(
      "Il primo settore è Tecnologia (24,3%); il titolo più pesante è Apple (4,1% dell'azionario nozionale, in 3 strumenti) e iShares emette il 61,0% degli strumenti quotati.",
    );
    expect(plain(describeExposure(highlights, 'issuers'))).toBe(
      "iShares emette il 61,0% degli strumenti quotati; il titolo più pesante è Apple (4,1% dell'azionario nozionale, in 3 strumenti) e il primo settore è Tecnologia (24,3%).",
    );
  });
});

describe('describeExposureCoverage', () => {
  const bucket = (amount: number, ...instruments: string[]): ExposureBucket => ({ amount, instruments });
  /** The not-applicable bucket: euros by class of the quoted legs, plus the non-quoted instruments as one figure. */
  const notApplicable = (byClass: Record<string, number>, unquoted = 0, ...instruments: string[]): ExposureNotApplicable => ({
    amount: Object.values(byClass).reduce((sum, value) => sum + value, 0) + unquoted,
    instruments,
    byClass,
    unquoted,
  });
  const coverage = (overrides: Partial<ExposureCoverage>): ExposureCoverage => ({
    measure: 'notional',
    base: 0,
    read: bucket(0),
    unread: bucket(0),
    notApplicable: notApplicable({}),
    outOfView: bucket(0),
    named: 0,
    ...overrides,
  });
  const full = coverage({ base: 120000, read: bucket(113000, 'IWDA', 'CSPX'), unread: bucket(7000, 'Xtrackers Swap'), notApplicable: notApplicable({ commodity: 8000 }, 0, 'Oro fisico'), outOfView: bucket(40000, 'BTP'), named: 37200 });

  // The owner's finding on the mirror (2026-09-28): four figures in one row, «92.042 €» right after
  // «92.532 €», read as «almost nothing has holdings» when the first was OUTSIDE the base. Two
  // sentences now: what is in this view, then what is out of it and why.
  it('Titoli: what is in view and how much was read, then what is out of it and why', () => {
    expect(plain(describeExposureCoverage(full, 'holdings'))).toBe(
      'In questa vista: 120.000 € di azionario nozionale, letti al 94%: 7000 € (Xtrackers Swap) non hanno una composizione pubblicata; i primi dieci titoli di ogni fondo ne nominano il 31%, il resto è «Resto letto». Fuori da questa vista: 40.000 € di obbligazionario; 8000 € di materie prime, senza titoli per natura.',
    );
  });

  it('Settori: no «coprono» clause when the weights cover the sleeve, the clause when they do not', () => {
    expect(plain(describeExposureCoverage({ ...full, named: 113000 }, 'sectors'))).toBe(
      'In questa vista: 120.000 € di azionario nozionale, letti al 94%: 7000 € (Xtrackers Swap) non hanno una composizione pubblicata. Fuori da questa vista: 40.000 € di obbligazionario; 8000 € di materie prime, senza settori per natura.',
    );
    expect(plain(describeExposureCoverage({ ...full, named: 90000 }, 'sectors'))).toContain('; i settori pubblicati ne coprono il 75%, il resto è «Resto letto». Fuori');
    // Decided on the printed figures: 112.900 read and 112.500 named both print 94%, so no clause.
    expect(plain(describeExposureCoverage({ ...full, read: bucket(112900, 'IWDA'), named: 112500 }, 'holdings'))).not.toContain('nominano');
  });

  it('Emittenti: the market base, the unread named, the non-quoted out of view', () => {
    const issuers = coverage({ measure: 'market', base: 160000, read: bucket(147000, 'IWDA'), unread: bucket(13000, 'BTP Valore', 'Bitcoin'), notApplicable: notApplicable({}, 8000, 'Conto'), named: 147000 });
    expect(plain(describeExposureCoverage(issuers, 'issuers'))).toBe(
      'In questa vista: 160.000 € di strumenti quotati, letti al 92%: 13.000 € (BTP Valore e Bitcoin) non hanno un emittente letto. Fuori da questa vista: 8000 € di strumenti non quotati, senza emittente per natura.',
    );
  });

  it('says the not-applicable euros by CLASS, largest first, never by instrument', () => {
    const mixed = coverage({ base: 92532, read: bucket(92532, 'X'), named: 23000, notApplicable: notApplicable({ commodity: 30000, cash: 50000, crypto: 12042 }, 0, 'A', 'B', 'C', 'D', 'E') });
    expect(plain(describeExposureCoverage(mixed, 'holdings'))).toBe(
      'In questa vista: 92.532 € di azionario nozionale, letti tutti; i primi dieci titoli di ogni fondo ne nominano il 25%, il resto è «Resto letto». Fuori da questa vista: 92.042 € di liquidità, materie prime e criptovalute, senza titoli per natura.',
    );
    const withUnquoted = { ...mixed, notApplicable: notApplicable({ cash: 50000 }, 42042, 'A', 'Conto', 'Casa') };
    expect(plain(describeExposureCoverage(withUnquoted, 'holdings'))).toContain('Fuori da questa vista: 92.042 € di liquidità e strumenti non quotati, senza titoli per natura.');
    expect(plain(describeExposureCoverage(withUnquoted, 'holdings'))).not.toContain('Conto');
  });

  it('every clause falls at zero, and reading everything says so', () => {
    const all = coverage({ base: 50000, read: bucket(50000, 'IWDA'), named: 50000 });
    expect(plain(describeExposureCoverage(all, 'holdings'))).toBe('In questa vista: 50.000 € di azionario nozionale, letti tutti.');
    expect(plain(describeExposureCoverage({ ...all, named: 15000 }, 'holdings'))).toBe(
      'In questa vista: 50.000 € di azionario nozionale, letti tutti; i primi dieci titoli di ogni fondo ne nominano il 30%, il resto è «Resto letto».',
    );
    expect(plain(describeExposureCoverage({ ...all, notApplicable: notApplicable({ commodity: 8000 }, 0, 'Oro fisico') }, 'holdings'))).toBe(
      'In questa vista: 50.000 € di azionario nozionale, letti tutti. Fuori da questa vista: 8000 € di materie prime, senza titoli per natura.',
    );
    expect(plain(describeExposureCoverage({ ...all, outOfView: bucket(40000, 'BTP') }, 'holdings'))).toBe(
      'In questa vista: 50.000 € di azionario nozionale, letti tutti. Fuori da questa vista: 40.000 € di obbligazionario.',
    );
    expect(plain(describeExposureCoverage({ ...all, measure: 'market' }, 'issuers'))).toBe('In questa vista: 50.000 € di strumenti quotati, letti tutti.');
  });

  it('says when nothing is in view, and still names what is around it', () => {
    expect(plain(describeExposureCoverage(coverage({ notApplicable: notApplicable({ commodity: 8000 }, 0, 'Oro fisico'), outOfView: bucket(40000, 'BTP') }), 'holdings'))).toBe(
      'In questa vista: nessun azionario nozionale fra gli strumenti quotati. Fuori da questa vista: 40.000 € di obbligazionario; 8000 € di materie prime, senza titoli per natura.',
    );
    expect(plain(describeExposureCoverage(coverage({ measure: 'market', notApplicable: notApplicable({}, 8000, 'Conto') }), 'issuers'))).toBe(
      'In questa vista: nessuno strumento quotato. Fuori da questa vista: 8000 € di strumenti non quotati, senza emittente per natura.',
    );
    expect(plain(describeExposureCoverage(coverage({}), 'sectors'))).toBe('In questa vista: nessun azionario nozionale fra gli strumenti quotati.');
  });

  it('names at most three unread instruments, «e un altro» or «e altri N» for the rest', () => {
    const many = coverage({ base: 10000, unread: bucket(10000, 'A', 'B', 'C', 'D', 'E') });
    expect(plain(describeExposureCoverage(many, 'holdings'))).toContain('(A, B, C e altri 2)');
    expect(plain(describeExposureCoverage({ ...many, unread: bucket(10000, 'A', 'B', 'C', 'D') }, 'holdings'))).toContain('(A, B, C e un altro)');
    // Nothing read at all: «letti allo 0%».
    expect(plain(describeExposureCoverage({ ...many, unread: bucket(10000, 'A') }, 'holdings'))).toBe('In questa vista: 10.000 € di azionario nozionale, letti allo 0%: 10.000 € (A) non hanno una composizione pubblicata.');
  });
});

describe('the base, the empty state, the footer and the method', () => {
  it('names the base of the percentage column per view', () => {
    expect(describeExposureBase('holdings')).toBe("% dell'azionario nozionale");
    expect(describeExposureBase('sectors')).toBe("% dell'azionario nozionale");
    expect(describeExposureBase('issuers')).toBe('% degli strumenti quotati');
  });

  it('has an empty state, a footer dated on the OLDEST answer used, and a method', () => {
    expect(describeExposureEmpty()).toBe('Nessuno strumento quotato nel portafoglio di Allocazione.');
    expect(describeExposureFooter('2026-09-03T06:15:00.000Z')).toBe('Composizioni lette da Yahoo Finance, la più vecchia del 3 settembre.');
    expect(describeExposureFooter(null)).toBe('Composizioni lette da Yahoo Finance.');
    expect(describeExposureFooter('not a date')).toBe('Composizioni lette da Yahoo Finance.');
    expect(describeExposureMethod()).toHaveLength(3);
    expect(describeExposureMethod()[0]).toContain('nozionale');
    expect(describeExposureMethod(['NTSG.MI'])[3]).toContain('NTSG.MI');
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

// A class below zero (2026-10-17): its debts outweigh its assets, and the row says so.
describe('describeNegativeClassNote', () => {
  it('names the figure and the cause by class', () => {
    // Four-digit amounts print ungrouped in it-IT (AGENTS.md § Italian Localization); Intl's no-break space read as a space.
    const spaced = (note: string) => note.replace(/[  ]/g, ' ');
    expect(spaced(describeNegativeClassNote('cash', -3000))).toBe('−3000 €: i prestiti superano i conti');
    expect(spaced(describeNegativeClassNote('realestate', -12500.4))).toBe('−12.500 €: i mutui superano gli immobili');
    expect(spaced(describeNegativeClassNote('equity', -10))).toBe('−10 €: i debiti superano gli asset della classe');
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

// ─── The phone's cut (2026-10-15, the composition of the page) ────────────────
// Seen red one at a time: `leadLength` left `undefined` (no cut: `rest` empty with a next-money
// clause); the joiner put back to «; » (the lead no longer ends on «.»); `binding` dropped from
// the orphan sentence (the cut survived an unreachable target).

describe('buildAllocazioneVerdict — the cut (a full stop, at 1440 too)', () => {
  it('closes the first sentence on a full stop, at 1440 too, and names the rest', () => {
    const { lead, rest, restLabel } = splitVerdict(buildAllocazioneVerdict(verdictInput()));
    expect(plain(lead)).toBe('Le azioni pesano 3,3 pp più del target e le obbligazioni 3,3 pp meno.');
    expect(plain(rest)).toBe(' Con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità.');
    expect(restLabel).toBe('dove vanno i prossimi soldi');
  });

  it('labels the rest by what it holds: the leverage, the next money, or both', () => {
    expect(buildAllocazioneVerdict(verdictInput({ leverage: { current: 1.3, target: 1.5 }, nextMoney: null })).restLabel).toBe('la leva');
    expect(buildAllocazioneVerdict(verdictInput({ leverage: { current: 1.3, target: 1.5 } })).restLabel).toBe('la leva e i prossimi soldi');
    expect(plain(splitVerdict(buildAllocazioneVerdict(verdictInput({ leverage: { current: 1.3, target: 1.5 } }))).rest)).toBe(
      ' La leva è 1,30× contro un target di 1,50×. Con 1000 € in più compreresti 940 € di obbligazioni e 60 € di liquidità.',
    );
  });

  it('does not cut a verdict with nothing after the first sentence', () => {
    const verdict = buildAllocazioneVerdict(verdictInput({ nextMoney: null }));
    expect(verdict.leadLength).toBeUndefined();
    expect(verdict.restLabel).toBeUndefined();
    expect(splitVerdict(verdict).rest).toEqual([]);
  });

  it('keeps an unreachable target on the first screen: the orphan sentence is binding and cancels the cut', () => {
    const verdict = buildAllocazioneVerdict(
      verdictInput({ orphans: [{ assetClass: 'realestate', subCategory: 'Prima casa', label: 'Immobili → Prima casa', targetPercentage: 70, excludedValue: 180000 }] }),
    );
    expect(verdict.leadLength).toBeDefined();
    expect(verdict.sentence.filter((segment) => segment.binding).map((segment) => segment.text).join('')).toContain('non è raggiungibile');
    expect(splitVerdict(verdict).rest).toEqual([]);
    expect(plain(splitVerdict(verdict).lead)).toContain('Con 1000 € in più compreresti');
  });
});

// ─── The closed rows' words (2026-10-16, in the retirement of the composition) ───────────────────

describe('the closed rows\' asides — words, never a figure', () => {
  it('names the four rows without a digit', () => {
    expect(ALLOCAZIONE_CLOSED_ASIDES).toEqual({
      [ALLOCAZIONE_SECTION_IDS.perClasse]: 'corrente, target e gap',
      [ALLOCAZIONE_SECTION_IDS.piano]: 'Ribilancia, Versa o Preleva',
      [ALLOCAZIONE_SECTION_IDS.esposizione]: 'titoli, settori, emittenti',
      [ALLOCAZIONE_SECTION_IDS.previdenza]: 'il fondo nel mix',
    });
    for (const aside of Object.values(ALLOCAZIONE_CLOSED_ASIDES)) expect(aside).not.toMatch(/\d/);
  });
});

// ─── The closed rows' answers (landscape index, 2026-10-16) ──────────────────

/**
 * Each closed row's answer: one figure the strip, THE tile and the verdict's first sentence do not
 * print, or null where the row keeps its scope. Read as the index lays it out (segments trimmed,
 * one gap between them). Falsified on 2026-10-16, one at a time: the in-line null of Per classe
 * went red with the `every(OK)` branch dropped; the long-label null with the `ANSWER_MAX_CHARS`
 * guard removed; the Piano's Versa null with the `mode !== 'rebalance'` check dropped; the
 * frozen-sell count with `isPlanOperation` counting every move (the reading's «due operazioni»
 * went red with it too).
 */
describe('describeAllocazioneClosedAnswers', () => {
  const answerText = (answer: Narrative | null | undefined) => (answer ? flat(answer.map((segment) => segment.text.trim()).join(' ')) : null);
  const move = (overrides: Partial<RebalanceMove> = {}): RebalanceMove => ({
    assetClass: 'realestate',
    label: 'Immobili',
    action: 'VENDI' as const,
    amount: 20000,
    requestedAmount: 20000,
    limitedByFrozen: false,
    differencePp: 4,
    currentPercentage: 44,
    targetPercentage: 40,
    children: [],
    ...overrides,
  });
  const rebalance = (moves: RebalanceMove[]): PlanView => ({ mode: 'rebalance', moves, trades: null, resultingLeverageRatio: null });
  const pension = {
    fundCount: 1,
    fundValue: 12000,
    fundSlices: [{ assetClass: 'equity', label: 'Azioni', value: 12000, percentage: 100 }],
    combinedTotal: 312000,
    combinedSlices: [{ assetClass: 'realestate', label: 'Immobili', value: 250000, percentage: 80.1 }],
    hasExcluded: false,
    allFrozen: true,
  };
  const gaps = [
    gap({ assetClass: 'realestate', label: 'Immobili', differenceValue: 250000, action: 'VENDI' }),
    gap({ assetClass: 'equity', label: 'Azioni', differenceValue: -150000, action: 'COMPRA' }),
    gap({ assetClass: 'cash', label: 'Liquidità', differenceValue: 800, action: 'OK' }),
  ];
  const fourMoves = rebalance([
    move(),
    move({ assetClass: 'cash', label: 'Liquidità', amount: 5000, requestedAmount: 5000 }),
    move({ assetClass: 'equity', label: 'Azioni', action: 'COMPRA', amount: 15000, requestedAmount: 15000 }),
    move({ assetClass: 'bonds', label: 'Obbligazioni', action: 'COMPRA', amount: 10000, requestedAmount: 10000 }),
  ]);
  const input = { gaps, planView: fourMoves, pension };
  const answers = describeAllocazioneClosedAnswers(input);

  it('answers every row, Esposizione never', () => {
    expect(answerText(answers[ALLOCAZIONE_SECTION_IDS.perClasse])).toBe('Immobili +250.000 €');
    expect(answerText(answers[ALLOCAZIONE_SECTION_IDS.piano])).toBe('quattro operazioni');
    expect(answerText(answers[ALLOCAZIONE_SECTION_IDS.previdenza])).toBe('Azioni 100%');
    expect(answers[ALLOCAZIONE_SECTION_IDS.esposizione]).toBeNull();
  });

  it('fits in 22 characters; one uncoloured figure, none in the Piano (its count is a word)', () => {
    for (const id of [ALLOCAZIONE_SECTION_IDS.perClasse, ALLOCAZIONE_SECTION_IDS.piano, ALLOCAZIONE_SECTION_IDS.previdenza]) {
      expect(answerText(answers[id])!.length).toBeLessThanOrEqual(22);
    }
    for (const id of [ALLOCAZIONE_SECTION_IDS.perClasse, ALLOCAZIONE_SECTION_IDS.previdenza]) {
      const figures = answers[id]!.filter((segment) => segment.mono);
      expect(figures).toHaveLength(1);
      // A drift and a share are neither a gain nor a loss.
      expect(figures[0].sign).toBeUndefined();
    }
    expect(answers[ALLOCAZIONE_SECTION_IDS.piano]!.some((segment) => segment.mono)).toBe(false);
  });

  it('Per classe: a class short of its target with the minus, null when every class is in line or the label is too long', () => {
    const short = describeAllocazioneClosedAnswers({ ...input, gaps: [gap({ label: 'Azioni', differenceValue: -90000, action: 'COMPRA' })] });
    expect(answerText(short[ALLOCAZIONE_SECTION_IDS.perClasse])).toBe('Azioni −90.000 €');
    const inLine = describeAllocazioneClosedAnswers({ ...input, gaps: [gap({ differenceValue: 800, action: 'OK' }), gap({ assetClass: 'bonds', label: 'Obbligazioni', differenceValue: -800, action: 'OK' })] });
    expect(inLine[ALLOCAZIONE_SECTION_IDS.perClasse]).toBeNull();
    const long = describeAllocazioneClosedAnswers({ ...input, gaps: [gap({ assetClass: 'trendFollowing', label: 'Trend Following', differenceValue: 12000, action: 'VENDI' })] });
    expect(long[ALLOCAZIONE_SECTION_IDS.perClasse]).toBeNull();
    expect(describeAllocazioneClosedAnswers({ ...input, gaps: [] })[ALLOCAZIONE_SECTION_IDS.perClasse]).toBeNull();
  });

  it('Piano: one operation, none, a frozen sell not counted; null outside Ribilancia and on the leverage engine', () => {
    expect(answerText(describeAllocazioneClosedAnswers({ ...input, planView: rebalance([move()]) })[ALLOCAZIONE_SECTION_IDS.piano])).toBe('una sola operazione');
    expect(answerText(describeAllocazioneClosedAnswers({ ...input, planView: rebalance([]) })[ALLOCAZIONE_SECTION_IDS.piano])).toBe('nessuna operazione');
    const frozen = rebalance([
      move({ amount: 0, requestedAmount: 3000, limitedByFrozen: true }),
      move({ assetClass: 'cash', label: 'Liquidità', amount: 2000, requestedAmount: 8000, limitedByFrozen: true }),
      move({ assetClass: 'equity', label: 'Azioni', action: 'COMPRA', amount: 11000, requestedAmount: 11000 }),
    ]);
    expect(answerText(describeAllocazioneClosedAnswers({ ...input, planView: frozen })[ALLOCAZIONE_SECTION_IDS.piano])).toBe('due operazioni');
    // The reading counts the same moves.
    expect(plain(describePlan(frozen, { type: 'fixed', pp: 2 }))).toContain('due operazioni');
    const allFrozen = rebalance([move({ amount: 0, requestedAmount: 3000, limitedByFrozen: true })]);
    expect(describeAllocazioneClosedAnswers({ ...input, planView: allFrozen })[ALLOCAZIONE_SECTION_IDS.piano]).toBeNull();
    const contribute: PlanView = { mode: 'contribute', amount: 1000, nodes: [], trades: null, overTarget: [] };
    expect(describeAllocazioneClosedAnswers({ ...input, planView: contribute })[ALLOCAZIONE_SECTION_IDS.piano]).toBeNull();
    const withdraw: PlanView = { mode: 'withdraw', amount: 1000, grossAmount: 1000, grossedUp: false, nodes: [], trades: null, tradableTotal: 50000, exceedsPortfolio: false, overTarget: [] };
    expect(describeAllocazioneClosedAnswers({ ...input, planView: withdraw })[ALLOCAZIONE_SECTION_IDS.piano]).toBeNull();
    const leveraged: PlanView = { ...fourMoves, trades: [] } as PlanView;
    expect(describeAllocazioneClosedAnswers({ ...input, planView: leveraged })[ALLOCAZIONE_SECTION_IDS.piano]).toBeNull();
    expect(describeAllocazioneClosedAnswers({ ...input, planView: null })[ALLOCAZIONE_SECTION_IDS.piano]).toBeNull();
  });

  it('Previdenza: the largest slice of the funds\' mix to the unit, null without funds or a mix', () => {
    const mixed = { ...pension, fundSlices: [{ assetClass: 'bonds', label: 'Obbligazioni', value: 8400, percentage: 70.4 }, { assetClass: 'equity', label: 'Azioni', value: 3600, percentage: 29.6 }] };
    expect(answerText(describeAllocazioneClosedAnswers({ ...input, pension: mixed })[ALLOCAZIONE_SECTION_IDS.previdenza])).toBe('Obbligazioni 70%');
    expect(describeAllocazioneClosedAnswers({ ...input, pension: { ...pension, fundSlices: [] } })[ALLOCAZIONE_SECTION_IDS.previdenza]).toBeNull();
    expect(describeAllocazioneClosedAnswers({ ...input, pension: null })[ALLOCAZIONE_SECTION_IDS.previdenza]).toBeNull();
  });
});

// The line above the Piano's moves while an accumulation plan is active.
describe('describePacOverlap', () => {
  const pac = { monthTotalEur: 4207, instrumentCount: 7, monthLabel: 'ottobre', allClosed: false };

  it('says what the plan buys this month and that this plan does not count it', () => {
    expect(plain(describePacOverlap(pac))).toBe('Il piano di accumulo compra questo mese 4207 € in 7 strumenti; questo piano non ne tiene conto.');
    expect(plain(describePacOverlap({ ...pac, instrumentCount: 1 }))).toBe('Il piano di accumulo compra questo mese 4207 € in 1 strumento; questo piano non ne tiene conto.');
  });

  it('names the instrument the plan buys in place of one this Piano proposes', () => {
    expect(plain(describePacOverlap(pac, [{ replaced: 'DBMFE', buying: 'MFEH' }]))).toBe(
      'Il piano di accumulo compra questo mese 4207 € in 7 strumenti; questo piano non ne tiene conto. Il piano di accumulo compra MFEH al posto di DBMFE.',
    );
    expect(plain(describePacOverlap(pac, [{ replaced: 'DBMFE', buying: 'MFEH' }, { replaced: 'AAA', buying: 'BBB' }]))).toContain('compra MFEH al posto di DBMFE e BBB al posto di AAA.');
  });

  it('still says it when the month\'s installment is closed', () => {
    expect(plain(describePacOverlap({ ...pac, allClosed: true }))).toBe('La rata di ottobre del piano di accumulo è chiusa, ma questo piano non ne tiene conto.');
  });
});
