import { describe, it, expect, vi } from 'vitest';

// `chartService` top-level-imports the Firebase client for its other exports; the formatter
// under test is pure, so the chain is mocked away (the rule every `*Narrative.test.ts` follows).
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));

import {
  ANNO_FISCALE_FOOTER,
  buildFondoOggiChips,
  buildPensionVerdict,
  describeAnnoFiscale,
  describeAnnoFiscaleAside,
  describeFondoOggi,
  describeFondoOggiAside,
  describeFondoOggiFooter,
  describeRendimento,
  describeRendimentoAside,
  describeVersamenti,
  describeVersamentiAside,
  describeVersato,
  describeVersatoFooter,
  formatMonthKey,
} from '@/lib/utils/pensionNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type {
  FundTodaySummary,
  LedgerRow,
  LedgerSummary,
  PensionMemberBlock,
  PensionMemberTax,
  VersatoSummary,
} from '@/lib/utils/pensionSummary';
import type { PensionReturnResult } from '@/lib/utils/pensionReturn';

/** Flattens the no-break space `Intl` puts before € so expectations read like the screen. */
const plain = (narrative: Narrative | string) =>
  (typeof narrative === 'string' ? narrative : narrativeToText(narrative)).replace(/ /g, ' ');

const RETURN: PensionReturnResult = {
  windowStart: '2025-11',
  windowEnd: '2026-08',
  monthsCovered: 9,
  startValue: 27_900,
  endValue: 31_450,
  valueGrowth: 3_550,
  contributions: { tfr: 534.88, voluntary: 652.02, employer: 134.11, total: 1_321.01 },
  marketGain: 2_228.99,
  twr: 7.96,
  annualizedTwr: 10.75,
  personalReturn: 8.12,
  isCoverageSuspicious: false,
  isCoverageContradictory: false,
  hasNoMovement: false,
};

const TAX: PensionMemberTax = {
  taxYear: 2026,
  ral: 38_000,
  voluntary: 652.02,
  employer: 134.11,
  tfr: 534.88,
  deductible: 786.13,
  deducted: 786.13,
  ordinaryCeiling: 5_300,
  extraAvailable: 2_650,
  effectiveCeiling: 7_950,
  remaining: 7_163.87,
  taxSaving: 275.15,
  employerInYear: 134.11,
  showPlafond: true,
  plafondCreatedThisYear: 0,
  plafondResidual: 25_822.85,
  isAccrualYear: false,
  isUsageYear: true,
};

const MARIO: PensionMemberBlock = {
  key: 'm1',
  kind: 'member',
  name: 'Mario',
  fundIds: ['fund-1'],
  fundNames: ['Fondo Cometa'],
  value: 31_450,
  return: RETURN,
  returnState: 'measured',
  windowStart: '2025-11',
  hasConfiguredStart: false,
  tax: TAX,
};

const TODAY: FundTodaySummary = {
  value: 31_450,
  fundCount: 1,
  fundNames: ['Fondo Cometa'],
  contributionsAllTime: 2_321.01,
  firstContributionMonth: '2025-11',
  monthEffect: 300,
  monthEffectPct: 0.9788,
  monthPaidIn: 500,
  series: [
    { year: 2025, month: 11, value: 27_900 },
    { year: 2026, month: 8, value: 31_450 },
  ],
  lastUpdated: new Date(2026, 7, 12),
};

describe('formatMonthKey', () => {
  it('spells a month key in Italian, long and short', () => {
    expect(formatMonthKey('2025-11')).toBe('novembre 2025');
    expect(formatMonthKey('2026-08', 'short')).toBe('ago 2026');
  });
});

