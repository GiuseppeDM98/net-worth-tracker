/**
 * Tests for lib/utils/patrimonioNarrative.ts — the pure layer behind Patrimonio's verdict and the
 * reading line of every tile on that page. Same mocking as overviewNarrative.test.ts: the module
 * only needs chartService's it-IT percentage formatter, whose Firebase chain is mocked away.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildPatrimonioVerdict,
  describeCashAccounts,
  describeInstrumentReturns,
  describeInstruments,
  describeLastPriceUpdate,
  describeMonthTrades,
  formatHoldingCounts,
  pluralArticleFor,
  type PatrimonioVerdictInput,
} from '@/lib/utils/patrimonioNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

// Intl 'it-IT' puts a no-break space before "€" (see AGENTS.md → Italian Localization); the
// expectations below are written the way the screen prints them, with the nbsp flattened.
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

const AUGUST: PatrimonioVerdictInput = {
  month: 8,
  totalValue: 412425.85,
  monthlyVariation: { value: 3214.2, percentage: 0.79 },
  isNewATH: false,
  instrumentCount: 16,
  accountCount: 3,
  marketEffect: 2000,
  topMover: { id: 'vwce', name: 'Vanguard FTSE All-World', delta: 2140 },
};

describe('buildPatrimonioVerdict — headline and tone', () => {
  it('should call a growing portfolio growing', () => {
    const verdict = buildPatrimonioVerdict(AUGUST);
    expect(verdict.headline).toBe('Il portafoglio cresce.');
    expect(verdict.tone).toBe('positive');
  });

  it('should name the record when the month is a new all-time high', () => {
    const verdict = buildPatrimonioVerdict({ ...AUGUST, isNewATH: true });
    expect(verdict.headline).toBe('Il portafoglio è al massimo storico.');
    expect(verdict.tone).toBe('positive');
  });

  it('should not call a falling month a record: the ATH headline needs a non-negative month', () => {
    // isNewATH is measured on the live total, the monthly variation on the month's snapshot: the two
    // can disagree intraday, and the headline must follow the sign the sentence prints.
    const verdict = buildPatrimonioVerdict({ ...AUGUST, isNewATH: true, monthlyVariation: { value: -2000, percentage: -0.5 }, marketEffect: -1500 });
    expect(verdict.headline).toBe('Il portafoglio è in calo: il mercato ha pesato.');
    expect(verdict.tone).toBe('negative');
  });

  it('should credit the flows, not the market, when the portfolio grew while the market lost', () => {
    const verdict = buildPatrimonioVerdict({ ...AUGUST, marketEffect: -900, topMover: { id: 'x', name: 'X', delta: -900 } });
    expect(verdict.headline).toBe('Il portafoglio cresce, nonostante il mercato.');
    expect(verdict.tone).toBe('positive');
  });

  it('should blame the market only when the market actually lost money', () => {
    const down = { ...AUGUST, monthlyVariation: { value: -2100, percentage: -0.5 } };
    expect(buildPatrimonioVerdict({ ...down, marketEffect: -1500 })).toMatchObject({
      headline: 'Il portafoglio è in calo: il mercato ha pesato.',
      tone: 'negative',
    });
    expect(buildPatrimonioVerdict({ ...down, marketEffect: 900 })).toMatchObject({
      headline: 'Il portafoglio è in calo, nonostante il mercato.',
      tone: 'warning',
    });
    expect(buildPatrimonioVerdict({ ...down, marketEffect: null, topMover: null })).toMatchObject({
      headline: 'Il portafoglio è in calo.',
      tone: 'negative',
    });
  });

  it('should stay neutral when there is no prior snapshot to compare against', () => {
    const verdict = buildPatrimonioVerdict({ ...AUGUST, monthlyVariation: null, marketEffect: null, topMover: null });
    expect(verdict.headline).toBe('Il tuo portafoglio ad agosto.');
    expect(verdict.tone).toBe('neutral');
  });
});

describe('buildPatrimonioVerdict — sentence', () => {
  it('should state value, monthly change, the counts and the instrument that drove the month', () => {
    expect(plain(buildPatrimonioVerdict(AUGUST).sentence)).toBe(
      'Il portafoglio vale 412.425,85 €: +3214,20 € (+0,79%) su luglio, 16 strumenti e 3 conti; ' +
        'Vanguard FTSE All-World ha fatto il grosso (+2140 €).',
    );
  });

  it('should say that the top instrument weighed when its price effect is negative', () => {
    const sentence = buildPatrimonioVerdict({
      ...AUGUST,
      monthlyVariation: { value: -2100, percentage: -0.5 },
      marketEffect: -1500,
      topMover: { id: 'btc', name: 'Bitcoin', delta: -1800 },
    }).sentence;
    expect(plain(sentence)).toBe(
      'Il portafoglio vale 412.425,85 €: −2100,00 € (−0,50%) su luglio, 16 strumenti e 3 conti; Bitcoin ha pesato (−1800 €).',
    );
  });

  it('should drop the monthly clause and the driver when there is nothing to compare against', () => {
    const sentence = buildPatrimonioVerdict({ ...AUGUST, monthlyVariation: null, marketEffect: null, topMover: null }).sentence;
    expect(plain(sentence)).toBe('Il portafoglio vale 412.425,85 €, 16 strumenti e 3 conti.');
  });

  it('should never name a driver when the market effect could not be measured', () => {
    // A top mover without an attributable market effect is a payload inconsistency: stay silent.
    const sentence = buildPatrimonioVerdict({ ...AUGUST, marketEffect: null }).sentence;
    expect(plain(sentence)).toBe('Il portafoglio vale 412.425,85 €: +3214,20 € (+0,79%) su luglio, 16 strumenti e 3 conti.');
  });

  it('should use the singular for one instrument or one account and omit a zero count', () => {
    const one = buildPatrimonioVerdict({ ...AUGUST, instrumentCount: 1, accountCount: 1, marketEffect: null, topMover: null });
    expect(plain(one.sentence)).toContain(', 1 strumento e 1 conto.');
    const noAccounts = buildPatrimonioVerdict({ ...AUGUST, accountCount: 0, marketEffect: null, topMover: null });
    expect(plain(noAccounts.sentence)).toContain(', 16 strumenti.');
    const onlyAccounts = buildPatrimonioVerdict({ ...AUGUST, instrumentCount: 0, accountCount: 2, marketEffect: null, topMover: null });
    expect(plain(onlyAccounts.sentence)).toContain(', 2 conti.');
    const empty = buildPatrimonioVerdict({ ...AUGUST, instrumentCount: 0, accountCount: 0, monthlyVariation: null, marketEffect: null, topMover: null });
    expect(plain(empty.sentence)).toBe('Il portafoglio vale 412.425,85 €.');
  });

  it('should roll the previous month back to December in January', () => {
    expect(plain(buildPatrimonioVerdict({ ...AUGUST, month: 1 }).sentence)).toContain('su dicembre');
  });

  it('should mark figures as mono with their sign and keep the counts mono without a sign', () => {
    const segments = buildPatrimonioVerdict(AUGUST).sentence;
    expect(segments.find((s) => s.text.startsWith('+3214,20'))).toMatchObject({ mono: true, sign: 'positive' });
    const count = segments.find((s) => s.text === '16');
    expect(count).toMatchObject({ mono: true });
    expect(count?.sign).toBeUndefined();
    // The instrument's name is prose, never a figure.
    expect(segments.find((s) => s.text.includes('Vanguard'))?.mono).toBeUndefined();
  });
});

describe('tile readings', () => {
  it('describeCashAccounts should read the share on the accounts and the largest balance', () => {
    expect(plain(describeCashAccounts(7.2, { name: 'Conto Fineco', balance: 18420.1 }, 3)!)).toBe(
      'Il 7,2% del patrimonio è sui conti; 18.420 € su Conto Fineco.',
    );
    expect(plain(describeCashAccounts(7.2, { name: 'Conto Fineco', balance: 18420.1 }, 1)!)).toBe(
      'Il 7,2% del patrimonio è su Conto Fineco.',
    );
    expect(plain(describeCashAccounts(8.4, { name: 'Revolut', balance: 1230.55 }, 2)!)).toBe(
      "L'8,4% del patrimonio è sui conti; 1231 € su Revolut.",
    );
    // The article follows the ROUNDED figure that is printed, and zero takes "lo".
    expect(plain(describeCashAccounts(7.96, { name: 'Revolut', balance: 100 }, 1)!)).toBe("L'8,0% del patrimonio è su Revolut.");
    expect(plain(describeCashAccounts(0.5, { name: 'Revolut', balance: 100 }, 1)!)).toBe('Lo 0,5% del patrimonio è su Revolut.');
    expect(plain(describeCashAccounts(10.97, { name: 'Revolut', balance: 100 }, 1)!)).toBe("L'11,0% del patrimonio è su Revolut.");
    expect(describeCashAccounts(0, null, 0)).toBeNull();
  });

  it('describeMonthTrades should read what was bought and sold, or the absence of trades', () => {
    expect(plain(describeMonthTrades(2500, 800, 8))).toBe('Hai comprato 2500 € e venduto 800 €.');
    expect(plain(describeMonthTrades(2500, 0, 8))).toBe('Hai comprato 2500 €, nessuna vendita.');
    expect(plain(describeMonthTrades(0, 800, 8))).toBe('Hai venduto 800 €, nessun acquisto.');
    expect(plain(describeMonthTrades(0, 0, 8))).toBe('Nessuna operazione ad agosto.');
    expect(plain(describeMonthTrades(0, 0, 5))).toBe('Nessuna operazione a maggio.');
  });

  it('describeInstrumentReturns should read the aggregate return and the best position', () => {
    expect(plain(describeInstrumentReturns(8.1, { name: 'Ferrari', returnPercent: 44.52 })!)).toBe(
      'Le posizioni rendono +8,1% sul costo; Ferrari rende di più (+44,5%).',
    );
    expect(plain(describeInstrumentReturns(-3.2, { name: 'Bitcoin', returnPercent: 1.2 })!)).toBe(
      'Le posizioni sono sotto il costo del 3,2%; Bitcoin rende di più (+1,2%).',
    );
    expect(plain(describeInstrumentReturns(-8.1, null)!)).toBe("Le posizioni sono sotto il costo dell'8,1%.");
    expect(plain(describeInstrumentReturns(-0.5, null)!)).toBe('Le posizioni sono sotto il costo dello 0,5%.');
    expect(plain(describeInstrumentReturns(8.1, null)!)).toBe('Le posizioni rendono +8,1% sul costo.');
    expect(describeInstrumentReturns(null, null)).toBeNull();
  });

  it('describeInstruments should count the instruments, the hand-valued ones and the top weights', () => {
    expect(plain(describeInstruments(16, 2, { count: 3, percent: 39.3 })!)).toBe(
      '16 strumenti, 2 valutati a mano; i 3 maggiori pesano il 39,3%.',
    );
    expect(plain(describeInstruments(16, 1, { count: 3, percent: 39.3 })!)).toBe(
      '16 strumenti, 1 valutato a mano; i 3 maggiori pesano il 39,3%.',
    );
    expect(plain(describeInstruments(5, 0, { count: 3, percent: 80 })!)).toBe("5 strumenti; i 3 maggiori pesano l'80,0%.");
    expect(plain(describeInstruments(5, 0, { count: 3, percent: 79.97 })!)).toBe("5 strumenti; i 3 maggiori pesano l'80,0%.");
    expect(plain(describeInstruments(8, 0, { count: 3, percent: 11 })!)).toBe("8 strumenti; i 3 maggiori pesano l'11,0%.");
    expect(plain(describeInstruments(20, 0, { count: 8, percent: 70 })!)).toBe('20 strumenti; gli 8 maggiori pesano il 70,0%.');
    expect(plain(describeInstruments(1, 1, null)!)).toBe('1 strumento, valutato a mano.');
    expect(plain(describeInstruments(2, 0, null)!)).toBe('2 strumenti.');
    expect(describeInstruments(0, 0, null)).toBeNull();
  });

  it('pluralArticleFor should elide before the vowel-initial numbers', () => {
    expect([3, 8, 11, 15, 18, 80, 100].map(pluralArticleFor)).toEqual(['i', 'gli', 'gli', 'i', 'i', 'gli', 'i']); // diciotto starts with a consonant
  });

  it('formatHoldingCounts should print the counts the verdict uses, as plain text', () => {
    expect(formatHoldingCounts(16, 3)).toBe('16 strumenti e 3 conti');
    expect(formatHoldingCounts(1, 0)).toBe('1 strumento');
    expect(formatHoldingCounts(0, 0)).toBe('');
  });

  it('describeLastPriceUpdate should say today, yesterday or the date, in Italian wall-clock time', () => {
    // UTC instants, expectations in the Rome wall clock (CEST = UTC+2), so the test is the same on
    // any machine and actually exercises the conversion.
    const now = new Date(Date.UTC(2026, 7, 22, 10, 0)); // 22/08/2026 12:00 in Rome
    expect(describeLastPriceUpdate(new Date(Date.UTC(2026, 7, 22, 7, 12)), now)).toBe('prezzi aggiornati oggi alle 09:12');
    expect(describeLastPriceUpdate(new Date(Date.UTC(2026, 7, 21, 16, 40)), now)).toBe('prezzi aggiornati ieri alle 18:40');
    // 23:30 UTC on the 21st is already 01:30 on the 22nd in Rome: "oggi".
    expect(describeLastPriceUpdate(new Date(Date.UTC(2026, 7, 21, 23, 30)), now)).toBe('prezzi aggiornati oggi alle 01:30');
    expect(describeLastPriceUpdate(new Date(Date.UTC(2026, 7, 14, 16, 40)), now)).toBe('prezzi aggiornati il 14/08 alle 18:40');
    // A quote older than the calendar year names its year, or a stale ticker reads as three weeks ago.
    expect(describeLastPriceUpdate(new Date(Date.UTC(2025, 8, 14, 16, 0)), now)).toBe('prezzi aggiornati il 14/09/2025 alle 18:00');
    expect(describeLastPriceUpdate(null, now)).toBeNull();
  });
});
