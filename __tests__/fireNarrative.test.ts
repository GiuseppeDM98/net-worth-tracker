/**
 * Tests for lib/utils/fireNarrative.ts — the words of FIRE › Calcolatore: the verdict that
 * answers «quando?» before any number, and the reading line of every tile.
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
  buildFireVerdict,
  describeBase,
  describeBaseAside,
  describeBaseFooter,
  describeDettaglio,
  describeImpostazioni,
  describeLock,
  describeParametri,
  describePassiveIncome,
  describeRitaPreview,
  describeRunway,
  describeScenarioParams,
  describeScenarios,
  describeScenariosFooter,
  describeTarget,
  describeTargetCaption,
  describeTargetFooter,
  type FireVerdictInput,
} from '@/lib/utils/fireNarrative';
import type { FanVerdict, FireLock, FireTarget, FireTimeline, PassiveIncome, ScenarioRow } from '@/lib/utils/fireSummary';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

/** The screen prints a no-break space before €; the tests read it as a normal one. */
const flat = (text: string | undefined | null) => text?.replace(/[  ]/g, ' ');
const plain = (narrative: Narrative | null | undefined) => (narrative ? narrativeToText(narrative).replace(/[  ]/g, ' ') : null);

const target = (overrides: Partial<FireTarget> = {}): FireTarget => ({
  fireNumber: 604_000,
  standardFireNumber: 690_000,
  isBridge: true,
  netWorth: 412_500,
  progressPct: 68.29,
  gap: 191_500,
  reached: false,
  ...overrides,
});

const timeline = (overrides: Partial<FireTimeline> = {}): FireTimeline => ({
  yearsToFire: 6,
  calendarYear: 2032,
  ageAtFire: 44,
  horizonYears: 50,
  horizonCalendarYear: 2076,
  monthlyExpensesToday: 2_300,
  monthlyExpensesAtFire: 2_667.4,
  growthRate: 7,
  inflationRate: 2.5,
  ...overrides,
});

const lockOn = (overrides: Partial<FireLock> = {}): FireLock => ({
  active: true,
  lockedValue: 48_000,
  unlockCalendarYear: 2050,
  unlockAge: 62,
  source: 'rita',
  lockedFundCount: 1,
  unmodellableCount: 0,
  ...overrides,
});

const lockOff: FireLock = { active: false, lockedValue: 0, unlockCalendarYear: null, unlockAge: null, source: null, lockedFundCount: 0, unmodellableCount: 0 };

const income = (overrides: Partial<PassiveIncome> = {}): PassiveIncome => ({
  annual: 16_500,
  monthly: 1_375,
  daily: 45.2,
  shareOfExpensesPct: 59.8,
  yearsOfExpenses: 14.946,
  liquidYears: 9.42,
  illiquidYears: 5.53,
  currentWR: 6.69,
  swr: 4,
  overSwr: true,
  ...overrides,
});

const scenarios = (overrides: Partial<Record<'bear' | 'base' | 'bull', Partial<ScenarioRow>>> = {}): ScenarioRow[] => [
  { key: 'bear', label: 'Orso', yearsToFire: 10, calendarYear: 2036, growthRate: 5, inflationRate: 3.5, ...overrides.bear },
  { key: 'base', label: 'Base', yearsToFire: 6, calendarYear: 2032, growthRate: 7, inflationRate: 2.5, ...overrides.base },
  { key: 'bull', label: 'Toro', yearsToFire: 4, calendarYear: 2030, growthRate: 9, inflationRate: 2, ...overrides.bull },
];

function verdictInput(overrides: Partial<FireVerdictInput> = {}): FireVerdictInput {
  return {
    hasNetWorth: true,
    target: target(),
    timeline: timeline(),
    monthlySavings: 1_850,
    swr: 4,
    monthlyAllowance: 1_375,
    lock: lockOn(),
    ...overrides,
  };
}

