/**
 * Tests for lib/utils/goalsNarrative.ts — the words of FIRE › Obiettivi: the verdict that answers
 * «sono in rotta?» with its tone from the dated goals, and the reading line of every tile. Every
 * phrasing is pinned; a missing input drops its clause instead of printing a placeholder (The
 * Narrative Honesty Rule).
 *
 * Same mocking as the other `*Narrative.test.ts`: chartService's it-IT percentage formatter
 * drags the Firebase chain in, which is mocked away. Expectations flatten the no-break space
 * `Intl` puts before € (`plain()`), and are written the way the screen prints them.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: { quantity: number; currentPrice: number }) => asset.quantity * asset.currentPrice,
}));

import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type { GoalLine, GoalsOverview, MilestoneEntry, TrajectoryView, DerivedAllocationView, AssignmentsView } from '@/lib/utils/goalsSummary';
import {
  ALLOCAZIONE_DERIVATA_ASIDE,
  buildGoalsVerdict,
  buildTraiettoriaChips,
  describeAllocazioneDerivata,
  describeAssegnazioni,
  describeAssegnazioniAside,
  describeAssegnazioniFooter,
  describeGoalCaption,
  describeGoalStatus,
  describeMilestone,
  describeMilestoneNote,
  describeObiettivi,
  describeObiettiviFooter,
  describeTraiettoria,
  describeTraiettoriaFooter,
  describeVersamento,
  formatGoalDate,
  resolveTraiettoriaHero,
} from '@/lib/utils/goalsNarrative';

const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/ /g, ' ') : null);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function line(overrides: Partial<GoalLine>): GoalLine {
  return {
    id: 'g',
    name: 'Obiettivo',
    color: '#3B82F6',
    priority: 'media',
    verdict: 'onTrack',
    currentValue: 0,
    targetAmount: null,
    remaining: null,
    progressPct: null,
    deadline: null,
    monthsToDeadline: null,
    plannedMonthly: 0,
    requiredMonthly: null,
    projectedDate: null,
    monthsToTarget: null,
    ...overrides,
  };
}

const CASA = line({ id: 'casa', name: 'Casa', priority: 'alta', verdict: 'offTrack', currentValue: 78_000, targetAmount: 120_000, remaining: 42_000, progressPct: 65, deadline: { year: 2029, month: 6 }, monthsToDeadline: 34, plannedMonthly: 700, requiredMonthly: 970, projectedDate: { year: 2030, month: 9 }, monthsToTarget: 49 });
const AUTO = line({ id: 'auto', name: 'Auto', verdict: 'onTrack', currentValue: 11_500, targetAmount: 18_000, remaining: 6_500, progressPct: 63.9, deadline: { year: 2028, month: 3 }, monthsToDeadline: 19, plannedMonthly: 350, requiredMonthly: 316, projectedDate: { year: 2028, month: 1 }, monthsToTarget: 17 });
const STUDI = line({ id: 'studi', name: 'Studi figli', priority: 'bassa', verdict: 'onTrack', currentValue: 6_900, targetAmount: 40_000, remaining: 33_100, progressPct: 17.25, deadline: { year: 2034, month: 9 }, monthsToDeadline: 97, plannedMonthly: 250, requiredMonthly: 245, projectedDate: { year: 2034, month: 8 }, monthsToTarget: 96 });
const EMERGENZA = line({ id: 'emergenza', name: 'Fondo emergenza', priority: 'alta', verdict: 'reached', currentValue: 15_000, targetAmount: 15_000, remaining: 0, progressPct: 100, monthsToTarget: 0 });
const PENSIONE = line({ id: 'pensione', name: 'Pensione', verdict: 'noDeadline', currentValue: 38_000, targetAmount: 250_000, remaining: 212_000, progressPct: 15.2, plannedMonthly: 400, projectedDate: { year: 2041, month: 3 }, monthsToTarget: 175 });
const FIGLI = line({ id: 'figli', name: 'Figli', verdict: 'noTarget', currentValue: 4_000, plannedMonthly: 100 });

function overview(goals: GoalLine[], extra: Partial<GoalsOverview> = {}): GoalsOverview {
  const count = (verdict: GoalLine['verdict']) => goals.filter((g) => g.verdict === verdict).length;
  const dated = goals.filter((g) => g.verdict === 'onTrack' || g.verdict === 'offTrack');
  return {
    goals,
    counts: {
      total: goals.length,
      inProgress: goals.length - count('reached'),
      reached: count('reached'),
      onTrack: count('onTrack'),
      offTrack: count('offTrack'),
      noDeadline: count('noDeadline'),
      noTarget: count('noTarget'),
      dated: dated.length,
    },
    allocatedTotal: goals.reduce((s, g) => s + g.currentValue, 0),
    allocatedShare: 48.86,
    requiredMonthlyTotal: dated.reduce((s, g) => s + (g.requiredMonthly ?? 0), 0),
    plannedMonthlyTotal: dated.reduce((s, g) => s + g.plannedMonthly, 0),
    ...extra,
  };
}

const FOUR = overview([CASA, AUTO, STUDI, EMERGENZA]);

// ─── Dates ────────────────────────────────────────────────────────────────────

describe('formatGoalDate', () => {
  it('prints the month in words, lowercase, with the year', () => {
    expect(formatGoalDate({ year: 2029, month: 6 })).toBe('giugno 2029');
    expect(formatGoalDate({ year: 2028, month: 1 }, 'short')).toBe('gen 2028');
    expect(formatGoalDate({ year: 2034, month: 9 }, 'short')).toBe('set 2034');
  });
});

// ─── Verdict ──────────────────────────────────────────────────────────────────

describe('buildGoalsVerdict', () => {
  it('says the feature is off, in the neutral tone, when it is', () => {
    const verdict = buildGoalsVerdict({ enabled: false, overview: null });
    expect(verdict.headline).toBe('Gli obiettivi non sono attivi.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Attiva il Goal-Based Investing nelle Impostazioni per assegnare quote del portafoglio a un obiettivo e sapere se sei in rotta.');
  });

  it('asks for the first goal when there is none', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([]) });
    expect(verdict.headline).toBe('Nessun obiettivo ancora.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Crea il primo obiettivo e assegnagli una quota del portafoglio per sapere se sei in rotta.');
  });

  it('one late goal out of three dated ones: the warning tone and a clause per goal', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: FOUR });
    expect(verdict.headline).toBe('Un obiettivo su tre è in ritardo.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      '3 obiettivi in corso e 1 raggiunto: Casa richiede 270 € al mese in più per arrivare a giugno 2029; Auto è in rotta per marzo 2028 e Studi figli per settembre 2034; Fondo emergenza è raggiunto.',
    );
  });

  it('every dated goal late: the negative tone', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([CASA, { ...AUTO, verdict: 'offTrack', requiredMonthly: 420 }]) });
    expect(verdict.headline).toBe('Ogni obiettivo datato è in ritardo.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toBe('2 obiettivi in corso: Casa richiede 270 € al mese in più per arrivare a giugno 2029 e Auto 70 € al mese in più per arrivare a marzo 2028.');
  });

  it('the only dated goal late: singular headline', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([CASA]) });
    expect(verdict.headline).toBe("L'obiettivo è in ritardo.");
    expect(verdict.tone).toBe('negative');
  });

  it('every dated goal on track: the positive tone', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([AUTO, STUDI]) });
    expect(verdict.headline).toBe('Sei in rotta su ogni obiettivo.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe('2 obiettivi in corso: Auto è in rotta per marzo 2028 e Studi figli per settembre 2034.');
  });

  it('one goal on track: «Sei in rotta.»', () => {
    expect(buildGoalsVerdict({ enabled: true, overview: overview([AUTO]) }).headline).toBe('Sei in rotta.');
  });

  it('two of four late: the count in words', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([CASA, { ...AUTO, verdict: 'offTrack', requiredMonthly: 420 }, STUDI, { ...STUDI, id: 'x', name: 'Viaggio', deadline: { year: 2027, month: 5 } }]) });
    expect(verdict.headline).toBe('Due obiettivi su quattro sono in ritardo.');
    expect(verdict.tone).toBe('warning');
  });

  it('every goal reached: the positive tone and no in-progress count', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([EMERGENZA, { ...AUTO, verdict: 'reached', deadline: null, requiredMonthly: null }]) });
    expect(verdict.headline).toBe('Hai raggiunto ogni obiettivo.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe('2 obiettivi raggiunti: Fondo emergenza e Auto sono raggiunti.');
  });

  it('no dated goal in progress: nothing to judge, said as such', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([PENSIONE, FIGLI, EMERGENZA]) });
    expect(verdict.headline).toBe('Nessun obiettivo in corso ha una scadenza.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('2 obiettivi in corso e 1 raggiunto: Pensione non ha una scadenza (al ritmo attuale arriva a marzo 2041); Figli è aperto, senza un importo; Fondo emergenza è raggiunto.');
  });

  it('a late goal with no contribution asks for the whole pace, not «in più»', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([{ ...CASA, plannedMonthly: 0 }]) });
    expect(plain(verdict.sentence)).toBe('1 obiettivo in corso: Casa richiede 970 € al mese per arrivare a giugno 2029.');
  });

  it('a late goal past its deadline says so instead of a pace over zero months', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([{ ...CASA, monthsToDeadline: 0, deadline: { year: 2025, month: 6 } }]) });
    expect(plain(verdict.sentence)).toBe('1 obiettivo in corso: Casa ha superato la scadenza di giugno 2025 senza raggiungere il target.');
  });

  it('an undated goal that is never reached drops the arrival clause', () => {
    const verdict = buildGoalsVerdict({ enabled: true, overview: overview([{ ...PENSIONE, projectedDate: null, monthsToTarget: null }]) });
    expect(plain(verdict.sentence)).toBe('1 obiettivo in corso: Pensione non ha una scadenza.');
  });
});

// ─── Obiettivi ────────────────────────────────────────────────────────────────

describe('describeObiettivi', () => {
  it('counts the goals, what is assigned and every verdict present', () => {
    expect(plain(describeObiettivi(FOUR))).toBe('4 obiettivi, 111.400 € assegnati (il 48,9% del patrimonio): 2 in rotta, 1 in ritardo, 1 raggiunto.');
  });

  it('drops the share without a portfolio and says when nothing is assigned yet', () => {
    const empty = overview([{ ...FIGLI, currentValue: 0 }], { allocatedShare: null });
    expect(plain(describeObiettivi(empty))).toBe('1 obiettivo, niente ancora assegnato: 1 aperto.');
  });

  it('names the undated and the open ones', () => {
    expect(plain(describeObiettivi(overview([PENSIONE, FIGLI], { allocatedShare: 20 })))).toBe('2 obiettivi, 42.000 € assegnati (il 20% del patrimonio): 1 senza scadenza, 1 aperto.');
  });
});

describe('describeGoalCaption', () => {
  it('a dated goal: assigned of target, the rest, the deadline and the priority', () => {
    expect(plain(describeGoalCaption(CASA))).toBe('78.000 € di 120.000 € · mancano 42.000 € · giugno 2029 · priorità alta');
  });

  it('a reached goal has nothing missing and says it has no deadline', () => {
    expect(plain(describeGoalCaption(EMERGENZA))).toBe('15.000 € di 15.000 € · senza scadenza · priorità alta');
  });

  it('an open goal shows what is assigned and the priority only', () => {
    expect(plain(describeGoalCaption(FIGLI))).toBe('4000 € assegnati · priorità media');
  });
});

describe('describeGoalStatus', () => {
  it('late: the required pace against the planned one', () => {
    expect(plain(describeGoalStatus(CASA))).toBe('richiede 970 € al mese, ne versi 700 €');
    expect(plain(describeGoalStatus({ ...CASA, plannedMonthly: 0 }))).toBe('richiede 970 € al mese, oggi non versi nulla');
  });

  it('on track: the arrival with the pace', () => {
    expect(plain(describeGoalStatus(AUTO))).toBe('arriva a gennaio 2028 con 350 € al mese');
    expect(plain(describeGoalStatus({ ...AUTO, plannedMonthly: 0 }))).toBe('arriva a gennaio 2028 senza versamenti');
  });

  it('reached: the chip says it all', () => {
    expect(describeGoalStatus(EMERGENZA)).toBeNull();
  });

  it('no deadline: the arrival at the current pace, or the fact that there is none', () => {
    expect(plain(describeGoalStatus(PENSIONE))).toBe('al ritmo attuale arriva a marzo 2041');
    expect(plain(describeGoalStatus({ ...PENSIONE, projectedDate: null }))).toBe('al ritmo attuale non ha una data');
  });

  it('open: no target to measure', () => {
    expect(plain(describeGoalStatus(FIGLI))).toBe('senza un importo obiettivo');
  });

  it('late and past the deadline', () => {
    expect(plain(describeGoalStatus({ ...CASA, monthsToDeadline: 0 }))).toBe('scadenza superata');
  });
});

describe('describeObiettiviFooter', () => {
  it('sums the required pace of the dated goals against what is planned', () => {
    expect(plain(describeObiettiviFooter(FOUR))).toBe('Per arrivare a ogni scadenza servono 1531 € al mese in tutto; oggi ne versi 1300 €.');
  });

  it('says when the plan already covers it, or when nothing is planned', () => {
    expect(plain(describeObiettiviFooter(overview([AUTO, STUDI])))).toBe('Per arrivare a ogni scadenza servono 561 € al mese in tutto; oggi ne versi 600 €.');
    expect(plain(describeObiettiviFooter(overview([{ ...CASA, plannedMonthly: 0 }])))).toBe('Per arrivare alla scadenza servono 970 € al mese; oggi non versi nulla.');
  });

  it('has nothing to say without a dated goal in progress', () => {
    expect(describeObiettiviFooter(overview([EMERGENZA, FIGLI]))).toBeNull();
  });
});

// ─── Traiettoria ──────────────────────────────────────────────────────────────

function trajectory(overrides: Partial<TrajectoryView>): TrajectoryView {
  return {
    goalId: 'casa',
    name: 'Casa',
    color: '#3B82F6',
    notes: null,
    verdict: 'offTrack',
    currentValue: 78_000,
    targetAmount: 120_000,
    plannedMonthly: 700,
    requiredMonthly: 970,
    extraMonthly: 270,
    annualReturn: 3.25,
    deadline: { year: 2029, month: 6 },
    monthsToDeadline: 34,
    projectedAtDeadline: 110_400,
    gapAtDeadline: 9_600,
    projectedDate: { year: 2030, month: 9 },
    monthsToTarget: 49,
    allocation: [
      { assetClass: 'bonds', label: 'Obbligazioni', pct: 70 },
      { assetClass: 'equity', label: 'Azioni', pct: 20 },
      { assetClass: 'cash', label: 'Liquidità', pct: 10 },
    ],
    series: [],
    ...overrides,
  };
}

describe('describeTraiettoria', () => {
  it('late: the value at the deadline, the shortfall and the pace it would take', () => {
    expect(plain(describeTraiettoria(trajectory({})))).toBe('Con 700 € al mese e il 3,3% l\'anno, a giugno 2029 Casa arriva a 110.400 €, 9600 € sotto il target di 120.000 €: servono 970 € al mese.');
  });

  it('on track: the surplus at the deadline and the month it is reached', () => {
    const auto = trajectory({ name: 'Auto', verdict: 'onTrack', currentValue: 11_500, targetAmount: 18_000, plannedMonthly: 350, requiredMonthly: 316, extraMonthly: 0, annualReturn: 2.2, deadline: { year: 2028, month: 3 }, monthsToDeadline: 19, projectedAtDeadline: 18_670, gapAtDeadline: -670, projectedDate: { year: 2028, month: 1 }, monthsToTarget: 17 });
    expect(plain(describeTraiettoria(auto))).toBe('Con 350 € al mese e il 2,2% l\'anno, a marzo 2028 Auto arriva a 18.670 €, 670 € oltre il target di 18.000 €; lo raggiungi a gennaio 2028.');
  });

  it('without contributions the sentence says so', () => {
    expect(plain(describeTraiettoria(trajectory({ plannedMonthly: 0, requiredMonthly: 970, extraMonthly: 970, projectedAtDeadline: 87_000, gapAtDeadline: 33_000 })))).toBe('Senza versamenti, al 3,3% l\'anno, a giugno 2029 Casa arriva a 87.000 €, 33.000 € sotto il target di 120.000 €: servono 970 € al mese.');
  });

  it('no deadline: the arrival at the current pace, and its absence', () => {
    const pensione = trajectory({ name: 'Pensione', verdict: 'noDeadline', currentValue: 38_000, targetAmount: 250_000, plannedMonthly: 400, requiredMonthly: null, extraMonthly: null, annualReturn: 5.2, deadline: null, monthsToDeadline: null, projectedAtDeadline: null, gapAtDeadline: null, projectedDate: { year: 2041, month: 3 }, monthsToTarget: 175 });
    expect(plain(describeTraiettoria(pensione))).toBe('Con 400 € al mese e il 5,2% l\'anno Pensione raggiunge i 250.000 € a marzo 2041; non ha una scadenza.');
    expect(plain(describeTraiettoria({ ...pensione, plannedMonthly: 0, projectedDate: null, monthsToTarget: null, annualReturn: 0 }))).toBe('Senza versamenti e senza rendimento Pensione non raggiunge i 250.000 €: nessuna data.');
  });

  it('reached and open goals', () => {
    expect(plain(describeTraiettoria(trajectory({ name: 'Fondo emergenza', verdict: 'reached', currentValue: 15_000, targetAmount: 15_000, deadline: null, monthsToDeadline: null, projectedAtDeadline: null, gapAtDeadline: null, projectedDate: null, monthsToTarget: 0 })))).toBe('Fondo emergenza ha raggiunto i 15.000 € del target.');
    expect(plain(describeTraiettoria(trajectory({ name: 'Figli', verdict: 'noTarget', targetAmount: null, deadline: null, projectedAtDeadline: null, gapAtDeadline: null, projectedDate: null, requiredMonthly: null, extraMonthly: null })))).toBe('Figli non ha un importo obiettivo: senza un target non c\'è una traiettoria da misurare.');
  });

  it('a late goal past its deadline', () => {
    expect(plain(describeTraiettoria(trajectory({ monthsToDeadline: 0, deadline: { year: 2025, month: 6 }, projectedAtDeadline: 78_000, gapAtDeadline: 42_000 })))).toBe('La scadenza di giugno 2025 è passata con Casa a 78.000 €, 42.000 € sotto il target di 120.000 €; al ritmo attuale arriva a settembre 2030.');
  });
});

describe('resolveTraiettoriaHero and buildTraiettoriaChips', () => {
  const hero = (t: TrajectoryView) => {
    const resolved = resolveTraiettoriaHero(t);
    return resolved && { ...resolved, value: resolved.value.replace(/[  ]/g, ' ') };
  };

  it('the hero is the value at the deadline for a dated goal', () => {
    expect(hero(trajectory({}))).toEqual({ label: 'Valore previsto a giugno 2029', value: '110.400 €' });
  });

  it('the hero is the arrival date without a deadline, and the assigned value when reached', () => {
    expect(hero(trajectory({ verdict: 'noDeadline', deadline: null, projectedAtDeadline: null, projectedDate: { year: 2041, month: 3 } }))).toEqual({ label: 'Arrivo al ritmo attuale', value: 'marzo 2041' });
    expect(hero(trajectory({ verdict: 'reached', currentValue: 15_000, deadline: null, projectedAtDeadline: null }))).toEqual({ label: 'Valore assegnato', value: '15.000 €' });
    expect(hero(trajectory({ verdict: 'noTarget', targetAmount: null }))).toBeNull();
  });

  it('the chips: the pace paid, the pace required, the months and the return', () => {
    const chips = buildTraiettoriaChips(trajectory({})).map((c) => [c.value, c.words ?? '', c.caption].join('|').replace(/ /g, ' '));
    expect(chips).toEqual(['700 €|/mese|versi oggi', '970 €|/mese|richiesti per la scadenza', '34|mesi|a giugno 2029', '3,3%||rendimento atteso']);
  });

  it('a goal without a deadline has no required pace and no months chip', () => {
    const chips = buildTraiettoriaChips(trajectory({ verdict: 'noDeadline', deadline: null, monthsToDeadline: null, requiredMonthly: null })).map((c) => c.caption);
    expect(chips).toEqual(['versi oggi', 'rendimento atteso']);
  });
});

describe('describeTraiettoriaFooter', () => {
  it('names the allocation the return comes from and the two dashed lines', () => {
    expect(plain(describeTraiettoriaFooter(trajectory({})))).toBe('Rendimento nominale dall\'allocazione consigliata (70% obbligazioni, 20% azioni, 10% liquidità): una stima, non un consiglio. Tratteggiata orizzontale: il target; verticale: la scadenza.');
  });

  it('without a recommended allocation the default return is named, and without a deadline the vertical line is not', () => {
    expect(plain(describeTraiettoriaFooter(trajectory({ allocation: [], annualReturn: 4, deadline: null })))).toBe('Rendimento nominale del 4% l\'anno, il valore predefinito senza un\'allocazione consigliata: una stima, non un consiglio. Tratteggiata orizzontale: il target.');
  });
});

// ─── Milestone ────────────────────────────────────────────────────────────────

const MILESTONES: MilestoneEntry[] = [
  { goalId: 'emergenza', name: 'Fondo emergenza', color: '#EF4444', kind: 'reached', date: null, deadline: null, monthsPastDeadline: null },
  { goalId: 'auto', name: 'Auto', color: '#F97316', kind: 'dated', date: { year: 2028, month: 1 }, deadline: { year: 2028, month: 3 }, monthsPastDeadline: null },
  { goalId: 'casa', name: 'Casa', color: '#3B82F6', kind: 'dated', date: { year: 2030, month: 9 }, deadline: { year: 2029, month: 6 }, monthsPastDeadline: 15 },
  { goalId: 'studi', name: 'Studi figli', color: '#8B5CF6', kind: 'dated', date: { year: 2034, month: 8 }, deadline: { year: 2034, month: 9 }, monthsPastDeadline: null },
];

describe('describeMilestone', () => {
  it('names the next goal and the late one', () => {
    expect(plain(describeMilestone(MILESTONES))).toBe('Il prossimo traguardo è Auto a gennaio 2028; Casa arriva a settembre 2030, 15 mesi oltre la scadenza.');
  });

  it('no late goal: the next and the last', () => {
    expect(plain(describeMilestone(MILESTONES.filter((m) => m.goalId !== 'casa')))).toBe('Il prossimo traguardo è Auto a gennaio 2028; l\'ultimo Studi figli ad agosto 2034.');
  });

  it('every goal reached, or nothing datable', () => {
    expect(plain(describeMilestone([MILESTONES[0]]))).toBe('Ogni obiettivo con un importo è già raggiunto.');
    expect(plain(describeMilestone([{ ...MILESTONES[1], kind: 'never', date: null }]))).toBe('Nessun obiettivo ha una data al ritmo attuale.');
    expect(plain(describeMilestone([]))).toBe('Nessun obiettivo con un importo da raggiungere.');
  });

  it('the notes under a row: the lateness, or the absence of a date', () => {
    expect(describeMilestoneNote(MILESTONES[2])).toBe('15 mesi dopo la scadenza di giugno 2029');
    expect(describeMilestoneNote({ ...MILESTONES[2], monthsPastDeadline: 1 })).toBe('1 mese dopo la scadenza di giugno 2029');
    expect(describeMilestoneNote({ ...MILESTONES[1], kind: 'never', date: null })).toBe('mai, al ritmo attuale');
    expect(describeMilestoneNote(MILESTONES[1])).toBeNull();
  });
});

// ─── Allocazione derivata ─────────────────────────────────────────────────────

describe('describeAllocazioneDerivata', () => {
  const view: DerivedAllocationView = {
    assignedTotal: 111_400,
    rows: [
      { assetClass: 'equity', label: 'Azioni', derivedPct: 26.2, assignedPct: 6.2 },
      { assetClass: 'bonds', label: 'Obbligazioni', derivedPct: 65, assignedPct: 64.6 },
      { assetClass: 'cash', label: 'Liquidità', derivedPct: 8.8, assignedPct: 29.2 },
    ],
  };

  it('reads the derived target largest first, then the assigned shares in the same order', () => {
    expect(plain(describeAllocazioneDerivata(view))).toBe('Gli obiettivi da colmare chiedono il 65% in obbligazioni, il 26,2% in azioni e l\'8,8% in liquidità; le quote assegnate sono al 64,6%, 6,2% e 29,2%.');
    expect(ALLOCAZIONE_DERIVATA_ASIDE).toBe('gap × priorità');
  });

  it('a class the goals do not ask for but the quotas hold is named as such', () => {
    const withCrypto: DerivedAllocationView = { ...view, rows: [...view.rows, { assetClass: 'crypto', label: 'Criptovalute', derivedPct: 0, assignedPct: 10 }] };
    expect(plain(describeAllocazioneDerivata(withCrypto))).toBe('Gli obiettivi da colmare chiedono il 65% in obbligazioni, il 26,2% in azioni e l\'8,8% in liquidità; le quote assegnate sono al 64,6%, 6,2% e 29,2%, più il 10% in criptovalute che nessun obiettivo chiede.');
  });
});

// ─── Assegnazioni ─────────────────────────────────────────────────────────────

const ASSEGNAZIONI: AssignmentsView = {
  groups: [],
  quotaCount: 7,
  instrumentCount: 6,
  assignedTotal: 111_400,
  free: [],
  freeTotal: 116_600,
  freeShare: 51.1,
  freeInstrumentCount: 5,
  totalInstrumentCount: 8,
  overAssigned: [],
};

describe('describeAssegnazioni', () => {
  it('counts the quotas and the instruments, then what is still free', () => {
    expect(plain(describeAssegnazioni(ASSEGNAZIONI))).toBe('111.400 € assegnati con 7 quote su 6 strumenti; 116.600 € (il 51,1% del patrimonio) restano liberi su 5 strumenti.');
    expect(describeAssegnazioniAside(ASSEGNAZIONI)).toBe('8 strumenti · 7 quote');
  });

  it('everything assigned, or nothing yet', () => {
    expect(plain(describeAssegnazioni({ ...ASSEGNAZIONI, freeTotal: 0, freeShare: 0, freeInstrumentCount: 0 }))).toBe('111.400 € assegnati con 7 quote su 6 strumenti; tutto il patrimonio è assegnato.');
    expect(plain(describeAssegnazioni({ ...ASSEGNAZIONI, quotaCount: 0, instrumentCount: 0, assignedTotal: 0, freeTotal: 228_000, freeShare: 100, freeInstrumentCount: 8 }))).toBe('Nessuna quota assegnata: 228.000 € liberi su 8 strumenti.');
    expect(describeAssegnazioniAside({ ...ASSEGNAZIONI, quotaCount: 1 })).toBe('8 strumenti · 1 quota');
  });

  it('the footer explains a quota, or warns about an instrument past 100%', () => {
    expect(describeAssegnazioniFooter(ASSEGNAZIONI).tone).toBe('neutral');
    expect(plain(describeAssegnazioniFooter(ASSEGNAZIONI).narrative)).toBe('Una quota è la percentuale del valore di uno strumento; lo stesso strumento può servire più obiettivi fino al 100%.');
    const over = describeAssegnazioniFooter({ ...ASSEGNAZIONI, overAssigned: [{ assetId: 'cc', name: 'Conto corrente', percentage: 130 }] });
    expect(over.tone).toBe('warning');
    expect(plain(over.narrative)).toBe('Conto corrente è assegnato al 130%: riduci una quota, il limite è il 100%.');
  });
});

// ─── Dettaglio ────────────────────────────────────────────────────────────────

describe('describeVersamento', () => {
  it('splits the amount across the goals in words', () => {
    const slices = [
      { goalId: 'casa', goalName: 'Casa', color: '#3B82F6', add: 732, gap: 42_000, priority: 'alta' as const },
      { goalId: 'studi', goalName: 'Studi figli', color: '#8B5CF6', add: 192, gap: 33_100, priority: 'bassa' as const },
      { goalId: 'auto', goalName: 'Auto', color: '#F97316', add: 76, gap: 6_500, priority: 'media' as const },
    ];
    expect(plain(describeVersamento(slices, 1_000))).toBe('Con 1000 € in più, 732 € vanno a Casa, 192 € a Studi figli e 76 € ad Auto.');
  });

  it('asks for an amount, or says that nothing is left to fill', () => {
    expect(plain(describeVersamento([], 0))).toBe('Inserisci un importo per vedere come ripartirlo tra gli obiettivi sotto target.');
    expect(plain(describeVersamento([], 500))).toBe('Nessun obiettivo con un importo ancora da colmare: i 500 € non hanno una destinazione.');
  });
});