describe('buildPensionVerdict', () => {
  it('answers «il fondo sta lavorando?» with the three causes as three numbers', () => {
    const verdict = buildPensionVerdict({ blocks: [MARIO], taxYear: 2026, currentYear: 2026 });

    expect(verdict.headline).toBe('Il fondo sta lavorando.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Il fondo di Mario vale 31.450 €: da novembre 2025 il mercato ha reso +7,96% (TWR), nel 2026 il datore ha aggiunto 134 € e il fisco restituisce circa 275 €.'
    );
    // The TWR is the only signed figure; the euro figures carry no sign colour.
    const twr = verdict.sentence.find((s) => s.text === '+7,96%');
    expect(twr?.sign).toBe('positive');
    expect(verdict.sentence.filter((s) => s.sign).length).toBe(1);
  });

  it('says a past year in the past tense', () => {
    const verdict = buildPensionVerdict({ blocks: [{ ...MARIO, tax: { ...TAX, taxYear: 2025, employerInYear: 0, taxSaving: 230 } }], taxYear: 2025, currentYear: 2026 });
    expect(plain(verdict.sentence)).toBe(
      'Il fondo di Mario vale 31.450 €: da novembre 2025 il mercato ha reso +7,96% (TWR) e nel 2025 il fisco ha restituito circa 230 €.'
    );
  });

  it('drops the employer clause when nothing was paid by the employer, and the tax clause without a RAL', () => {
    const verdict = buildPensionVerdict({
      blocks: [{ ...MARIO, tax: { ...TAX, employerInYear: 0, ral: null, taxSaving: null } }],
      taxYear: 2026,
      currentYear: 2026,
    });
    expect(plain(verdict.sentence)).toBe('Il fondo di Mario vale 31.450 €: da novembre 2025 il mercato ha reso +7,96% (TWR).');
  });

  it('blames the market when the return is negative', () => {
    const verdict = buildPensionVerdict({
      blocks: [{ ...MARIO, return: { ...RETURN, twr: -2.4, marketGain: -700 } }],
      taxYear: 2026,
      currentYear: 2026,
    });
    expect(verdict.headline).toBe('Il fondo ha perso terreno.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toContain('il mercato ha reso −2,40% (TWR)');
    expect(verdict.sentence.find((s) => s.text === '−2,40%')?.sign).toBe('negative');
  });

  it('says the return is not measurable instead of a number, per state', () => {
    const suspicious = buildPensionVerdict({
      blocks: [{ ...MARIO, returnState: 'suspicious', return: { ...RETURN, isCoverageSuspicious: true, annualizedTwr: 60 } }],
      taxYear: 2026,
      currentYear: 2026,
    });
    expect(suspicious.headline).toBe('Il rendimento del fondo non è misurabile.');
    expect(suspicious.tone).toBe('neutral');
    expect(plain(suspicious.sentence)).toBe(
      'Il fondo di Mario vale 31.450 €: il rendimento non è misurabile perché mancano versamenti registrati, nel 2026 il datore ha aggiunto 134 € e il fisco restituisce circa 275 €.'
    );

    const idle = buildPensionVerdict({ blocks: [{ ...MARIO, returnState: 'idle', return: { ...RETURN, hasNoMovement: true, twr: 0 } }], taxYear: 2026, currentYear: 2026 });
    expect(plain(idle.sentence)).toContain('da novembre 2025 il valore non si è ancora mosso');

    const fresh = buildPensionVerdict({ blocks: [{ ...MARIO, returnState: 'no-contributions', return: null, windowStart: null }], taxYear: 2026, currentYear: 2026 });
    expect(plain(fresh.sentence)).toContain('il rendimento non è ancora misurabile: registra il primo versamento');

    const onePoint = buildPensionVerdict({ blocks: [{ ...MARIO, returnState: 'one-point', return: null, windowStart: '2026-08' }], taxYear: 2026, currentYear: 2026 });
    expect(plain(onePoint.sentence)).toContain('il rendimento non è ancora misurabile: serve un secondo mese di valori dopo agosto 2026');
  });

  it('gives every member a sentence and judges across them', () => {
    const anna: PensionMemberBlock = {
      ...MARIO,
      key: 'm2',
      name: 'Anna',
      fundIds: ['fund-2', 'fund-3'],
      fundNames: ['PIP Vita', 'Fondo Espero'],
      value: 12_000,
      return: { ...RETURN, twr: -1.2, marketGain: -150 },
      tax: { ...TAX, employerInYear: 0, taxSaving: 120 },
    };
    const verdict = buildPensionVerdict({ blocks: [MARIO, anna], taxYear: 2026, currentYear: 2026 });

    expect(verdict.headline).toBe('Un fondo su due ha perso terreno.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      'Il fondo di Mario vale 31.450 €: da novembre 2025 il mercato ha reso +7,96% (TWR), nel 2026 il datore ha aggiunto 134 € e il fisco restituisce circa 275 €. ' +
        'I fondi di Anna valgono 12.000 €: da novembre 2025 il mercato ha reso −1,20% (TWR) e nel 2026 il fisco restituisce circa 120 €.'
    );

    const bothDown = buildPensionVerdict({ blocks: [{ ...MARIO, return: { ...RETURN, twr: -0.5 } }, anna], taxYear: 2026, currentYear: 2026 });
    expect(bothDown.headline).toBe('I fondi hanno perso terreno.');
    const bothUp = buildPensionVerdict({ blocks: [MARIO, { ...anna, return: RETURN }], taxYear: 2026, currentYear: 2026 });
    expect(bothUp.headline).toBe('I fondi stanno lavorando.');
  });

  it('names an unassigned fund by its own name and gives it no tax clause', () => {
    const orphan: PensionMemberBlock = { ...MARIO, key: 'unassigned:fund-2', kind: 'unassigned', name: null, fundIds: ['fund-2'], fundNames: ['PIP Vita'], value: 5_000, tax: null };
    const verdict = buildPensionVerdict({ blocks: [orphan], taxYear: 2026, currentYear: 2026 });
    expect(plain(verdict.sentence)).toBe('Il fondo PIP Vita vale 5000 €: da novembre 2025 il mercato ha reso +7,96% (TWR).');
  });

  it('has an empty state', () => {
    const verdict = buildPensionVerdict({ blocks: [], taxYear: 2026, currentYear: 2026 });
    expect(verdict.headline).toBe('Nessun fondo pensione ancora tracciato.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toContain('Crea un asset di tipo «Fondo Pensione» da Patrimonio');
  });
});

describe('Il fondo oggi', () => {
  it('reads value, recorded contributions and this month’s market effect', () => {
    expect(plain(describeFondoOggi(TODAY))).toBe(
      'Il fondo vale 31.450 €, con 2321 € di versamenti registrati da novembre 2025; questo mese il mercato ha aggiunto 300 €.'
    );
    expect(describeFondoOggiAside(TODAY)).toBe('Fondo Cometa · oggi');
    expect(plain(describeFondoOggiFooter(TODAY))).toBe('1 fondo · valore aggiornato a mano dall’estratto conto · ultimo aggiornamento 12 ago 2026');
  });

  it('drops the clauses it cannot support', () => {
    expect(plain(describeFondoOggi({ ...TODAY, monthEffect: null, monthEffectPct: null }))).toBe(
      'Il fondo vale 31.450 €, con 2321 € di versamenti registrati da novembre 2025.'
    );
    expect(plain(describeFondoOggi({ ...TODAY, contributionsAllTime: 0, firstContributionMonth: null, monthEffect: null, monthEffectPct: null }))).toBe(
      'Il fondo vale 31.450 €; nessun versamento registrato.'
    );
    expect(plain(describeFondoOggi({ ...TODAY, monthEffect: -120, monthEffectPct: -0.4 }))).toContain('questo mese il mercato ha tolto 120 €');
    expect(plain(describeFondoOggi({ ...TODAY, monthEffect: 0.4, monthEffectPct: 0 }))).toContain('questo mese il mercato non ha mosso il valore');
  });

  it('agrees in number with two funds', () => {
    const two = { ...TODAY, fundCount: 2, fundNames: ['Fondo Cometa', 'PIP Vita'] };
    expect(plain(describeFondoOggi(two))).toMatch(/^I fondi valgono 31\.450 €/);
    expect(describeFondoOggiAside(two)).toBe('2 fondi · oggi');
    expect(plain(describeFondoOggiFooter(two))).toMatch(/^2 fondi · /);
  });

  it('builds the grouped chips: the month effect (signed, with its share) and the contributions ever recorded', () => {
    const chips = buildFondoOggiChips(TODAY);
    expect(chips).toHaveLength(2);
    expect(plain(chips[0].value)).toBe('+300,00 € (+0,98%)');
    expect(chips[0].sign).toBe('positive');
    expect(chips[0].caption).toBe('questo mese, effetto mercato');
    expect(plain(chips[1].value)).toBe('2321,01 €');
    expect(chips[1].caption).toBe('versati in tutto, da novembre 2025');

    expect(buildFondoOggiChips({ ...TODAY, monthEffect: null, monthEffectPct: null })).toHaveLength(1);
    expect(buildFondoOggiChips({ ...TODAY, contributionsAllTime: 0, firstContributionMonth: null })).toHaveLength(1);
  });
});

describe('Rendimento', () => {
  it('reads the measured return with the annualised figure, the market gain and the personal return', () => {
    expect(plain(describeRendimento([MARIO]))).toBe(
      'Da novembre 2025 il mercato ha reso +7,96% (+10,75% annualizzato), 2229 € di guadagno; con i 134 € del datore, il capitale di Mario ha reso +8,12%.'
    );
    expect(describeRendimentoAside([MARIO])).toBe('nov 2025 → ago 2026');
  });

  it('drops the employer clause without an employer share, and the annualisation under three months', () => {
    const noEmployer = { ...MARIO, return: { ...RETURN, contributions: { ...RETURN.contributions, employer: 0 }, personalReturn: 7.9 } };
    expect(plain(describeRendimento([noEmployer]))).toBe('Da novembre 2025 il mercato ha reso +7,96% (+10,75% annualizzato), 2229 € di guadagno.');

    const short = { ...MARIO, return: { ...RETURN, annualizedTwr: null, monthsCovered: 2 } };
    expect(plain(describeRendimento([short]))).toContain('ha reso +7,96% (su 2 mesi, troppo pochi per annualizzare), 2229 € di guadagno');
  });

  it('explains instead of printing a number in the degraded states', () => {
    const suspicious = { ...MARIO, returnState: 'suspicious' as const, return: { ...RETURN, isCoverageSuspicious: true, valueGrowth: 3_000, contributions: { ...RETURN.contributions, total: 100 } } };
    expect(plain(describeRendimento([suspicious]))).toBe(
      'Il fondo è cresciuto di 3000 € ma risultano registrati solo 100 € di versamenti: la differenza verrebbe letta come rendimento di mercato, e non lo è. Registra i versamenti mancanti, oppure indica da quale mese il calcolo è affidabile nelle Impostazioni.'
    );
    expect(plain(describeRendimento([{ ...suspicious, hasConfiguredStart: true }]))).toMatch(/Registra i versamenti mancanti\.$/);

    const idle = { ...MARIO, returnState: 'idle' as const, return: { ...RETURN, hasNoMovement: true } };
    expect(plain(describeRendimento([idle]))).toBe(
      'Da novembre 2025 il valore del fondo non si è ancora mosso e non risultano versamenti registrati dopo quel mese: non c’è ancora niente da misurare. La prima misura arriva quando aggiorni «Valore attuale» col prossimo estratto conto.'
    );

    const fresh = { ...MARIO, returnState: 'no-contributions' as const, return: null, windowStart: null };
    expect(plain(describeRendimento([fresh]))).toBe(
      'Registra il primo versamento per iniziare a misurare il rendimento: prima di quello la crescita del fondo e i versamenti sono indistinguibili.'
    );
    expect(describeRendimentoAside([fresh])).toBe('non ancora misurabile');

    const onePoint = { ...MARIO, returnState: 'one-point' as const, return: null, windowStart: '2026-08' };
    expect(plain(describeRendimento([onePoint]))).toBe(
      'Serve un secondo mese dopo agosto 2026 per calcolare un rendimento: con un solo valore non c’è nulla da confrontare.'
    );
  });

  it('names each member when there are two', () => {
    const anna = { ...MARIO, key: 'm2', name: 'Anna', return: { ...RETURN, twr: -1.2, marketGain: -150, annualizedTwr: -1.6, personalReturn: -0.5, contributions: { ...RETURN.contributions, employer: 0 } } };
    expect(plain(describeRendimento([MARIO, anna]))).toBe(
      'Mario: da novembre 2025 il mercato ha reso +7,96% (+10,75% annualizzato), 2229 € di guadagno; con i 134 € del datore, il capitale ha reso +8,12%. ' +
        'Anna: da novembre 2025 il mercato ha reso −1,20% (−1,60% annualizzato), 150 € di perdita.'
    );
    expect(describeRendimentoAside([MARIO, anna])).toBe('una finestra per contribuente');
  });
});

describe('Anno fiscale', () => {
  it('reads what was deducted against the ceiling, the saving, the headroom and the excluded TFR', () => {
    expect(plain(describeAnnoFiscale([MARIO], 2026))).toBe(
      'Nel 2026 Mario ha dedotto 786 € su un tetto di 7950 €: circa 275 € di IRPEF in meno; restano 7164 € deducibili, e il TFR (535 €) non conta.'
    );
    expect(plain(describeAnnoFiscaleAside([MARIO]))).toBe('Mario · RAL 38.000 €');
    expect(plain(ANNO_FISCALE_FOOTER)).toMatch(/^Stima informativa, non consulenza fiscale/);
  });

  it('says what it cannot estimate, and drops the TFR aside when there is none', () => {
    const noRal = { ...MARIO, tax: { ...TAX, ral: null, taxSaving: null, tfr: 0 } };
    expect(plain(describeAnnoFiscale([noRal], 2026))).toBe(
      'Nel 2026 Mario ha dedotto 786 € su un tetto di 7950 €; senza la RAL il risparmio IRPEF non si stima. Restano 7164 € deducibili.'
    );
    expect(describeAnnoFiscaleAside([noRal])).toBe('Mario · senza RAL');

    const nothing = { ...MARIO, tax: { ...TAX, voluntary: 0, employer: 0, employerInYear: 0, tfr: 0, deductible: 0, deducted: 0, taxSaving: 0, remaining: 7_950 } };
    expect(plain(describeAnnoFiscale([nothing], 2026))).toBe('Nel 2026 Mario non ha ancora versato contributi deducibili: il tetto di 7950 € è tutto disponibile.');
  });

  it('names the part over the ceiling that is not deducted', () => {
    const over = { ...MARIO, tax: { ...TAX, voluntary: 8_000, deductible: 8_134.11, deducted: 7_950, remaining: 0, taxSaving: 2_782.5 } };
    expect(plain(describeAnnoFiscale([over], 2026))).toBe(
      'Nel 2026 Mario ha versato 8134 € deducibili, di cui 7950 € entro il tetto: circa 2783 € di IRPEF in meno; 184 € oltre il tetto non si deducono, e il TFR (535 €) non conta.'
    );
  });

  it('prompts to link an unassigned fund instead of computing on someone else’s RAL', () => {
    const orphan: PensionMemberBlock = { ...MARIO, key: 'u', kind: 'unassigned', name: null, fundNames: ['PIP Vita'], tax: null };
    expect(plain(describeAnnoFiscale([orphan], 2026))).toBe(
      'PIP Vita non è collegato a nessun contribuente: collega il fondo a un membro della famiglia dalla sua scheda in Patrimonio per stimare il beneficio fiscale.'
    );
    expect(describeAnnoFiscaleAside([orphan])).toBe('fondo non assegnato');
    expect(plain(describeAnnoFiscale([MARIO, orphan], 2026))).toMatch(/^Nel 2026 Mario ha dedotto .* PIP Vita non è collegato/);
  });
});

describe('Versato', () => {
  const VERSATO: VersatoSummary = {
    year: 2026,
    total: 1_321.01,
    rows: [
      { nature: 'voluntary', label: 'Volontario', amount: 652.02, percentage: 49.4, deductible: true },
      { nature: 'tfr', label: 'TFR', amount: 534.88, percentage: 40.5, deductible: false },
      { nature: 'employer', label: 'Datoriale', amount: 134.11, percentage: 10.2, deductible: true },
    ],
    previousYear: 2025,
    previousYearTotal: 1_000,
    previousYearSingleNature: 'voluntary',
  };

  it('reads the year total by nature, largest first', () => {
    expect(plain(describeVersato(VERSATO))).toBe('Nel 2026 il fondo ha ricevuto 1321 €: 652 € volontari, 535 € di TFR e 134 € dal datore.');
    expect(plain(describeVersatoFooter(VERSATO))).toBe('Nel 2025 aveva ricevuto 1000 €, tutti volontari. Versamenti per anno d’imposta, non per data.');
  });

  it('handles one nature, no previous year and an empty year', () => {
    const one = { ...VERSATO, rows: [VERSATO.rows[1]], total: 534.88, previousYear: null, previousYearTotal: null, previousYearSingleNature: null };
    expect(plain(describeVersato(one))).toBe('Nel 2026 il fondo ha ricevuto 535 €, tutti di TFR.');
    expect(plain(describeVersatoFooter(one))).toBe('Versamenti per anno d’imposta, non per data.');

    const mixed = { ...VERSATO, previousYearSingleNature: null };
    expect(plain(describeVersatoFooter(mixed))).toMatch(/^Nel 2025 aveva ricevuto 1000 €\. /);

    expect(plain(describeVersato({ ...VERSATO, rows: [], total: 0 }))).toBe('Nessun versamento con competenza 2026.');
  });
});

describe('Versamenti', () => {
  const row = (over: Partial<LedgerRow>): LedgerRow => ({
    id: 'c',
    date: new Date(2026, 7, 10),
    taxYear: 2026,
    nature: 'voluntary',
    amount: 500,
    fundId: 'fund-1',
    fundName: 'Fondo Cometa',
    sourceAccountName: 'Conto BancoPosta',
    recordedOn: new Date(2026, 7, 10),
    recordedInLaterMonth: false,
    isStraddling: false,
    notes: undefined,
    ...over,
  });
  const LEDGER: LedgerSummary = { year: 2026, count: 4, rows: [row({}), row({ id: 't', nature: 'tfr', amount: 534.88, date: new Date(2026, 5, 30), recordedOn: new Date(2026, 6, 5), recordedInLaterMonth: true, sourceAccountName: null })], latest: row({}) };
  LEDGER.rows.push(row({ id: 'e', nature: 'employer', amount: 134.11, sourceAccountName: null }), row({ id: 'v', amount: 152.02, sourceAccountName: null }));

  it('counts the rows and names the latest with its source account', () => {
    expect(plain(describeVersamenti(LEDGER))).toBe('4 versamenti con competenza 2026, l’ultimo il 10 agosto: 500 € volontari dal Conto BancoPosta.');
    expect(describeVersamentiAside(LEDGER)).toBe('4 versamenti');
  });

  it('names the recording month when it differs from the date, and the empty year', () => {
    const tfrLatest = { ...LEDGER, count: 1, rows: [LEDGER.rows[1]], latest: LEDGER.rows[1] };
    expect(plain(describeVersamenti(tfrLatest))).toBe('1 versamento con competenza 2026, il 30 giugno: 535 € di TFR, registrati il 5 luglio.');
    expect(describeVersamentiAside(tfrLatest)).toBe('1 versamento');

    expect(plain(describeVersamenti({ year: 2024, count: 0, rows: [], latest: null }))).toBe('Nessun versamento registrato con competenza 2024.');
  });
});

describe('load errors and the series aside', () => {
  it('names what did not load instead of computing on an empty set', async () => {
    const { buildPensionLoadErrorVerdict, describeFondoOggiSeriesAside } = await import('@/lib/utils/pensionNarrative');
    expect(buildPensionLoadErrorVerdict(['contributions']).headline).toBe('I dati della Previdenza non si sono caricati.');
    expect(plain(buildPensionLoadErrorVerdict(['contributions']).sentence)).toMatch(/^Non è stato possibile caricare i versamenti: /);
    expect(plain(buildPensionLoadErrorVerdict(['snapshots']).sentence)).toMatch(/caricare lo storico mensile da cui si calcola il rendimento:/);
    expect(plain(buildPensionLoadErrorVerdict(['contributions', 'snapshots']).sentence)).toMatch(/caricare i versamenti e lo storico mensile:/);
    expect(describeFondoOggiSeriesAside(TODAY)).toBe('nov 2025 → oggi · valore vivo');
    expect(describeFondoOggiSeriesAside({ ...TODAY, series: [] })).toBe('valore vivo');
  });
});