describe('buildFireVerdict', () => {
  it('names the year and the age, the gap, the pace, the passive income in both moneys and the lock', () => {
    // The unlock (2030) precedes the FIRE year: the fund is in, the 4% clause applies.
    const verdict = buildFireVerdict(verdictInput({ lock: lockOn({ unlockCalendarYear: 2030 }) }));
    expect(verdict.headline).toBe('FIRE nel 2032, a 44 anni.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      'Ti mancano 191.500 € al numero FIRE di 604.000 € (modello ponte); al ritmo di 1850 € al mese ci arrivi nel 2032, a 44 anni, e da allora il 4% del patrimonio copre le tue spese: 2300 € al mese di oggi, 2667 € del 2032 con l\'inflazione al 2,5%. Il fondo pensione, 48.000 €, resta bloccato fino al 2030 e non conta nel patrimonio di oggi.',
    );
  });

  it('sets the figures in mono and never colours a projection as a gain or a loss', () => {
    const verdict = buildFireVerdict(verdictInput({ lock: lockOn({ unlockCalendarYear: 2030 }) }));
    const figures = verdict.sentence.filter((segment) => segment.mono);
    expect(figures.map((segment) => flat(segment.text))).toEqual(['191.500 €', '604.000 €', '1850 €', '2032', '44 anni', '4%', '2300 €', '2667 €', '2,5%', '48.000 €', '2030']);
    expect(figures.every((segment) => segment.sign === undefined)).toBe(true);
  });

  it('under the bridge, a FIRE year before the unlock says the free assets cover the expenses until then', () => {
    const verdict = buildFireVerdict(verdictInput({ lock: lockOn({ unlockCalendarYear: 2050 }) }));
    expect(plain(verdict.sentence)).toContain(', e da allora gli asset liberi coprono le tue spese fino al 2050, poi rientra il fondo pensione: 2300 € al mese di oggi, 2667 € del 2032');
    // Unlock BEFORE the FIRE year: the fund is already in, the 4% clause is the true one.
    const after = buildFireVerdict(verdictInput({ lock: lockOn({ unlockCalendarYear: 2030 }) }));
    expect(plain(after.sentence)).toContain(', e da allora il 4% del patrimonio copre le tue spese: ');
  });

  it('drops the age without a user age, the lock clause when the lock is off, and says «standard» without the bridge', () => {
    const verdict = buildFireVerdict(verdictInput({ timeline: timeline({ ageAtFire: null }), lock: lockOff, target: target({ isBridge: false, fireNumber: 690_000, gap: 277_500 }) }));
    expect(verdict.headline).toBe('FIRE nel 2032.');
    expect(verdict.headline).toBe('FIRE nel 2032.');
    expect(plain(verdict.sentence)).toBe(
      'Ti mancano 277.500 € al numero FIRE di 690.000 €; al ritmo di 1850 € al mese ci arrivi nel 2032, e da allora il 4% del patrimonio copre le tue spese: 2300 € al mese di oggi, 2667 € del 2032 con l\'inflazione al 2,5%.',
    );
  });

  it('reads «senza nuovi risparmi» when nothing is saved, and one figure when inflation is zero', () => {
    const verdict = buildFireVerdict(verdictInput({ monthlySavings: 0, timeline: timeline({ inflationRate: 0, monthlyExpensesAtFire: 2_300 }), lock: lockOff }));
    expect(plain(verdict.sentence)).toBe(
      'Ti mancano 191.500 € al numero FIRE di 604.000 € (modello ponte); senza nuovi risparmi, con la sola crescita del 7%, ci arrivi nel 2032, a 44 anni, e da allora il 4% del patrimonio copre le tue spese, 2300 € al mese.',
    );
  });

  it('pluralises the lock clause for several funds and drops it when nothing is locked', () => {
    const two = buildFireVerdict(verdictInput({ lock: lockOn({ lockedFundCount: 2, source: 'mixed', unlockAge: null }) }));
    expect(plain(two.sentence)).toContain(' I fondi pensione, 48.000 €, restano bloccati fino al 2050 e non contano nel patrimonio di oggi.');
    const none = buildFireVerdict(verdictInput({ lock: lockOn({ lockedValue: 0, unlockCalendarYear: null, lockedFundCount: 0, source: null }) }));
    expect(plain(none.sentence)).not.toContain('fondo pensione');
  });

  it('celebrates a reached FIRE with the allowance against the expenses', () => {
    const verdict = buildFireVerdict(verdictInput({ target: target({ netWorth: 720_000, fireNumber: 690_000, standardFireNumber: 690_000, isBridge: false, progressPct: 104.35, gap: 0, reached: true }), monthlyAllowance: 2_400, lock: lockOff }));
    expect(verdict.headline).toBe('Sei già FIRE.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe('Il patrimonio FIRE di 720.000 € supera il numero FIRE di 690.000 €: al 4% rende 2400 € al mese, contro spese di 2300 €.');
  });

  it('warns beyond the horizon and names the year the horizon ends', () => {
    const verdict = buildFireVerdict(verdictInput({ timeline: timeline({ yearsToFire: null, calendarYear: null, ageAtFire: null, monthlyExpensesAtFire: null }), lock: lockOff }));
    expect(verdict.headline).toBe('FIRE oltre i 50 anni.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      'Ti mancano 191.500 € al numero FIRE di 604.000 € (modello ponte); al ritmo di 1850 € al mese, con crescita del 7% e inflazione al 2,5%, il traguardo non arriva entro il 2076.',
    );
  });

  it('explains the two empty states instead of printing placeholders', () => {
    const noWealth = buildFireVerdict(verdictInput({ hasNetWorth: false, target: null, timeline: null }));
    expect(noWealth.headline).toBe('Nessun patrimonio FIRE.');
    expect(noWealth.tone).toBe('neutral');
    expect(plain(noWealth.sentence)).toBe('Aggiungi asset con un valore positivo: il calcolatore parte dal patrimonio che può sostenere i prelievi.');

    const noExpenses = buildFireVerdict(verdictInput({ target: null, timeline: null }));
    expect(noExpenses.headline).toBe('Numero FIRE non calcolabile.');
    expect(plain(noExpenses.sentence)).toBe('Servono spese registrate nel Cashflow: il numero FIRE è spese annue ÷ SWR.');
  });

  it('states the target when the projection cannot run', () => {
    const verdict = buildFireVerdict(verdictInput({ timeline: null, lock: lockOff }));
    expect(verdict.headline).toBe('Proiezione non disponibile.');
    expect(plain(verdict.sentence)).toBe('Ti mancano 191.500 € al numero FIRE di 604.000 € (modello ponte); senza il cashflow di un anno non posso stimare quando ci arrivi.');
  });
});

describe('describeTarget', () => {
  it('reads the progress with the two figures and the gap', () => {
    expect(plain(describeTarget(target()))).toBe('Sei al 68,3% del numero FIRE: 412.500 € su 604.000 €, ne mancano 191.500 €.');
  });

  it('reads a reached target as exceeded', () => {
    expect(plain(describeTarget(target({ netWorth: 720_000, fireNumber: 690_000, progressPct: 104.35, gap: 0, reached: true })))).toBe('Hai superato il numero FIRE: 720.000 € su 690.000 €, il 104,3%.');
  });

  it('captions the number by its formula, and the bridge by what it changes', () => {
    expect(flat(plain(describeTargetCaption(target({ isBridge: false, fireNumber: 690_000 }), 27_600)))).toBe('27.600 € di spese ÷ SWR del 4%');
    expect(flat(plain(describeTargetCaption(target(), 27_600)))).toBe('modello ponte: gli asset liberi coprono le spese fino allo sblocco, poi il fondo rientra; senza il vincolo sarebbe 690.000 €');
  });
});

describe('describeTargetFooter', () => {
  const fan: FanVerdict = { calendarYear: 2032, probabilityPct: 71, onHorizon: false };

  it('explains the dashed line in the Scenari view, and the step only when the plot reaches the unlock year', () => {
    expect(plain(describeTargetFooter({ view: 'scenari', fan: null, fanAvailable: true, lock: lockOff, simulationCount: 1000, allocationLabel: '', lastProjectedYear: 2046 }))).toBe(
      'Linea tratteggiata: il numero FIRE dello scenario base, che cresce con l\'inflazione; il risparmio si ferma al FIRE.',
    );
    expect(plain(describeTargetFooter({ view: 'scenari', fan: null, fanAvailable: true, lock: lockOn(), simulationCount: 1000, allocationLabel: '', lastProjectedYear: 2055 }))).toContain(' Il gradino nel 2050 è il fondo pensione che rientra.');
    // The walk stopped in 2046: the 2050 step is not on the plot, so the footer does not name it.
    expect(plain(describeTargetFooter({ view: 'scenari', fan: null, fanAvailable: true, lock: lockOn(), simulationCount: 1000, allocationLabel: '', lastProjectedYear: 2046 }))).not.toContain('gradino');
  });

  it('states the probability in the Ventaglio view, with the allocation and the inflow model', () => {
    expect(plain(describeTargetFooter({ view: 'ventaglio', fan, fanAvailable: true, lock: lockOn(), simulationCount: 1000, allocationLabel: '62% azioni, 28% obbligazioni, 10% immobili', lastProjectedYear: 2046 }))).toBe(
      'Probabilità di FIRE entro il 2032: 71% su 1000 percorsi con l\'allocazione attuale (62% azioni, 28% obbligazioni, 10% immobili). Il fondo pensione entra all\'anno di sblocco al valore di oggi.',
    );
    expect(plain(describeTargetFooter({ view: 'ventaglio', fan: { ...fan, onHorizon: true, calendarYear: 2066 }, fanAvailable: true, lock: lockOff, simulationCount: 1000, allocationLabel: '100% azioni', lastProjectedYear: 2046 }))).toBe(
      'Probabilità di FIRE entro il 2066 (orizzonte della simulazione): 71% su 1000 percorsi con l\'allocazione attuale (100% azioni).',
    );
  });

  it('says why the fan cannot run', () => {
    expect(plain(describeTargetFooter({ view: 'ventaglio', fan: null, fanAvailable: false, lock: lockOff, simulationCount: 1000, allocationLabel: '', lastProjectedYear: 2046 }))).toBe(
      'Il ventaglio richiede un\'allocazione in azioni, obbligazioni, immobili o materie prime.',
    );
  });
});

describe('describeBase', () => {
  const base = { netWorth: 412_500, annualExpenses: 27_600, monthlyExpenses: 2_300, annualSavings: 22_200, monthlySavings: 1_850, swr: 4, referenceYear: 2025, isAnnualized: false, includesResidence: false };

  it('reads the three inputs of the number', () => {
    expect(plain(describeBase(base))).toBe('Calcolato su 412.500 € di patrimonio, spese di 27.600 € l\'anno e un SWR del 4%.');
  });

  it('names the cashflow year in the aside, and whether it is annualized', () => {
    expect(describeBaseAside(base)).toBe('cashflow 2025');
    expect(describeBaseAside({ ...base, referenceYear: 2026, isAnnualized: true })).toBe('cashflow 2026, annualizzato');
    expect(describeBaseAside({ ...base, referenceYear: null })).toBeNull();
  });

  it('footer: the residence rule and where the settings live', () => {
    expect(plain(describeBaseFooter(false))).toBe('Casa di abitazione esclusa; SWR, casa e regola RITA si modificano in Parametri.');
    expect(plain(describeBaseFooter(true))).toBe('Casa di abitazione inclusa; SWR, casa e regola RITA si modificano in Parametri.');
  });
});

describe('describeLock', () => {
  it('reads the rule-driven, override-driven and mixed unlocks', () => {
    expect(plain(describeLock(lockOn()))).toBe('48.000 € fino al 2050, a 62 anni (regola RITA)');
    expect(plain(describeLock(lockOn({ source: 'override', unlockAge: null, unlockCalendarYear: 2035 })))).toBe('48.000 € fino al 2035 (data impostata sul fondo)');
    expect(plain(describeLock(lockOn({ source: 'mixed', unlockAge: null, lockedFundCount: 2 })))).toBe('48.000 € fino al 2050 (date sui fondi e regola RITA)');
  });

  it('says when the toggle is off, when nothing is locked, and when a fund cannot be modelled', () => {
    expect(plain(describeLock(lockOff))).toBe('Il fondo pensione conta nel patrimonio di oggi.');
    expect(plain(describeLock(lockOn({ lockedValue: 0, unlockCalendarYear: null, lockedFundCount: 0, source: null })))).toBe('Nessun fondo pensione risulta bloccato.');
    expect(plain(describeLock(lockOn({ lockedValue: 0, unlockCalendarYear: null, lockedFundCount: 0, source: null, unmodellableCount: 1 })))).toBe(
      'Nessun fondo bloccato: manca la tua età (in Coast FIRE) o una data di sblocco sul fondo.',
    );
    expect(plain(describeLock(lockOn({ unmodellableCount: 1 })))).toBe('48.000 € fino al 2050, a 62 anni (regola RITA); un fondo senza età né data resta non bloccato');
  });
});

describe('describePassiveIncome', () => {
  it('reads the monthly allowance, its share of the expenses and the years covered', () => {
    expect(plain(describePassiveIncome(income()))).toBe('Oggi il patrimonio renderebbe 1375 € al mese, il 60% delle spese; copre 14,9 anni di spesa, 9,4 con i soli liquidi.');
  });

  it('drops the share without expenses and the liquid clause without liquid assets', () => {
    expect(plain(describePassiveIncome(income({ shareOfExpensesPct: null, yearsOfExpenses: 0, liquidYears: 0 })))).toBe('Oggi il patrimonio renderebbe 1375 € al mese.');
    expect(plain(describePassiveIncome(income({ liquidYears: 0 })))).toBe('Oggi il patrimonio renderebbe 1375 € al mese, il 60% delle spese; copre 14,9 anni di spesa.');
  });

  it('uses the elided article before a vowel-initial share', () => {
    expect(plain(describePassiveIncome(income({ shareOfExpensesPct: 80.4 })))).toContain("l'80% delle spese");
  });
});

describe('describeScenarios', () => {
  it('reads the three years around the base', () => {
    expect(plain(describeScenarios(scenarios()))).toBe('Nel base il FIRE arriva nel 2032; l\'orso lo sposta al 2036, il toro lo anticipa al 2030.');
  });

  it('handles a scenario beyond the horizon and one that does not move the year', () => {
    expect(plain(describeScenarios(scenarios({ bear: { yearsToFire: null, calendarYear: null } })))).toBe('Nel base il FIRE arriva nel 2032; l\'orso non ci arriva entro 50 anni, il toro lo anticipa al 2030.');
    expect(plain(describeScenarios(scenarios({ bull: { yearsToFire: 6, calendarYear: 2032 } })))).toBe('Nel base il FIRE arriva nel 2032; l\'orso lo sposta al 2036, il toro lo lascia al 2032.');
    // The verb follows the comparison: a «toro» the user parametrised to land later is said to move it later.
    expect(plain(describeScenarios(scenarios({ bull: { yearsToFire: 8, calendarYear: 2034 }, bear: { yearsToFire: 4, calendarYear: 2030 } })))).toBe('Nel base il FIRE arriva nel 2032; l\'orso lo anticipa al 2030, il toro lo sposta al 2034.');
    expect(plain(describeScenarios(scenarios({ base: { yearsToFire: null, calendarYear: null }, bear: { yearsToFire: null, calendarYear: null } })))).toBe('Nel base il FIRE non arriva entro 50 anni; nemmeno nell\'orso, il toro lo raggiunge nel 2030.');
    expect(plain(describeScenarios(scenarios({ base: { yearsToFire: null, calendarYear: null }, bear: { yearsToFire: null, calendarYear: null }, bull: { yearsToFire: null, calendarYear: null } })))).toBe('In nessuno scenario il FIRE arriva entro 50 anni.');
  });

  it('footer: the model, in words', () => {
    expect(plain(describeScenariosFooter())).toBe('Ogni anno il patrimonio cresce del rendimento dello scenario e riceve il risparmio finché il FIRE non è raggiunto; le spese crescono con l\'inflazione dello scenario.');
  });
});

describe('the disclosures', () => {
  it('describe Parametri with the saved settings and the three scenarios', () => {
    expect(describeParametri({ swr: 4, includesResidence: false, lockActive: true, inpsRetirementAge: 67, ritaUnlockAge: 62, scenarios: { bear: { growthRate: 5, inflationRate: 3.5 }, base: { growthRate: 7, inflationRate: 2.5 }, bull: { growthRate: 9, inflationRate: 2 } } })).toBe(
      'SWR 4% · casa di abitazione esclusa · fondo pensione bloccato (INPS 67, RITA a 62) · scenari 5/3,5 · 7/2,5 · 9/2',
    );
    expect(describeParametri({ swr: 3.5, includesResidence: true, lockActive: false, inpsRetirementAge: 67, ritaUnlockAge: 62, scenarios: { bear: { growthRate: 4, inflationRate: 3.5 }, base: { growthRate: 7, inflationRate: 2.5 }, bull: { growthRate: 10, inflationRate: 1.5 } } })).toBe(
      'SWR 3,5% · casa di abitazione inclusa · fondo pensione non vincolato · scenari 4/3,5 · 7/2,5 · 10/1,5',
    );
  });

  it('describe Dettaglio by what it holds, dropping what is missing', () => {
    expect(flat(describeDettaglio({ runwayYears: 14.9, runwayDelta: 1.2 }))).toBe('Runway storica (14,9 anni, +1,2 in 12 mesi) · Cashflow e reddito passivo · Come funziona il FIRE');
    expect(flat(describeDettaglio({ runwayYears: null, runwayDelta: null }))).toBe('Runway storica · Cashflow e reddito passivo · Come funziona il FIRE');
    expect(flat(describeDettaglio({ runwayYears: 14.9, runwayDelta: null }))).toBe('Runway storica (14,9 anni) · Cashflow e reddito passivo · Come funziona il FIRE');
  });

  it('read the Impostazioni and the scenario parameters', () => {
    expect(plain(describeImpostazioni(false))).toBe('Salvate nel profilo: ogni modifica qui è un\'anteprima finché non la salvi.');
    expect(plain(describeImpostazioni(true))).toBe('Anteprima non salvata: il verdetto e le tessere leggono i valori inseriti qui.');
    expect(plain(describeScenarioParams())).toBe('Tre ipotesi di mercato: il verdetto usa il base, il grafico del Traguardo le disegna tutte e tre.');
  });

  it('read the RITA preview under the controls', () => {
    expect(plain(describeRitaPreview({ ritaUnlockAge: 62, unlockCalendarYear: 2050, alreadyUnlockable: false }))).toBe('Sblocco stimato con la regola RITA: 2050, a 62 anni.');
    expect(plain(describeRitaPreview({ ritaUnlockAge: 57, unlockCalendarYear: null, alreadyUnlockable: false }))).toBe("Regola RITA a 57 anni: imposta la tua età in Coast FIRE per stimare l'anno di sblocco.");
    expect(plain(describeRitaPreview({ ritaUnlockAge: 62, unlockCalendarYear: null, alreadyUnlockable: true }))).toBe("Regola RITA a 62 anni: hai già quell'età, il fondo non risulta bloccato dalla regola.");
  });

  it('read the runway', () => {
    expect(plain(describeRunway({ years: 14.9, liquidYears: 9.4, delta: 1.2, targetYears: 25, monthLabel: 'luglio 2026', pointCount: 14 }))).toBe(
      'A luglio 2026 il patrimonio FIRE copre 14,9 anni di spese (rolling 12 mesi), 9,4 con i soli liquidi: +1,2 anni rispetto a 12 mesi fa, contro un obiettivo di 25 anni.',
    );
    expect(plain(describeRunway({ years: 14.9, liquidYears: 9.4, delta: -0.4, targetYears: 25, monthLabel: 'luglio 2026', pointCount: 14 }))).toContain('−0,4 anni rispetto a 12 mesi fa');
    expect(plain(describeRunway({ years: null, liquidYears: null, delta: null, targetYears: 25, monthLabel: null, pointCount: 0 }))).toBe('Servono almeno 12 snapshot mensili per la runway storica.');
    // Points exist but the trailing twelve months had no expenses: a different absence, said as such.
    expect(plain(describeRunway({ years: null, liquidYears: null, delta: null, targetYears: 25, monthLabel: 'luglio 2026', pointCount: 14 }))).toBe('Nessuna spesa negli ultimi 12 mesi: la runway non è misurabile.');
  });
});
