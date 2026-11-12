/**
 * Tests for the PAC (Accumulo) narrative (lib/utils/accumulationNarrative.ts, doc/pac-ate.md §10.5/§11).
 *
 * One reading per tile state (none/draft/active/done/read-failure), the Comma Rule on every
 * currency and percentage figure (Italian comma decimals, never `toFixed`'s dot), and
 * `describeWeightsTotal` above and below 100.
 *
 * Currency substrings are built through `cachedFormatCurrencyEUR` itself, never hand-typed: the
 * Italian `Intl` formatter pads the € with a NON-BREAKING space (not `' '`) and prints a 4-digit
 * amount ungrouped but a 5-digit one grouped (AGENTS.md → Italian Localization) — a literal
 * `'1.234,50 €'` silently never matches either quirk.
 */
import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import {
  describeAccumulationNone,
  describeBandReentry,
  describeDriftReading,
  describeAccumulationDraft,
  describeAccumulationActive,
  describeReserveWarning,
  describeAccumulationDone,
  describeAccumulationReadFailure,
  describeClassStripItem,
  describeAccumulationOutcomeFooter,
  describeMonthsBarCaption,
  describeWeightsTotal,
  describeRecalibration,
  describeRecalibrationTotals,
  describeMeasuredOn,
  describeAccumuloDialogEyebrow,
  describeAccumuloModalEyebrow,
  describeRecalibrateTitle,
  describeInsufficientLiquidityWarning,
  describeUnpricedWarning,
  describeAboveTargetWarning,
  monthLabelShort,
  monthLabelLong,
  trajectoryPointLabel,
  formatSignedPp,
  formatSignedCurrency,
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
    expect(formatSignedCurrency(19)).toBe(`+${eur(19)}`);
    expect(formatSignedCurrency(-19)).toBe(`−${eur(19)}`);
  });
});

describe('describeAccumulationNone', () => {
  it('names the idle cash when there is some', () => {
    const text = narrativeToText(describeAccumulationNone(38500));
    expect(text).toBe(
      `Nessun piano di accumulo. Nei conti di liquidità ci sono ${eur(38500)}: un piano li ripartisce in rate mensili verso i pesi che scegli, senza vendere ciò che tieni.`,
    );
  });

  it('never prints «0,00 €» when there is no idle cash', () => {
    const text = narrativeToText(describeAccumulationNone(0));
    expect(text).not.toContain(eur(0));
    expect(text).toContain('Non hai liquidità nei conti');
  });
});

describe('describeAccumulationDraft', () => {
  it('names the total, the calendar and the monthly instalment', () => {
    const text = narrativeToText(
      describeAccumulationDraft({ totalEur: 47050, months: 12, startMonth: '2026-10' }),
    );
    expect(text).toBe(
      `Bozza: ${eur(47050)} in 12 rate da ottobre 2026, ${eur(47050 / 12)} al mese. Non è ancora attivo: nessuna rata viene proposta finché non lo attivi.`,
    );
  });

  it('uses the singular «rata» for a one-month plan', () => {
    const text = narrativeToText(describeAccumulationDraft({ totalEur: 1000, months: 1, startMonth: '2026-01' }));
    expect(text).toContain('1 rata da');
    expect(text).not.toContain('1 rate');
  });
});

describe('describeAccumulationActive', () => {
  it('names the month, the total, the split of executed/todo and the furthest drift', () => {
    const text = narrativeToText(
      describeAccumulationActive({
        monthKey: '2026-12',
        installmentTotalEur: 3868.1,
        lineCount: 5,
        executedCount: 1,
        todoCount: 4,
        furthestDrift: { label: 'CL2', deltaPp: 0.3 },
      }),
    );
    expect(text).toBe(
      `Rata di dicembre: ${eur(3868.1)} in 5 acquisti, 1 già eseguito e 4 da eseguire. Sei in linea col calendario.`,
    );
  });

  it('drops the split clause when nothing is executed or pending, and states a real gap', () => {
    const text = narrativeToText(
      describeAccumulationActive({
        monthKey: '2026-01',
        installmentTotalEur: 500,
        lineCount: 1,
        executedCount: 0,
        todoCount: 0,
        furthestDrift: { label: 'Obbligazioni', deltaPp: -2.1 },
      }),
    );
    expect(text).toBe(`Rata di gennaio: ${eur(500)} in 1 acquisto. Sei a −2,1 pp dal previsto su Obbligazioni.`);
  });

  it('drops the drift clause entirely when it is unknown, never prints a false zero', () => {
    const text = narrativeToText(
      describeAccumulationActive({
        monthKey: '2026-06',
        installmentTotalEur: 0,
        lineCount: 0,
        executedCount: 0,
        todoCount: 0,
        furthestDrift: null,
      }),
    );
    expect(text).toBe(`Rata di giugno: ${eur(0)} in 0 acquisti.`);
  });
});

