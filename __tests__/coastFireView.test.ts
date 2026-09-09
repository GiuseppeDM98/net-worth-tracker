import { describe, it, expect, vi } from 'vitest';

// The view layer formats through chartService, which top-level-imports the client Firebase SDK.
// Mocked away exactly like __tests__/fireService.test.ts does for the same reason.
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import {
  buildBaseScenarioInterpretation,
  buildCoastBasisParts,
  buildCoastCoverageSteps,
  buildCoastInflowEvents,
  buildCoastVerdict,
  buildPensionDraftIssues,
  buildPensionSnapshotKey,
  describeCoastDettaglio,
  describeCoastInflows,
  describeCoastScenarios,
  describeCoastTarget,
  describeCoastTargetCaption,
  describeCoastTargetFooter,
  describeCoverage,
  describeIpotesi,
  describePensionImpact,
  describePensioniStatali,
  describeTargetAndSteadyState,
  getPensionConfigurationState,
  parsePensionDrafts,
  resolveCoastBridgeYears,
  resolveCoastIncompleteReason,
  summarizeCoastPensions,
  summarizeCoastScenarios,
  summarizeCoastTarget,
  toPensionDrafts,
  type CoastFirePensionDraft,
  type CoastTarget,
} from '@/lib/utils/coastFireView';
import { INACTIVE_LOCK, type FireLock } from '@/lib/utils/fireSummary';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import {
  calculateCoastFIREProjection,
  getDefaultCoastFireTaxBrackets,
  getDefaultScenarios,
} from '@/lib/services/fireService';
import { formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

/**
 * The fixture the Playwright suite runs on, with a FIXED reference date so every figure is
 * reproducible: age 35 → Coast target 60, two state pensions after the target, and a pension
 * fund unlocking at 22 years (the bridge model).
 */
const REFERENCE_DATE = new Date('2026-08-18T12:00:00Z');
const PENSIONS = [
  {
    id: 'inps',
    label: 'Pensione INPS',
    grossMonthlyAmount: 2200,
    monthsPerYear: 13,
    startDate: '2058-01-01',
  },
  {
    id: 'estera',
    label: 'Pensione estera',
    grossMonthlyAmount: 600,
    monthsPerYear: 12,
    startDate: '2052-06-01',
  },
];
const PENSION_FUND_INFLOWS = [{ yearsFromNow: 22, amountToday: 29_800 }];
const NET_WORTH = 51_955;

function buildProjection(currentNetWorth = NET_WORTH) {
  return calculateCoastFIREProjection(
    currentNetWorth,
    30_000,
    4,
    35,
    60,
    getDefaultScenarios(),
    PENSIONS,
    getDefaultCoastFireTaxBrackets(),
    REFERENCE_DATE,
    PENSION_FUND_INFLOWS
  );
}

/** The screen prints a no-break space before €; the expectations are written with a plain one. */
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');
const euro = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true).replace(/ /g, ' ');

const LOCK: FireLock = {
  active: true,
  lockedValue: 29_800,
  unlockCalendarYear: 2048,
  unlockAge: 57,
  source: 'rita',
  lockedFundCount: 1,
  unmodellableCount: 0,
};

function buildTarget(currentNetWorth = NET_WORTH): { target: CoastTarget; base: ReturnType<typeof buildProjection>['scenarios']['base'] } {
  const projection = buildProjection(currentNetWorth);
  const base = projection.scenarios.base;
  return {
    base,
    target: summarizeCoastTarget(base, { currentNetWorth, liquidNetWorth: 30_000, currentAge: 35, retirementAge: 60, isBridge: true }),
  };
}

