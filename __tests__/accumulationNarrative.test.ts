/**
 * Tests for the PAC (Accumulo) narrative (lib/utils/accumulationNarrative.ts).
 *
 * One reading per tile state (none/draft/active/done/read-failure), the Comma Rule on every
 * currency and percentage figure (Italian comma decimals, never `toFixed`'s dot).
 *
 * Currency substrings are built through `cachedFormatCurrencyEUR` itself, never hand-typed: the
 * Italian `Intl` formatter pads the € with a NON-BREAKING space (not `' '`) and prints a 4-digit
 * amount ungrouped but a 5-digit one grouped (AGENTS.md → Italian Localization) — a literal
 * `'1.234,50 €'` silently never matches either quirk.
 */
import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { describeSaleStep } from '@/lib/utils/accumulationNarrative';
import {
  describeBandReentry,
  describeDriftReading,
  describeReserveWarning,
  describeAccumulationReadFailure,
  describeClassStripItem,
  describeAccumulationOutcomeFooter,
  describeMonthsBarCaption,
  describeMeasuredOn,
  describeAccumuloModalEyebrow,
  describeInsufficientLiquidityWarning,
  describeUnpricedWarning,
  monthLabelShort,
  monthLabelLong,
  trajectoryPointLabel,
  formatSignedPp,
  formatSignedCurrency,
  describePlanPastReview,
  suggestMonthlyInflow,
  describeSuggestedInflow,
} from '@/lib/utils/accumulationNarrative';

const eur = cachedFormatCurrencyEUR;

describe('month labels', () => {
  it('formats the short (chart/bar) and long (reading) registers', () => {
    expect(monthLabelShort('2026-10')).toBe('ott 2026');
    expect(monthLabelLong('2026-10')).toBe('ottobre 2026');
    expect(monthLabelLong('2026-10', false)).toBe('ottobre');
    expect(monthLabelShort('2027-01')).toBe('gen 2027');
  });

  it('names the baseline point «Oggi», everything else its short label', () => {
    expect(trajectoryPointLabel('baseline')).toBe('Oggi');
    expect(trajectoryPointLabel('2026-12')).toBe('dic 2026');
  });
});

describe('signed figures', () => {
  it('carries the typographic minus, never the ASCII hyphen', () => {
    expect(formatSignedPp(3.4)).toBe('+3,4 pp');
    expect(formatSignedPp(-1.3)).toBe('−1,3 pp');
    expect(formatSignedPp(-1.3)).not.toContain('-1,3');
    expect(formatSignedCurrency(50)).toBe(`+${eur(50)}`);
    expect(formatSignedCurrency(-50)).toBe(`−${eur(50)}`);
  });
});

describe('describeReserveWarning', () => {
  it('returns null when nothing is below reserve and nothing is reduced', () => {
    expect(describeReserveWarning({ sourceCashEur: 20000, reserveEur: 10000, belowReserve: false })).toBeNull();
  });

  it('names the reduced instalment when the recalibration shrinks it', () => {
    const text = narrativeToText(
      describeReserveWarning({
        sourceCashEur: 20000,
        reserveEur: 10000,
        belowReserve: true,
        reducedInstallment: { monthKey: '2027-01', suggestedTotalEur: 2000 },
      })!,
    );
    expect(text).toBe(
      `Liquidità nei conti sorgente ${eur(20000)} contro ${eur(10000)} di riserva: la riserva non si tocca, quindi la rata di gennaio 2027 è ridotta a ${eur(2000)}.`,
    );
  });

  it('states the shortfall alone when no instalment figure is known yet', () => {
    const text = narrativeToText(
      describeReserveWarning({ sourceCashEur: 5000, reserveEur: 10000, belowReserve: true })!,
    );
    expect(text).toBe(`Liquidità nei conti sorgente ${eur(5000)} contro ${eur(10000)} di riserva: la riserva non si tocca.`);
  });
});

describe('describeAccumulationReadFailure', () => {
  it('is a fixed sentence that never claims the rest of the page is affected', () => {
    const text = describeAccumulationReadFailure();
    expect(text).toContain('Non riesco a leggere il piano di accumulo');
    expect(text).toContain('non dipendono da questo');
  });
});