describe('describeReserveWarning', () => {
  it('returns null when nothing is below reserve and nothing is reduced', () => {
    expect(describeReserveWarning({ sourceCashEur: 20000, reserveEur: 10000, belowReserve: false })).toBeNull();
  });

  it('names the reduced instalment when the recalibration shrinks it', () => {
    const text = narrativeToText(
      describeReserveWarning({
        sourceCashEur: 18900,
        reserveEur: 10000,
        belowReserve: true,
        reducedInstallment: { monthKey: '2027-01', suggestedTotalEur: 2100 },
      })!,
    );
    expect(text).toBe(
      `Liquidità nei conti sorgente ${eur(18900)} contro ${eur(10000)} di riserva: la riserva non si tocca, quindi la rata di gennaio 2027 è ridotta a ${eur(2100)}.`,
    );
  });

  it('states the shortfall alone when no instalment figure is known yet', () => {
    const text = narrativeToText(
      describeReserveWarning({ sourceCashEur: 5000, reserveEur: 10000, belowReserve: true })!,
    );
    expect(text).toBe(`Liquidità nei conti sorgente ${eur(5000)} contro ${eur(10000)} di riserva: la riserva non si tocca.`);
  });
});

describe('describeAccumulationDone', () => {
  it('names the closed instalments, what was invested and the worst drift', () => {
    const text = narrativeToText(
      describeAccumulationDone({
        closedCount: 12,
        totalInstallments: 12,
        investedEur: 46836,
        totalEur: 47050,
        maxDrift: { label: 'CL2', deltaPp: 0.6 },
      }),
    );
    expect(text).toBe(
      `Piano concluso: 12 rate su 12, ${eur(46836)} investiti su ${eur(47050)}. Il peso più lontano dal target è CL2, a +0,6 pp.`,
    );
  });

  it('drops the drift clause when every position landed exactly on target', () => {
    const text = narrativeToText(
      describeAccumulationDone({ closedCount: 1, totalInstallments: 1, investedEur: 500, totalEur: 500, maxDrift: null }),
    );
    expect(text).toBe(`Piano concluso: 1 rata su 1, ${eur(500)} investiti su ${eur(500)}.`);
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
      describeAccumulationOutcomeFooter({ maxDrift: { label: 'CL2', deltaPp: 0.8 }, residualEur: 214 }),
    );
    expect(text).toBe(`A fine piano: scostamento massimo +0,8 pp su CL2 · liquidità residua ${eur(214)}`);
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

describe('describeWeightsTotal — above and below 100', () => {
  it('names how many points are missing, below 100', () => {
    expect(describeWeightsTotal(97)).toBe('Mancano 3,00 punti per arrivare al 100%');
  });

  it('names how many points are in excess, above 100', () => {
    expect(describeWeightsTotal(102)).toBe('Hai 2,00 punti in più');
  });

  it('is silent at exactly 100 (within the schema tolerance)', () => {
    expect(describeWeightsTotal(100)).toBe('');
    expect(describeWeightsTotal(100.005)).toBe('');
  });
});

describe('describeRecalibration', () => {
  it('names the position that shrank, where the freed quotas go, and the total delta', () => {
    const text = narrativeToText(
      describeRecalibration({
        lines: [
          { label: 'NTSG', plannedQuantity: 10, suggestedQuantity: 8 },
          { label: 'VWCE', plannedQuantity: 5, suggestedQuantity: 7 },
        ],
        plannedTotalEur: 3868.1,
        suggestedTotalEur: 3849.1,
      }),
    );
    expect(text).toBe(`NTSG è salito più del previsto: la rata sposta 2 quote verso VWCE. Il totale cambia di −${eur(19)}.`);
  });

  it('names a uniform shortfall when nothing gains, only shrinks', () => {
    const text = narrativeToText(
      describeRecalibration({
        lines: [
          { label: 'NTSG', plannedQuantity: 10, suggestedQuantity: 8 },
          { label: 'VWCE', plannedQuantity: 5, suggestedQuantity: 4 },
        ],
        plannedTotalEur: 1000,
        suggestedTotalEur: 700,
      }),
    );
    expect(text).toContain('Le entrate non sono arrivate come previsto');
    expect(text).toContain(eur(300));
  });

  it('states nothing moved when every line matches the saved calendar', () => {
    const text = narrativeToText(
      describeRecalibration({
        lines: [{ label: 'VWCE', plannedQuantity: 5, suggestedQuantity: 5 }],
        plannedTotalEur: 500,
        suggestedTotalEur: 500,
      }),
    );
    expect(text).toBe('La rata resta come pianificata.');
  });
});

describe('describeRecalibrationTotals', () => {
  it('formats the planned-to-suggested arrow', () => {
    expect(describeRecalibrationTotals(3868.1, 3849.1)).toBe(`${eur(3868.1)} → ${eur(3849.1)}`);
  });
});

describe('describeMeasuredOn', () => {
  it('formats a DD/MM/YYYY date', () => {
    expect(describeMeasuredOn(new Date(2027, 0, 10))).toBe('misurato il 10/01/2027');
  });
});

describe('modal and dialog eyebrows/titles', () => {
  it('names the step and total for the editor', () => {
    expect(describeAccumuloDialogEyebrow(2)).toBe('Piano di accumulo · Passo 2 di 3');
  });

  it('names the plan for a secondary modal', () => {
    expect(describeAccumuloModalEyebrow('Il mio piano')).toBe('Accumulo · Il mio piano');
  });

  it('names the month being recalibrated', () => {
    expect(describeRecalibrateTitle('2027-01')).toBe('Ricalibra rata di gennaio');
  });
});

describe('editor warnings — the Italian singular/plural agreement', () => {
  it('names a single unpriced position with singular agreement', () => {
    expect(describeUnpricedWarning(['NTSG'])).toBe(
      'NTSG non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.',
    );
  });

  it('names several unpriced positions with plural agreement and the Italian serial list', () => {
    expect(describeUnpricedWarning(['NTSG', 'VWCE', 'CL2'])).toBe(
      'NTSG, VWCE e CL2 non hanno un prezzo disponibile: non ricevono acquisti finché non li aggiorni.',
    );
  });

  it('names a position already above target', () => {
    expect(describeAboveTargetWarning(['CL2'])).toBe(
      'CL2 è già sopra il target: il piano non la vende, il peso resta più alto del previsto.',
    );
  });

  it('states the coverage share of an underfunded plan', () => {
    expect(describeInsufficientLiquidityWarning(62)).toContain('62%');
  });
});

describe('Comma Rule — every currency and percentage figure is Italian, never toFixed', () => {
  it('never prints a toFixed-style dot decimal right before a "%" or "pp" unit', () => {
    // The Italian THOUSANDS dot ("1.234,56 €") is always followed by three more digits, never
    // directly by a unit — so this targets only the `toFixed` shape a stray `.toFixed()` would
    // produce ("12.34%", "1.2 pp"), without false-positiving on legitimate grouping.
    const samples = [
      narrativeToText(describeAccumulationDraft({ totalEur: 1234567.5, months: 4, startMonth: '2026-03' })),
      narrativeToText(
        describeAccumulationActive({
          monthKey: '2026-04',
          installmentTotalEur: 1234.56,
          lineCount: 2,
          executedCount: 1,
          todoCount: 1,
          furthestDrift: { label: 'X', deltaPp: 1.23 },
        }),
      ),
      (() => {
        const item = describeClassStripItem({ label: 'Azioni', currentPct: 58.25, targetPct: 55.5, currentDriftPp: 1.23, finalDriftPp: -0.45, outOfBandNow: false });
        return `${item.current} ${item.target} ${item.secondary}`;
      })(),
      describeWeightsTotal(96.5),
      formatSignedPp(1.23),
    ];
    for (const text of samples) {
      expect(text).not.toMatch(/\d\.\d{1,2}(%| pp)/);
    }
  });

  it('formats a percentage figure with comma decimals via formatPercentageIt, never toFixed', () => {
    const item = describeClassStripItem({ label: 'X', currentPct: 58.25, targetPct: 55.5, currentDriftPp: 0, finalDriftPp: 0, outOfBandNow: false });
    expect(item.current).toBe(formatPercentageIt(58.25, 1));
    expect(item.target).toContain(formatPercentageIt(55.5, 1));
    expect(item.current).not.toContain('58.25%');
    expect(item.target).not.toContain('55.5%');
  });

  it('formats a currency figure through cachedFormatCurrencyEUR, never a hand-rolled dot decimal', () => {
    const text = narrativeToText(describeAccumulationDraft({ totalEur: 1234.5, months: 4, startMonth: '2026-03' }));
    expect(text).toContain(eur(1234.5));
    expect(text).not.toContain('1234.50');
  });
});

// ─── RV5: rientro in banda (PT5) ───────────────────────────────────────────
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