describe('coastFireView — the numbers', () => {
  it('should read the target off the base scenario and add only the liquid ratio and the surplus', () => {
    const { target, base } = buildTarget();

    expect(target.coastNumberToday).toBe(base.coastFireNumberToday);
    expect(target.gap).toBe(base.gapToCoastFI);
    expect(target.progressPct).toBe(base.progressToCoastFI);
    expect(target.futureValueAtRetirement).toBe(base.futureValueAtRetirementWithoutNewContributions);
    expect(target.retirementCapitalRequired).toBe(base.retirementCapitalRequired);
    expect(target.liquidProgressPct).toBeCloseTo((30_000 / base.coastFireNumberToday) * 100, 6);
    expect(target.surplus).toBe(0);
    expect(target.reached).toBe(false);
    expect(target.yearsToRetirement).toBe(25);
  });

  it('should carry the surplus once the Coast number is behind', () => {
    const { target, base } = buildTarget(base0().coastFireNumberToday + 10_000);
    expect(target.reached).toBe(true);
    expect(target.surplus).toBeCloseTo(10_000, 6);
    expect(target.gap).toBe(base.gapToCoastFI);
  });

  it('should list the scenarios as rows in Orso · Base · Toro order with their own Coast numbers', () => {
    const projection = buildProjection();
    const rows = summarizeCoastScenarios(projection.scenarios, NET_WORTH);

    expect(rows.map((row) => row.key)).toEqual(['bear', 'base', 'bull']);
    expect(rows[0].coastNumberToday).toBe(projection.scenarios.bear.coastFireNumberToday);
    expect(rows[0].coastNumberToday).toBeGreaterThan(rows[1].coastNumberToday);
    expect(rows[2].coastNumberToday).toBeLessThan(rows[1].coastNumberToday);
    expect(rows[1].progressPct).toBe(projection.scenarios.base.progressToCoastFI);
  });

  it('should order the pensions by start and read their coverage off the scenario', () => {
    const base = buildProjection().scenarios.base;
    const pensions = summarizeCoastPensions(base, 2026);

    expect(pensions.count).toBe(2);
    expect(pensions.entries.map((entry) => entry.label)).toEqual(['Pensione estera', 'Pensione INPS']);
    expect(pensions.entries.map((entry) => entry.startYear)).toEqual([2052, 2058]);
    expect(pensions.annualNetReal).toBe(base.totalNetAnnualPensionAtSteadyState);
    expect(pensions.monthlyNetReal).toBeCloseTo(base.totalNetAnnualPensionAtSteadyState / 12, 6);
    expect(pensions.annualNetRealAtRetirement).toBe(0);
  });

  it('should count the bridge as whole years from the target to the last pension', () => {
    const base = buildProjection().scenarios.base;
    expect(resolveCoastBridgeYears(base, 60)).toBe(7);
    expect(resolveCoastBridgeYears({ ...base, latestPensionStartAge: 60 }, 60)).toBe(0);
  });
});

function base0() {
  return buildProjection().scenarios.base;
}