describe('describeClassStripItem', () => {
  it('leads with the absolute values (current vs target), the drift trails as a secondary line (owner’s call, 2026-09-20)', () => {
    const item = describeClassStripItem({
      label: 'Azioni',
      currentPct: 105.4,
      targetPct: 102,
      currentDriftPp: 3.4,
      finalDriftPp: 1.3,
      outOfBandNow: true,
      reentersAt: 'giu 2027',
    });
    expect(item.current).toBe(formatPercentageIt(105.4, 1));
    expect(item.target).toBe(`target ${formatPercentageIt(102, 1)}`);
    expect(item.secondary).toBe('+3,4 pp oggi → +1,3 pp a fine piano');
    expect(item.note).toBe('rientra in banda a giu 2027');
    expect(item.outOfBandNow).toBe(true);
    expect(item.label).toBe('Azioni');
  });

  it('carries no note when already in band', () => {
    const item = describeClassStripItem({
      label: 'Obbligazioni',
      currentPct: 29.6,
      targetPct: 30,
      currentDriftPp: -0.4,
      finalDriftPp: 0,
      outOfBandNow: false,
    });
    expect(item.note).toBeUndefined();
  });

  it('formats both absolute values to one decimal, never a whole percent', () => {
    const item = describeClassStripItem({
      label: 'X',
      currentPct: 58.25,
      targetPct: 55.5,
      currentDriftPp: 2.75,
      finalDriftPp: 0,
      outOfBandNow: false,
    });
    expect(item.current).toBe(formatPercentageIt(58.25, 1));
    expect(item.target).toBe(`target ${formatPercentageIt(55.5, 1)}`);
  });
});

describe('describeAccumulationOutcomeFooter', () => {
  it('names the worst drift and the residual', () => {
    const text = narrativeToText(
      describeAccumulationOutcomeFooter({ maxDrift: { label: 'ETF-C', deltaPp: 0.8 }, residualEur: 200 }),
    );
    expect(text).toBe(`A fine piano: scostamento massimo +0,8 pp su ETF-C · liquidità residua ${eur(200)}`);
  });

  it('states plainly when nothing is measurably off', () => {
    const text = narrativeToText(describeAccumulationOutcomeFooter({ maxDrift: null, residualEur: 0 }));
    expect(text).toContain('nessuno scostamento misurabile');
  });
});

describe('describeMonthsBarCaption', () => {
  it('names the start, the progress and the end month', () => {
    expect(
      describeMonthsBarCaption({ startMonth: '2026-10', endMonth: '2027-09', closedCount: 2, totalMonths: 12 }),
    ).toBe('ott 2026 · 2 di 12 rate chiuse · set 2027');
  });
});

describe('describeMeasuredOn', () => {
  it('formats a DD/MM/YYYY date', () => {
    expect(describeMeasuredOn(new Date(2027, 0, 10))).toBe('misurato il 10/01/2027');
  });
});

describe('modal and dialog eyebrows/titles', () => {

  it('names the plan for a secondary modal', () => {
    expect(describeAccumuloModalEyebrow('Il mio piano')).toBe('Accumulo · Il mio piano');
  });

});

describe('the summary warnings — the Italian singular/plural agreement', () => {
  it('names a single unpriced position with singular agreement', () => {
    expect(describeUnpricedWarning(['ETF-B'])).toBe(
      'ETF-B non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.',
    );
  });

  it('names several unpriced positions with plural agreement and the Italian serial list', () => {
    expect(describeUnpricedWarning(['ETF-B', 'ETF-A', 'ETF-C'])).toBe(
      'ETF-B, ETF-A e ETF-C non hanno un prezzo disponibile: non ricevono acquisti finché non li aggiorni.',
    );
  });

  it('states the coverage share of an underfunded plan', () => {
    expect(describeInsufficientLiquidityWarning(62)).toContain('62%');
  });
});

describe('Comma Rule — every currency and percentage figure is Italian, never toFixed', () => {

  it('formats a percentage figure with comma decimals via formatPercentageIt, never toFixed', () => {
    const item = describeClassStripItem({ label: 'X', currentPct: 58.25, targetPct: 55.5, currentDriftPp: 0, finalDriftPp: 0, outOfBandNow: false });
    expect(item.current).toBe(formatPercentageIt(58.25, 1));
    expect(item.target).toContain(formatPercentageIt(55.5, 1));
    expect(item.current).not.toContain('58.25%');
    expect(item.target).not.toContain('55.5%');
  });

});