describe('coastFireView — the verdict', () => {
  it('should answer «non ancora» with the gap, the walk and the pensions, all from the scenario', () => {
    const { target, base } = buildTarget();
    const verdict = buildCoastVerdict({ target, incompleteReason: null, pensions: summarizeCoastPensions(base, 2026), lock: LOCK });

    expect(verdict.headline).toBe('Non ancora: continua a versare.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      `Ti mancano ${euro(base.gapToCoastFI)} al numero Coast FIRE di oggi (${euro(base.coastFireNumberToday)}): smettendo di versare a 35 anni arriveresti a 60 anni con ${euro(base.futureValueAtRetirementWithoutNewContributions)} di oggi, contro i ${euro(base.retirementCapitalRequired)} richiesti; dal 2052 la Pensione estera e dal 2058 la Pensione INPS coprono insieme ${euro(base.totalNetAnnualPensionAtSteadyState / 12)} al mese. I ${euro(29_800)} nel fondo pensione sono esclusi da queste cifre perché restano bloccati fino al 2048; il calcolo li conta da quell'anno in poi.`
    );
    // A projection is neither a gain nor a loss: no segment wears a sign colour.
    expect(verdict.sentence.every((segment) => segment.sign === undefined)).toBe(true);
  });

  it('should answer «sì» with the surplus and «oltre i richiesti» once the target is behind', () => {
    const { target, base } = buildTarget(base0().coastFireNumberToday + 10_000);
    const verdict = buildCoastVerdict({ target, incompleteReason: null, pensions: summarizeCoastPensions(base, 2026), lock: INACTIVE_LOCK });

    expect(verdict.headline).toBe('Sì, puoi smettere di versare.');
    expect(verdict.tone).toBe('positive');
    const text = plain(verdict.sentence);
    expect(text).toContain(`supera il numero Coast FIRE di oggi (${euro(base.coastFireNumberToday)}) di ${euro(10_000)}`);
    expect(text).toContain(`oltre i ${euro(base.retirementCapitalRequired)} richiesti`);
    // No lock → no lock sentence.
    expect(text).not.toContain('fondo pensione');
  });

  it('should drop the pension clause without a pension, and list every pension — a name reads «la pensione di»', () => {
    const { target, base } = buildTarget();
    const none = buildCoastVerdict({ target, incompleteReason: null, pensions: summarizeCoastPensions({ ...base, pensionBreakdown: [], totalNetAnnualPensionAtSteadyState: 0 }, 2026), lock: INACTIVE_LOCK });
    expect(plain(none.sentence)).toBe(
      `Ti mancano ${euro(base.gapToCoastFI)} al numero Coast FIRE di oggi (${euro(base.coastFireNumberToday)}): smettendo di versare a 35 anni arriveresti a 60 anni con ${euro(base.futureValueAtRetirementWithoutNewContributions)} di oggi, contro i ${euro(base.retirementCapitalRequired)} richiesti.`
    );

    const three = summarizeCoastPensions(
      { ...base, pensionBreakdown: [...base.pensionBreakdown, { ...base.pensionBreakdown[0], id: 'terza', label: 'Marco', startAge: 70, startDate: '2061-01-01' }] },
      2026
    );
    const many = buildCoastVerdict({ target, incompleteReason: null, pensions: three, lock: INACTIVE_LOCK });
    expect(plain(many.sentence)).toContain('; dal 2052 la Pensione estera, dal 2058 la Pensione INPS e dal 2061 la pensione di Marco coprono insieme ');
  });

  it('should name only the missing input when the projection cannot run', () => {
    const verdict = buildCoastVerdict({ target: null, incompleteReason: 'Serve un patrimonio FIRE positivo.', pensions: { count: 0, entries: [], annualNetReal: 0, monthlyNetReal: 0, annualNetRealAtRetirement: 0 }, lock: INACTIVE_LOCK });
    expect(verdict.headline).toBe('Coast FIRE non calcolabile.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Serve un patrimonio FIRE positivo.');
  });

  it('should say «sei già all\'età target» instead of a walk of zero years', () => {
    const { target, base } = buildTarget();
    const verdict = buildCoastVerdict({ target: { ...target, yearsToRetirement: 0, retirementAge: 35 }, incompleteReason: null, pensions: summarizeCoastPensions(base, 2026), lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).toContain("), e sei già all'età target di 35 anni; dal 2052");
  });
});

describe('coastFireView — the Traguardo tile', () => {
  it('should read the progress, the two amounts and the gap', () => {
    const { target, base } = buildTarget();
    expect(plain(describeCoastTarget(target))).toBe(
      `Sei al ${formatPercentage(base.progressToCoastFI, 1)} del numero Coast FIRE: ${euro(NET_WORTH)} su ${euro(base.coastFireNumberToday)}, ne mancano ${euro(base.gapToCoastFI)}.`
    );
  });

  it('should caption the chip with the liquid read and what the number discounts', () => {
    const { target, base } = buildTarget();
    expect(plain(describeCoastTargetCaption(target))).toBe(
      `${formatPercentage(target.liquidProgressPct, 1)} con i soli liquidi · ${euro(base.retirementCapitalRequired)} richiesti a 60 anni, scontati al 4,5% reale`
    );
    expect(plain(describeCoastTargetCaption({ ...target, liquidNetWorth: 0 }))).not.toContain('liquidi');
  });

  it('should name the step in the footer only when the unlock is on the plot', () => {
    const { base } = buildTarget();
    const onPlot = describeCoastTargetFooter({ retirementAge: 60, requiredNet: base.retirementCapitalRequired, lastTargetOnPlot: 400_000, lock: LOCK, lastProjectedYear: 2051 });
    expect(plain(onPlot)).toBe(
      `Linea tratteggiata: i ${euro(base.retirementCapitalRequired)} richiesti a 60 anni nello scenario base, in euro di oggi — ${euro(400_000)} con il fondo pensione dentro. Il gradino nel 2048 è il fondo che rientra, nelle serie e nella linea.`
    );
    const beyond = describeCoastTargetFooter({ retirementAge: 60, requiredNet: base.retirementCapitalRequired, lastTargetOnPlot: base.retirementCapitalRequired, lock: { ...LOCK, unlockCalendarYear: 2053 }, lastProjectedYear: 2051 });
    expect(plain(beyond)).toContain("Il fondo pensione rientra nel 2053, oltre l'età target: la linea è già al netto.");
    const unlocked = describeCoastTargetFooter({ retirementAge: 60, requiredNet: base.retirementCapitalRequired, lastTargetOnPlot: base.retirementCapitalRequired, lock: INACTIVE_LOCK, lastProjectedYear: 2051 });
    expect(plain(unlocked)).toMatch(/in euro di oggi\.$/);
  });
});

describe('coastFireView — the Afflussi tile', () => {
  it('should list state pensions and the fund unlock in calendar order, at today\'s value', () => {
    const base = base0();
    const events = buildCoastInflowEvents(base.pensionBreakdown, PENSION_FUND_INFLOWS, 2026, 35);
    const estera = base.pensionBreakdown.find((pension) => pension.id === 'estera')!;

    expect(events.map((event) => event.year)).toEqual([2048, 2052, 2058]);
    expect(events.map((event) => event.kind)).toEqual(['pensionFund', 'statePension', 'statePension']);
    expect(events[1].amount).toBe(cachedFormatCurrencyEUR(Math.round(estera.netAnnualRealAtStart), true));
    // The fund arrives at TODAY's value — the walk grows it, the timeline must not.
    expect(events[0].amountValue).toBe(29_800);
    expect(events[0].note).toBe('A 57 anni · rientra nel capitale e da lì compone');
  });

  it('should read the events as one sentence, funds first, then the pensions together', () => {
    const base = base0();
    const events = buildCoastInflowEvents(base.pensionBreakdown, PENSION_FUND_INFLOWS, 2026);
    const pensions = summarizeCoastPensions(base, 2026);
    expect(plain(describeCoastInflows(events, pensions, 60))).toBe(
      `3 afflussi già scontati: il fondo pensione rientra nel 2048 (${euro(29_800)}), poi dal 2052 la Pensione estera e dal 2058 la Pensione INPS coprono insieme ${euro(base.totalNetAnnualPensionAtSteadyState)} netti l'anno.`
    );
  });

  it('should say what no inflow means, never «nessun dato»', () => {
    expect(buildCoastInflowEvents([], [], 2026)).toEqual([]);
    expect(plain(describeCoastInflows([], { count: 0, entries: [], annualNetReal: 0, monthlyNetReal: 0, annualNetRealAtRetirement: 0 }, 60))).toBe(
      'Nessun afflusso dopo il target: il portafoglio deve sostenere per intero le spese anche dopo i 60 anni.'
    );
  });
});

describe('coastFireView — the Scenari tile', () => {
  it('should compare each scenario with the base number, verb by comparison', () => {
    const projection = buildProjection();
    const rows = summarizeCoastScenarios(projection.scenarios, NET_WORTH);
    const { bear, base, bull } = projection.scenarios;
    expect(plain(describeCoastScenarios(rows))).toBe(
      // On this fixture the Toro number is already behind the net worth: the suffix says so.
      `Nel base ti mancano ${euro(base.gapToCoastFI)}; l'orso alza il numero Coast a ${euro(bear.coastFireNumberToday)}, il toro lo abbassa a ${euro(bull.coastFireNumberToday)} e lo hai già superato.`
    );
  });

  it('should say when a scenario is already past while the base is not, and the reverse', () => {
    const projection = buildProjection();
    const netWorth = projection.scenarios.bull.coastFireNumberToday + 1;
    const rows = summarizeCoastScenarios(buildProjection(netWorth).scenarios, netWorth);
    expect(plain(describeCoastScenarios(rows))).toMatch(/il toro lo abbassa a .* e lo hai già superato\.$/);

    const reachedBase = summarizeCoastScenarios(buildProjection(projection.scenarios.base.coastFireNumberToday + 1).scenarios, projection.scenarios.base.coastFireNumberToday + 1);
    const text = plain(describeCoastScenarios(reachedBase));
    expect(text).toMatch(/^Nel base hai superato il numero Coast \(/);
    expect(text).toContain("l'orso alza il numero Coast a");
    expect(text).toContain('e non ci sei ancora');
  });
});

describe('coastFireView — the Ipotesi disclosure', () => {
  it('should name every assumption, unlock year and pensions included', () => {
    const parts = buildCoastBasisParts({
      currentAge: 35,
      retirementAge: 60,
      annualExpenses: 30_000,
      usesCustomExpenses: true,
      withdrawalRate: 4,
      baseRealReturn: 4.5,
      respectPensionLockIn: true,
      pensionUnlockCalendarYear: 2048,
      pensionCount: 2,
    });

    expect(parts.map((part) => part.replace(/ /g, ' '))).toEqual([
      '35 anni → target 60',
      `spese ${euro(30_000)} (personalizzate)`,
      'SWR 4%',
      'rendimento reale base 4,5%',
      'fondo pensione bloccato fino al 2048',
      '2 pensioni statali',
    ]);
    expect(describeIpotesi({ currentAge: 35, retirementAge: 60, annualExpenses: 30_000, usesCustomExpenses: true, withdrawalRate: 4, baseRealReturn: 4.5, respectPensionLockIn: true, pensionUnlockCalendarYear: 2048, pensionCount: 2 })).toBe(parts.join(' · '));
  });

  it('should distinguish "toggle on but nothing locked" from "toggle off", and count zero or one pension', () => {
    const common = {
      currentAge: 35,
      retirementAge: 60,
      annualExpenses: 30_000,
      usesCustomExpenses: false,
      withdrawalRate: 4,
      baseRealReturn: null,
      pensionUnlockCalendarYear: null,
      pensionCount: 0,
    };

    expect(buildCoastBasisParts({ ...common, respectPensionLockIn: true })).toContain('vincolo fondo pensione attivo, nessun fondo bloccato');
    expect(buildCoastBasisParts({ ...common, respectPensionLockIn: false })).toContain('fondo pensione non vincolato');
    expect(buildCoastBasisParts({ ...common, respectPensionLockIn: false })).toContain('nessuna pensione statale');
    expect(buildCoastBasisParts({ ...common, respectPensionLockIn: false, pensionCount: 1 })).toContain('1 pensione statale');
  });

  it('should say the expenses are the detected ones when no custom figure is used', () => {
    const parts = buildCoastBasisParts({
      currentAge: null,
      retirementAge: null,
      annualExpenses: 24_000,
      usesCustomExpenses: false,
      withdrawalRate: 3.5,
      baseRealReturn: null,
      respectPensionLockIn: false,
      pensionUnlockCalendarYear: null,
      pensionCount: 0,
    });

    expect(parts[0]).toBe('età da impostare');
    expect(parts[1].replace(/ /g, ' ')).toBe(`spese ${euro(24_000)} (ultimo anno completo)`);
  });

  it('should read the pensions tile by count and name the incomplete rows', () => {
    expect(plain(describePensioniStatali(0, 0))).toMatch(/^Nessuna pensione: il portafoglio sostiene per intero/);
    expect(plain(describePensioniStatali(2, 0))).toBe('2 pensioni: ognuna riduce il fabbisogno del portafoglio solo dalla sua decorrenza, al netto IRPEF e deflazionata.');
    expect(plain(describePensioniStatali(2, 1))).toContain('; una riga è incompleta e non entra nel calcolo.');
  });
});

describe('coastFireView — the Dettaglio disclosure', () => {
  it('should describe the disclosure with the bridge and drop the impact without pensions', () => {
    expect(describeCoastDettaglio({ bridgeYears: 7, pensionCount: 2 })).toBe('Fasi di copertura (ponte di 7 anni) · Al target e a regime · Impatto delle pensioni · Come leggere il Coast FIRE');
    expect(describeCoastDettaglio({ bridgeYears: 0, pensionCount: 0 })).toBe('Fasi di copertura · Al target e a regime · Come leggere il Coast FIRE');
  });

  it('should read the coverage, the target/steady-state pair and the pension impact off the scenario', () => {
    const base = base0();
    const pensions = summarizeCoastPensions(base, 2026);
    expect(plain(describeCoverage(base, pensions, 60, 7))).toBe(
      `A 60 anni il portafoglio sostiene ${euro(base.annualPortfolioNeedAtRetirement)} l'anno; dal 2058 scende a ${euro(base.annualPortfolioNeedAtSteadyState)} a regime.`
    );
    expect(plain(describeTargetAndSteadyState(base, 60, 7, 4, true))).toBe(
      `Ponte di 7 anni: a 60 anni servono ${euro(base.retirementCapitalRequired)} (fondo pensione escluso); a regime il fabbisogno è ${euro(base.annualPortfolioNeedAtSteadyState)} l'anno, cioè ${euro(base.steadyStatePortfolioNeed)} al 4%.`
    );
    expect(plain(describePensionImpact(pensions))).toBe(`Dal lordo nominale al netto reale: le 2 pensioni valgono insieme ${euro(base.totalNetAnnualPensionAtSteadyState)} netti l'anno di oggi.`);
    expect(plain(describeCoverage({ ...base, pensionBreakdown: [] }, { count: 0, entries: [], annualNetReal: 0, monthlyNetReal: 0, annualNetRealAtRetirement: 0 }, 60, 0))).toContain(', anche a regime: nessuna pensione lo alleggerisce.');
  });
});

describe('coastFireView — coverage steps and interpretation', () => {
  it('should add the steady-state step only when a bridge exists', () => {
    const base = base0();
    const sorted = [...base.pensionBreakdown].sort((a, b) => a.startAge - b.startAge);

    const withBridge = buildCoastCoverageSteps(base, sorted, 60, 7);
    expect(withBridge.map((step) => step.id)).toEqual(['target', 'estera', 'inps', 'steady-state']);
    expect(withBridge[0].badge.replace(/ /g, ' ')).toBe(`${euro(base.retirementCapitalRequired)} richiesti`);

    const withoutBridge = buildCoastCoverageSteps(base, sorted, 60, 0);
    expect(withoutBridge.map((step) => step.id)).toEqual(['target', 'estera', 'inps']);
  });

  it('should explain the multi-pension case in terms of the phases, not of one number', () => {
    const base = base0();
    const lines = buildBaseScenarioInterpretation(base, 30_000, 7, 60);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('2 pensioni con decorrenze diverse');
    expect(lines[2]).toContain('ponte di 7 anni');
  });

  it('should state plainly that nothing reduces the need when no pension is configured', () => {
    const base = base0();
    const lines = buildBaseScenarioInterpretation({ ...base, pensionBreakdown: [] }, 30_000, 0, 60);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Nessuna pensione configurata');
  });
});

describe('coastFireView — the incomplete reason', () => {
  it('should name the first missing input in the order the calculation needs them', () => {
    expect(resolveCoastIncompleteReason(0, 30_000, 35, 60)).toContain('patrimonio FIRE positivo');
    expect(resolveCoastIncompleteReason(50_000, undefined, 35, 60)).toContain('spese annue');
    expect(resolveCoastIncompleteReason(50_000, 30_000, null, 60)).toContain('età attuale');
    expect(resolveCoastIncompleteReason(50_000, 30_000, 35, null)).toContain('età target');
    expect(resolveCoastIncompleteReason(50_000, 30_000, 35, 60)).toBeNull();
  });
});

describe('coastFireView — the configuration drafts', () => {
  it('should round-trip saved pensions through the form without marking them dirty', () => {
    const drafts = toPensionDrafts(PENSIONS, 35, REFERENCE_DATE);
    const parsed = parsePensionDrafts(drafts);

    expect(buildPensionSnapshotKey(parsed)).toBe(
      buildPensionSnapshotKey(parsePensionDrafts(toPensionDrafts(PENSIONS, 35, REFERENCE_DATE)))
    );
    expect(parsed.map((pension) => pension.label)).toEqual(['Pensione INPS', 'Pensione estera']);
  });

  it('should flag a started-but-incomplete row and leave an untouched row alone', () => {
    const drafts: CoastFirePensionDraft[] = [
      { id: 'a', label: '', grossMonthlyAmount: '', monthsPerYear: '', startDate: '' },
      { id: 'b', label: 'Estera', grossMonthlyAmount: '0', monthsPerYear: '12', startDate: '' },
    ];
    const issues = buildPensionDraftIssues(drafts, 35, 60, REFERENCE_DATE);

    expect(issues.every((issue) => issue.pensionId === 'b')).toBe(true);
    expect(issues.some((issue) => issue.message.includes('lordo mensile'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('data di decorrenza'))).toBe(true);
  });

  /**
   * `normalizeCoastFirePensions` DROPS an unusable row, so a lone broken draft leaves the parsed
   * list empty and the state reads 'empty', not 'incomplete'. 'incomplete' is the mixed case: at
   * least one pension is in the calculation while another is still being typed. Pinned because
   * the tab reopens the settings panel on 'incomplete' and would otherwise reopen on nothing.
   */
  it('should report "empty" for a lone broken row and "incomplete" only alongside a valid one', () => {
    const brokenOnly: CoastFirePensionDraft[] = [
      { id: 'b', label: 'Estera', grossMonthlyAmount: '0', monthsPerYear: '12', startDate: '' },
    ];
    expect(
      getPensionConfigurationState(
        parsePensionDrafts(brokenOnly),
        buildPensionDraftIssues(brokenOnly, 35, 60, REFERENCE_DATE)
      )
    ).toBe('empty');

    const mixed: CoastFirePensionDraft[] = [
      {
        id: 'inps',
        label: 'Pensione INPS',
        grossMonthlyAmount: '2200',
        monthsPerYear: '13',
        startDate: '2058-01-01',
      },
      ...brokenOnly,
    ];
    expect(
      getPensionConfigurationState(
        parsePensionDrafts(mixed),
        buildPensionDraftIssues(mixed, 35, 60, REFERENCE_DATE)
      )
    ).toBe('incomplete');
  });

  it('should treat a decorrenza after the target as information, not as an error', () => {
    const drafts: CoastFirePensionDraft[] = [
      {
        id: 'inps',
        label: 'Pensione INPS',
        grossMonthlyAmount: '2200',
        monthsPerYear: '13',
        startDate: '2058-01-01',
      },
    ];
    const issues = buildPensionDraftIssues(drafts, 35, 60, REFERENCE_DATE);

    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('informational');
    expect(issues[0].message).toContain('dopo il target');
    expect(getPensionConfigurationState(parsePensionDrafts(drafts), issues)).toBe('informational');
  });
});

/**
 * Parity guard: every euro figure the verdict, the readings and the events print must be one of
 * the projection's own numbers (or the fund's today value). A new figure appearing here means the
 * view layer started computing instead of reading.
 */
describe('coastFireView — parity with the projection', () => {
  it('should surface only figures fireService produced', () => {
    const projection = buildProjection();
    const base = projection.scenarios.base;
    const target = summarizeCoastTarget(base, { currentNetWorth: projection.currentNetWorth, liquidNetWorth: 30_000, currentAge: 35, retirementAge: 60, isBridge: true });
    const pensions = summarizeCoastPensions(base, 2026);
    const verdict = buildCoastVerdict({ target, incompleteReason: null, pensions, lock: LOCK });
    const events = buildCoastInflowEvents(base.pensionBreakdown, PENSION_FUND_INFLOWS, 2026);
    const rows = summarizeCoastScenarios(projection.scenarios, projection.currentNetWorth);

    const rendered = [
      plain(verdict.sentence),
      plain(describeCoastTarget(target)),
      plain(describeCoastInflows(events, pensions, 60)),
      plain(describeCoastScenarios(rows)),
      ...events.map((event) => event.amount.replace(/ /g, ' ')),
    ].join(' | ');
    const allowed = [
      base.gapToCoastFI,
      base.coastFireNumberToday,
      base.retirementCapitalRequired,
      base.futureValueAtRetirementWithoutNewContributions,
      base.totalNetAnnualPensionAtSteadyState,
      base.totalNetAnnualPensionAtSteadyState / 12,
      projection.scenarios.bear.coastFireNumberToday,
      projection.scenarios.bull.coastFireNumberToday,
      projection.currentNetWorth,
      29_800,
      ...base.pensionBreakdown.map((pension) => pension.netAnnualRealAtStart),
    ].map(euro);

    // Every euro amount printed must be one of the projection's own numbers.
    const printed = rendered.match(/\d[\d.]* €/g) ?? [];
    expect(printed.length).toBeGreaterThan(8);
    printed.forEach((printedAmount) => {
      expect(allowed).toContain(printedAmount);
    });
  });
});