// ─── Rientro in banda ───────────────────────────────────────────
describe('describeBandReentry', () => {
  const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07'];
  const bonds = [-5.0, -4.2, -3.5, -2.9, ...Array.from({ length: 9 }, (_, k) => -2.9 + ((k + 1) * 2.0) / 9)];
  const cash = [12.4, 10.1, 7.8, 5.6, 4.3, 3.0, 1.9, ...Array.from({ length: 6 }, (_, k) => 1.9 - ((k + 1) * 1.4) / 6)];
  const entry = (driftPp: number) => ({ currentPct: 0, targetPct: 20, driftPp, outOfBand: false });
  const trajectory = MONTHS.map((month, index) => ({
    index,
    month: month as `${number}-${number}`,
    source: 'projected' as const,
    byClass: {
      equity: entry(0),
      bonds: entry(bonds[index]),
      commodity: entry(0),
      carry: entry(0),
      cash: entry(cash[index]),
    },
  }));
  const band = { type: 'fixed', pp: 2 } as const;

  it('names each class re-entering and the month the whole plan is in band', () => {
    expect(describeBandReentry(trajectory, 3, band)).toBe(
      'Nella banda: Liquidità da gennaio, Obbligazioni da marzo. Da marzo tutto il piano è in banda, se i prezzi restano quelli di oggi.',
    );
  });

  it('counts months for a draft', () => {
    expect(describeBandReentry(trajectory, 3, band, { draft: true })).toBe(
      'Nella banda: Liquidità dal mese 6, Obbligazioni dal mese 8. Dal mese 8 tutto il piano è in banda, se i prezzi restano quelli di oggi.',
    );
  });

  it('says so when every class is already in band, and when one never comes back', () => {
    expect(describeBandReentry(trajectory, 12, band)).toBe('Tutte le classi sono già in banda.');
    expect(describeBandReentry(trajectory, 3, { type: 'fixed', pp: 0.5 })).toContain('resta fuori banda fino alla fine del piano.');
  });

  it('reads one point as «quando · classe ±pp»', () => {
    const reading = describeDriftReading(trajectory[3], band);
    expect(reading.when).toBe('ottobre 2026 · previsto');
    expect(reading.items.find((item) => item.label === 'Liquidità')).toEqual({ label: 'Liquidità', text: 'Liquidità +5,6 pp', outOfBand: true });
  });
});

describe('the review date (2026-11-12)', () => {
  // Seen red printing the start month in place of the review date.
  it('describePlanPastReview names the date', () => {
    expect(describePlanPastReview('2027-06-30')).toBe("Il piano finisce dopo la revisione dell'allocazione (30/06/2027): rivedilo quando rivedi i target.");
  });
});

describe('the suggested instalment: the median of the monthly savings (owner, 2026-11-12)', () => {
  const flatSpaces = (text: string) => text.replace(/[  ]/g, ' ');

  // Seen red with the annual savings / 12 back (1295 × 12 / 12 is not floored to the ten).
  it('floors the median to the ten; nothing without a positive median', () => {
    expect(suggestMonthlyInflow(1295)).toBe(1290);
    expect(suggestMonthlyInflow(null)).toBeNull();
    expect(suggestMonthlyInflow(undefined)).toBeNull();
    expect(suggestMonthlyInflow(-50)).toBeNull();
    expect(suggestMonthlyInflow(0)).toBeNull();
  });

  // Seen red printing «12» whatever the months read.
  it('names how many months the median spans', () => {
    expect(flatSpaces(describeSuggestedInflow(1200, 12))).toBe('Il tuo risparmio mensile mediano degli ultimi 12 mesi è di 1200 €.');
    expect(flatSpaces(describeSuggestedInflow(1200, 5))).toBe('Il tuo risparmio mensile mediano degli ultimi 5 mesi è di 1200 €.');
  });
});

// The month a later sale enters the instalments (2026-11-19). Mutation that turns it red: `compact` dropped.
describe('describeSaleStep', () => {
  it('names the month, the instalment without decimals and the sales joined', () => {
    expect(describeSaleStep({ month: '2027-07', instalmentEur: 1800, names: ['Fondo X', 'Fondo Y'] }).replace(/[  ]/g, ' ')).toBe(
      'Da luglio la rata sale a 1800 €: entra il ricavato di Fondo X, Fondo Y.'
    );
  });

  // A name ending in a period (owner, 2026-11-21: «Apple Inc..»). Mutation that turns it red: the period always added.
  it('adds no second period after a name that ends with one', () => {
    expect(describeSaleStep({ month: '2027-07', instalmentEur: 1800, names: ['Apple Inc.'] }).replace(/[  ]/g, ' ')).toBe(
      'Da luglio la rata sale a 1800 €: entra il ricavato di Apple Inc.'
    );
  });
});
