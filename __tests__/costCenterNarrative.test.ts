import { describe, it, expect, vi } from 'vitest';

// chartService (the it-IT percentage formatter) pulls the Firebase chain; mock it away.
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

import type { Expense } from '@/types/expenses';
import type { CostCenter } from '@/types/costCenters';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import { summarizeCenter, summarizeCostCenters, buildCenterMonthStack } from '@/lib/utils/costCenterSummary';
import { buildCategoryComposition, buildSubCategoryComposition } from '@/lib/utils/costCenterUtils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import {
  CENTRI_ASIDE,
  CENTRI_FOOTER,
  EMPTY_CENTRI,
  buildCostCenterVerdict,
  buildCostCentersVerdict,
  describeArchiviati,
  describeArchivedRow,
  describeAverageKpi,
  describeBudgetCaptions,
  describeBudgetLabel,
  describeBudgetUsed,
  describeCategorie,
  describeCeilingHint,
  describeCenterChip,
  describeCenterRow,
  describeCenterTrailingCaption,
  describeCentri,
  describeCiclo,
  describeColorClash,
  describeColorSwatch,
  describeCostCenterDialogCopy,
  describeCicloAside,
  describeCicloFooter,
  describeCosto,
  describeCostoAside,
  describeCostoFooter,
  describeDormantRow,
  describeDormienti,
  describeIdle,
  describeLastYearCaption,
  describeLinkEmpty,
  describeLinkLeaves,
  describeLinkOutcome,
  describeLinkSelection,
  describeLinkSeries,
  describeLinkUndone,
  describeUnlinkOutcome,
  describeUnlinkSeriesReading,
  UNLINK_CONSEQUENCE,
  describeMonthKpi,
  describeMovimenti,
  describeMovimentiAside,
  describeSottocategorie,
  describeSottocategorieAside,
  describeTotale,
  describeTotaleAside,
  describeTotaleFooter,
  describeTrailingCaption,
  describeYearKpi,
} from '@/lib/utils/costCenterNarrative';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-22T10:00:00+02:00');
// Flattens the no-break space before € and the straight apostrophe the copy uses, so the
// expectations can be written with the typographic one inside single-quoted literals.
const plain = (narrative: Narrative | string) =>
  (typeof narrative === 'string' ? narrative : narrativeToText(narrative)).replace(/ /g, ' ').replace(/'/g, '’');
const day = (iso: string) => new Date(`${iso}T00:00:00`);
// The figure exactly as the narrative prints it (the no-break space before € included).
const euroNbsp = (value: number) => cachedFormatCurrencyEUR(value, true);

function expense(partial: Partial<Expense> & { date: Date; amount: number }): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    type: 'variable',
    categoryId: 'c1',
    categoryName: 'Carburante',
    subCategoryId: 's1',
    subCategoryName: 'Benzina',
    currency: 'EUR',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  };
}

function center(partial: Partial<CostCenter> = {}): CostCenter {
  return { id: 'auto', userId: 'u1', name: 'Automobile', createdAt: day('2023-03-12'), updatedAt: day('2023-03-12'), ...partial };
}

// Automobile: 5200 € since March 2023, 210 € booked in August, a 50 € instalment on the 28th.
const AUTO_ROWS: Expense[] = [
  expense({ date: day('2023-03-14'), amount: -100 }),
  expense({ date: day('2024-06-01'), amount: -2000, categoryId: 'c2', categoryName: 'Assicurazione', subCategoryId: 's2', subCategoryName: 'RCA', isRecurring: true }),
  expense({ date: day('2025-12-10'), amount: -1240 }),
  expense({ date: day('2026-02-03'), amount: -620, categoryId: 'c2', categoryName: 'Assicurazione', subCategoryId: 's2', subCategoryName: 'RCA', isRecurring: true, notes: 'Polizza' }),
  expense({ date: day('2026-05-10'), amount: -1030, categoryId: 'c3', categoryName: 'Manutenzione', subCategoryId: 's3', subCategoryName: 'Tagliando' }),
  expense({ date: day('2026-08-05'), amount: -140 }),
  expense({ date: day('2026-08-18'), amount: -70 }),
  expense({ date: day('2026-08-28'), amount: -50, isInstallment: true }),
];
const CASA_ROWS = [expense({ date: day('2024-06-10'), amount: -1450 }), expense({ date: day('2026-06-10'), amount: -2650 })];
// The same center with a 300 € instalment in November: nothing more is SPENT, the year ends 300 € higher.
const CASA_ROWS_WITH_INSTALMENT = [...CASA_ROWS, expense({ date: day('2026-11-10'), amount: -300, isInstallment: true })];
const BICI_ROWS = [expense({ date: day('2024-09-01'), amount: -700 }), expense({ date: day('2026-04-24'), amount: -300 })];

// Automobile's default ceiling is 250: the 210 € booked hold, the instalment on the 28th crosses
// it — the RISK as the page knows it since 2026-09-18 (the calendar, never a pace).
const list = (
  overrides: Partial<Record<'auto' | 'casa' | 'bici', Partial<CostCenter>>> = {},
  extra: { center: CostCenter; expenses: Expense[] }[] = [],
  casaRows: Expense[] = CASA_ROWS,
) =>
  summarizeCostCenters(
    [
      { center: center({ id: 'auto', name: 'Automobile', budgetAmount: 250, budgetPeriod: 'monthly', ...overrides.auto }), expenses: AUTO_ROWS },
      { center: center({ id: 'casa', name: 'Casa al mare', ...overrides.casa }), expenses: casaRows },
      { center: center({ id: 'bici', name: 'Bici', ...overrides.bici }), expenses: BICI_ROWS },
      ...extra,
    ],
    NOW,
  );

// ─── The list's verdict ───────────────────────────────────────────────────────

describe('buildCostCentersVerdict', () => {
  it('opens on the center at risk, names the most expensive one and the longest-idle one', () => {
    const v = buildCostCentersVerdict(list(), NOW);
    expect(v.headline).toBe('Automobile supererà il tetto di agosto.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toBe(
      '3 centri attivi per 10.300 € in totale: Automobile è il più caro (5200 €, il 50%) e ad agosto arriva a 260 € su 250 € con le spese già in calendario; Bici è fermo da 120 giorni.',
    );
  });

  it('never calls a risk what only a pace would cross: 260 € known on a 300 € ceiling holds', () => {
    // Until 2026-09-18 this read «al ritmo attuale chiude a ~346 € su 300 €».
    const v = buildCostCentersVerdict(list({ auto: { budgetAmount: 300 } }), NOW);
    expect(v.headline).toBe('Automobile è il centro più caro.');
    expect(plain(v.sentence)).not.toContain('ritmo');
  });

  it('states a crossed ceiling as a fact, before anything else', () => {
    const v = buildCostCentersVerdict(list({ auto: { budgetAmount: 200 } }), NOW);
    expect(v.headline).toBe('Automobile ha superato il tetto di agosto.');
    expect(v.tone).toBe('negative');
    expect(plain(v.sentence)).toBe(
      '3 centri attivi per 10.300 € in totale: Automobile è a 260 € su 200 € ad agosto, 60 € oltre, ed è anche il più caro (5200 €, il 50%); Bici è fermo da 120 giorni.',
    );
  });

  it('names the most expensive center when every ceiling holds, and says that no one is at risk', () => {
    const v = buildCostCentersVerdict(list({ auto: { budgetAmount: 800 } }), NOW);
    expect(v.headline).toBe('Automobile è il centro più caro.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('3 centri attivi per 10.300 € in totale: Automobile pesa 5200 € (il 50%) e nessun tetto è a rischio; Bici è fermo da 120 giorni.');
  });

  it('drops the ceiling clause without any ceiling and the dormant clause without any dormant center', () => {
    const v = buildCostCentersVerdict(list({ auto: { budgetAmount: undefined, budgetPeriod: undefined }, bici: { archivedAt: day('2026-05-01') } }), NOW);
    expect(v.headline).toBe('Automobile è il centro più caro.');
    expect(plain(v.sentence)).toBe('2 centri attivi per 9300 € in totale: Automobile pesa 5200 € (il 56%).');
  });

  it('separates a second center at risk from the most expensive one', () => {
    const v = buildCostCentersVerdict(
      list({ auto: { budgetAmount: undefined, budgetPeriod: undefined }, casa: { budgetAmount: 2700, budgetPeriod: 'annual' } }, [], CASA_ROWS_WITH_INSTALMENT),
      NOW,
    );
    expect(v.headline).toBe('Casa al mare supererà il tetto del 2026.');
    expect(plain(v.sentence)).toBe(
      '3 centri attivi per 10.300 € in totale: Automobile è il più caro (5200 €, il 50%); Casa al mare nel 2026 arriva a 2950 € su 2700 € con le spese già in calendario; Bici è fermo da 120 giorni.',
    );
  });

  it('counts two centers at risk or over', () => {
    const v = buildCostCentersVerdict(list({ casa: { budgetAmount: 2700, budgetPeriod: 'annual' } }, [], CASA_ROWS_WITH_INSTALMENT), NOW);
    expect(v.headline).toBe('2 centri supereranno il tetto.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toContain('Automobile e Casa al mare supereranno il tetto con le spese già in calendario');
  });

  it('says when there is nothing to judge', () => {
    expect(buildCostCentersVerdict(summarizeCostCenters([], NOW), NOW)).toEqual({
      headline: 'Nessun centro di costo.',
      tone: 'neutral',
      sentence: [{ text: 'Crea il primo centro per raggruppare le spese di un oggetto o di un progetto: il suo costo è il costo di sempre, senza periodo.' }],
    });

    const empty = summarizeCostCenters([{ center: center({ id: 'a', name: 'A' }), expenses: [] }, { center: center({ id: 'b', name: 'B' }), expenses: [] }], NOW);
    const v = buildCostCentersVerdict(empty, NOW);
    expect(v.headline).toBe('Nessuna spesa nei centri di costo.');
    // The feature's entry point is a field of ANOTHER page's form: the sentence names it and its place.
    expect(plain(v.sentence)).toBe('2 centri creati, ancora senza movimenti. Una spesa si collega dal suo form, in Tracciamento: campo «Centro di Costo», sotto «Impostazioni avanzate».');

    const archivedOnly = summarizeCostCenters([{ center: center({ archivedAt: day('2025-01-10') }), expenses: AUTO_ROWS }], NOW);
    const a = buildCostCentersVerdict(archivedOnly, NOW);
    expect(a.headline).toBe('Nessun centro attivo.');
    expect(plain(a.sentence)).toBe('1 centro archiviato per 5200 €: ripristinalo dal suo dettaglio o creane uno nuovo.');
  });

  it('names a never-used center instead of inventing an idle count', () => {
    const v = buildCostCentersVerdict(list({ auto: { budgetAmount: 800 }, bici: { archivedAt: day('2026-05-01') } }, [{ center: center({ id: 'nuovo', name: 'Nuovo' }), expenses: [] }]), NOW);
    expect(plain(v.sentence)).toBe('3 centri attivi per 9300 € in totale: Automobile pesa 5200 € (il 56%) e nessun tetto è a rischio; Nuovo non ha ancora spese.');
  });
});

// ─── The list's tiles ─────────────────────────────────────────────────────────

describe('list readings', () => {
  const s = list();

  const stack = buildCenterMonthStack(s.active, NOW, 12);

  it('reads the total over TIME — since when, this year, the tallest bar — and leaves the shares to the verdict and to Centri', () => {
    expect(plain(describeTotale(s, stack, NOW))).toBe('Da marzo 2023; quest’anno 4810 €, il 47% del totale. Il mese più caro degli ultimi 12 è giugno (2650 €).');
    expect(plain(describeTotale(s, stack, NOW))).not.toContain('Automobile');
    expect(plain(describeTotaleAside(s))).toBe('3 centri attivi · in totale');
    expect(describeTotaleFooter(s)).toBeNull();
    const withArchived = list({ bici: { archivedAt: day('2026-05-01') } });
    expect(plain(describeTotaleFooter(withArchived)!)).toBe('Escluso 1 centro archiviato (1000 €): è sotto la griglia.');
  });

  it('reads a single center without a second share', () => {
    const one = summarizeCostCenters([{ center: center(), expenses: AUTO_ROWS }], NOW);
    // A peak of another year carries its year: «dicembre» alone would read as the one to come.
    expect(plain(describeTotale(one, buildCenterMonthStack(one.active, NOW, 12), NOW))).toBe(
      'Da marzo 2023; quest’anno 1860 €, il 36% del totale. Il mese più caro degli ultimi 12 è dicembre 2025 (1240 €).',
    );
    expect(plain(describeTotaleAside(one))).toBe('1 centro attivo · in totale');
  });

  it('says so when the running month is already the record, and drops «quest\'anno» on a history born this year', () => {
    const young = summarizeCostCenters([{ center: center(), expenses: [expense({ date: day('2026-07-02'), amount: -200 }), expense({ date: day('2026-08-10'), amount: -900 })] }], NOW);
    expect(plain(describeTotale(young, buildCenterMonthStack(young.active, NOW, 12), NOW))).toBe(
      'Da luglio 2026. Agosto, ancora in corso, è già il mese più caro degli ultimi 12 (900 €).',
    );
  });

  it('captions last year as whole only when the history covers it', () => {
    expect(plain(describeLastYearCaption(NOW, day('2023-03-14')))).toBe('2025, intero');
    expect(plain(describeLastYearCaption(NOW, day('2025-01-20')))).toBe('2025, intero');
    expect(plain(describeLastYearCaption(NOW, null))).toBe('2025, intero');
    // The owner's account: a first expense in September 2025 read «2025, intero» beside «Quest'anno».
    expect(plain(describeLastYearCaption(NOW, day('2025-09-03')))).toBe('2025, da settembre');
  });

  it('gives Centri a scope of its own and an empty page the way in', () => {
    expect(plain(CENTRI_ASIDE)).toBe('in ordine di costo');
    expect(plain(CENTRI_ASIDE)).not.toBe(plain(describeTotaleAside(s)));
    expect(plain(EMPTY_CENTRI)).toBe('Nessun centro ancora. Dopo averne creato uno, una spesa si collega dal suo form, in Tracciamento: campo «Centro di Costo», sotto «Impostazioni avanzate».');
  });

  it('captions the bars with the running month', () => {
    expect(plain(describeTrailingCaption(buildCenterMonthStack(s.active, NOW, 12), NOW))).toBe('per centro · agosto in corso');
    expect(plain(describeCenterTrailingCaption(buildCenterMonthStack(s.active.slice(0, 1), NOW, 12), NOW))).toBe('agosto in corso');
    const empty = buildCenterMonthStack([], NOW, 12);
    expect(plain(describeTrailingCaption(empty, NOW))).toBe('nessuna spesa negli ultimi 12 mesi');
  });

  it('reads the ranked list', () => {
    expect(plain(describeCentri(s))).toBe('Automobile e Casa al mare fanno il 90% del totale; 1 centro ha un tetto.');
    expect(CENTRI_FOOTER.length).toBeGreaterThan(0);
  });

  it('captions each row with its count, its last expense and its own window', () => {
    const [auto, casa, bici] = s.active.map((row) => row.summary);
    expect(plain(describeCenterRow(auto, NOW))).toBe('7 movimenti · ultima spesa il 18/08 · con il calendario 260 € su 250 € ad agosto');
    expect(plain(describeCenterRow(casa, NOW))).toBe('2 movimenti · ultima spesa il 10/06 · quest’anno 2650 €');
    expect(plain(describeCenterRow(bici, NOW))).toBe('2 movimenti · ultima spesa il 24/04');
    expect(describeCenterChip(auto)).toEqual({ label: 'tetto mensile al 104%', tone: 'warning' });
    expect(describeCenterChip(casa)).toBeNull();
    expect(describeCenterChip(bici)).toEqual({ label: 'fermo da 120 giorni', tone: 'neutral' });
  });

  it('captions an exceeded ceiling and a holding one', () => {
    const over = list({ auto: { budgetAmount: 200 } }).active[0].summary;
    expect(plain(describeCenterRow(over, NOW))).toBe('7 movimenti · ultima spesa il 18/08 · 260 € su 200 € ad agosto, 60 € oltre');
    expect(describeCenterChip(over)).toEqual({ label: 'oltre il tetto', tone: 'negative' });
    const ok = list({ auto: { budgetAmount: 800 } }).active[0].summary;
    expect(plain(describeCenterRow(ok, NOW))).toBe('7 movimenti · ultima spesa il 18/08 · al 33% del tetto mensile');
    expect(describeCenterChip(ok)).toEqual({ label: 'tetto mensile al 33%', tone: 'neutral' });
    const never = summarizeCenter(center(), [], NOW);
    expect(plain(describeCenterRow(never, NOW))).toBe('nessuna spesa');
    expect(describeCenterChip(never)).toEqual({ label: 'nessuna spesa', tone: 'neutral' });
  });

  it('reads the dormant centers', () => {
    expect(plain(describeDormienti(s))).toBe('1 centro fermo: Bici non ha spese da 120 giorni.');
    expect(plain(describeDormantRow(s.dormant[0]))).toBe('ultima spesa il 24/04/2026 · 1000 € in totale');
    expect(describeIdle(s.dormant[0])).toEqual({ value: '120 giorni', caption: 'senza spese' });
    const none = list({ bici: { archivedAt: day('2026-05-01') } });
    expect(plain(describeDormienti(none))).toBe('Nessun centro fermo: tutti hanno spese negli ultimi 90 giorni.');
    const never = summarizeCenter(center({ name: 'Nuovo' }), [], NOW);
    expect(describeIdle(never)).toEqual({ value: 'mai', caption: 'nessuna spesa' });
    expect(plain(describeDormantRow(never))).toBe('nessuna spesa registrata');
  });

  it('reads the archived disclosure', () => {
    const withArchived = list({ bici: { archivedAt: day('2026-05-01') } });
    expect(plain(describeArchiviati(withArchived))).toBe('1 centro · 1000 € · escluso dal totale');
    expect(plain(describeArchivedRow(withArchived.archived[0].summary))).toBe('archiviato il 01/05/2026 · 2 movimenti');
  });
});

// ─── The detail's verdict ─────────────────────────────────────────────────────

describe('buildCostCenterVerdict', () => {
  it('judges a ceiling the calendar will cross as a risk, naming the day on a month, then tells the whole cost', () => {
    const v = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 250, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(v.headline).toBe('Automobile supererà il tetto di agosto.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toBe(
      'Lo superi il 28 con le spese già in calendario; a 9 giorni dalla fine del mese hai speso 210 € e ne hai in calendario 50 €: 260 € su 250 €, 10 € oltre; in tutto ti è costato 5200 € da marzo 2023.',
    );

    // A year has no crossing day (the guide's declared blind spot): the cause is named, not the date.
    const annual = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 1900, budgetPeriod: 'annual' }), AUTO_ROWS, NOW), NOW);
    expect(annual.headline).toBe('Automobile supererà il tetto del 2026.');
    expect(annual.tone).toBe('warning');
    expect(plain(annual.sentence)).toBe(
      'Lo superi con le spese già in calendario; da gennaio hai speso 1860 € e ne hai in calendario 50 €: 1910 € su 1900 €, 10 € oltre; in tutto ti è costato 5200 € da marzo 2023.',
    );
  });

  it('ranks a risk above dormancy, so the detail and the list name the same center for the same reason', () => {
    // Idle since January, an instalment in November that crosses the annual ceiling.
    const rows = [expense({ date: day('2026-01-15'), amount: -800 }), expense({ date: day('2026-11-30'), amount: -300, isInstallment: true })];
    const idle = summarizeCenter(center({ name: 'Fenicottero', budgetAmount: 1000, budgetPeriod: 'annual' }), rows, NOW);
    expect(idle.lifecycle).toBe('dormant');
    expect(idle.budget!.atRisk).toBe(true);
    expect(buildCostCenterVerdict(idle, NOW).headline).toBe('Fenicottero supererà il tetto del 2026.');
    const listed = buildCostCentersVerdict(summarizeCostCenters([{ center: idle.center, expenses: rows }], NOW), NOW);
    expect(listed.headline).toBe('Fenicottero supererà il tetto del 2026.');
  });

  it('tells when a monthly ceiling was crossed by what is booked', () => {
    const crossed = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 200, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(crossed.headline).toBe('Automobile ha superato il tetto di agosto.');
    expect(crossed.tone).toBe('negative');
    expect(plain(crossed.sentence)).toBe('Lo hai superato il 18; a 9 giorni dalla fine del mese hai impegnato 260 € su 200 €, 60 € oltre; in tutto ti è costato 5200 € da marzo 2023.');
  });

  it('judges a holding ceiling with the calendar, and an annual one on the year', () => {
    const monthly = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 800, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(monthly.headline).toBe('Automobile resta nel tetto di agosto.');
    expect(monthly.tone).toBe('positive');
    expect(plain(monthly.sentence)).toBe(
      'A 9 giorni dalla fine del mese hai impegnato 260 € su 800 €, il 33% al 71% del mese; in tutto ti è costato 5200 € da marzo 2023.',
    );

    const annual = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 6000, budgetPeriod: 'annual' }), AUTO_ROWS, NOW), NOW);
    expect(annual.headline).toBe('Automobile resta nel tetto del 2026.');
    expect(plain(annual.sentence)).toBe(
      'Da gennaio hai impegnato 1910 € su 6000 €, il 32% al 64% dell’anno; in tutto ti è costato 5200 € da marzo 2023.',
    );
  });

  it('reads a center without a ceiling by its monthly average', () => {
    const v = buildCostCenterVerdict(summarizeCenter(center(), AUTO_ROWS, NOW), NOW);
    expect(plain(v.headline)).toBe('Automobile costa 124 € al mese.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('5200 € in 7 movimenti da marzo 2023, 1860 € quest’anno; con le spese in calendario l’anno chiude a 1910 €.');
    // Nothing in the calendar: the clause drops, it never repeats «quest'anno».
    const bare = buildCostCenterVerdict(summarizeCenter(center(), AUTO_ROWS.filter((row) => !row.isInstallment), NOW), NOW);
    expect(plain(bare.sentence)).toBe('5200 € in 7 movimenti da marzo 2023, 1860 € quest’anno.');
    // Born this year: «900 € … da agosto 2026, 900 € quest'anno» would say the total twice.
    const young = buildCostCenterVerdict(summarizeCenter(center(), [expense({ date: day('2026-08-10'), amount: -900 })], NOW), NOW);
    expect(plain(young.sentence)).toBe('900 € in 1 movimento da agosto 2026.');
  });

  it('says a dormant center is dormant and gives it no projection', () => {
    const v = buildCostCenterVerdict(summarizeCenter(center({ name: 'Bici' }), BICI_ROWS, NOW), NOW);
    expect(v.headline).toBe('Bici è fermo da 120 giorni.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('Ultima spesa il 24/04/2026; in tutto ti è costato 1000 € da settembre 2024.');
  });

  it('says an archived center is archived, and a never-used one has nothing yet', () => {
    const v = buildCostCenterVerdict(summarizeCenter(center({ name: 'Trasloco', archivedAt: day('2025-01-10') }), CASA_ROWS, NOW), NOW);
    expect(v.headline).toBe('Trasloco è archiviato.');
    expect(plain(v.sentence)).toBe('Chiuso il 10/01/2025: 4100 € in 2 movimenti, escluso dal totale dei centri.');

    const never = buildCostCenterVerdict(summarizeCenter(center({ name: 'Nuovo' }), [], NOW), NOW);
    expect(never.headline).toBe('Nuovo non ha ancora spese.');
    expect(plain(never.sentence)).toBe('Una spesa si collega dal suo form, in Tracciamento: campo «Centro di Costo», sotto «Impostazioni avanzate».');
  });
});

// ─── The detail's tiles ───────────────────────────────────────────────────────

describe('detail readings', () => {
  const s = summarizeCenter(center({ budgetAmount: 400, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW);

  it('reads the cost tile', () => {
    expect(plain(describeCosto(s, NOW))).toBe('5200 € in 7 movimenti, 124 € al mese in media; quest’anno 1860 €, il 36%.');
    expect(plain(describeCostoAside(s))).toBe('da marzo 2023 · in totale');
    // A center born this year IS this year: «quest'anno 900 €, il 100%» would say the total twice.
    const young = summarizeCenter(center(), [expense({ date: day('2026-08-10'), amount: -900 })], NOW);
    expect(plain(describeCosto(young, NOW))).toBe('900 € in 1 movimento, 900 € al mese in media; tutto quest’anno.');
    expect(plain(describeCostoFooter(s))).toBe('Fisso 2620 € (il 50%, ricorrenti e rate) · una tantum 2580 €.');
    const oneOff = summarizeCenter(center(), CASA_ROWS, NOW);
    expect(plain(describeCostoFooter(oneOff))).toBe('Tutto una tantum: nessuna spesa ricorrente o a rate.');
  });

  it('labels the budget track with its own window', () => {
    expect(describeBudgetLabel(s.budget!, NOW)).toBe('Tetto mensile · agosto');
    expect(plain(describeBudgetUsed(s.budget!))).toBe('260 € su 400 €');
    const captions = describeBudgetCaptions(s.budget!);
    expect(plain(captions.left)).toBe('impegnato, al 65%');
    expect(plain(captions.right)).toBe('│ oggi, il 71% del mese');
    const annual = summarizeCenter(center({ budgetAmount: 6000, budgetPeriod: 'annual' }), AUTO_ROWS, NOW).budget!;
    expect(describeBudgetLabel(annual, NOW)).toBe('Tetto annuale · 2026');
    expect(plain(describeBudgetCaptions(annual).right)).toBe('│ oggi, il 64% dell’anno');
  });

  it('reads the three KPIs with their captions', () => {
    // The figure is what is BOOKED in the window; the calendar is the caption's. The end is a SUM: no «~».
    expect(plain(describeMonthKpi(s, NOW).value)).toBe('210 €');
    expect(plain(describeMonthKpi(s, NOW).caption)).toBe('con il calendario chiude a 260 €');
    expect(describeMonthKpi(s, NOW).tone).toBe('neutral');
    const atRisk = summarizeCenter(center({ budgetAmount: 250, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW);
    expect(describeMonthKpi(atRisk, NOW).tone).toBe('negative');
    expect(plain(describeMonthKpi(atRisk, NOW).caption)).toBe('con il calendario chiude a 260 €, 10 € oltre');
    expect(plain(describeYearKpi(s).value)).toBe('1860 €');
    expect(plain(describeYearKpi(s).caption)).toBe('con il calendario chiude a 1910 €');
    // Nothing in the calendar: the cell still carries its figure, and says it is the spent part.
    const bare = summarizeCenter(center(), AUTO_ROWS.filter((row) => !row.isInstallment), NOW);
    expect(describeMonthKpi(bare, NOW)).toEqual({ value: euroNbsp(210), caption: [{ text: 'speso finora' }], tone: 'neutral' });
    expect(plain(describeYearKpi(bare).caption)).toBe('speso finora');
    expect(plain(describeAverageKpi(s).value)).toBe('124 €');
    expect(describeAverageKpi(s).caption).toEqual([{ text: 'media su ' }, { text: '42', mono: true }, { text: ' mesi' }]);
    const dormant = summarizeCenter(center({ name: 'Bici' }), BICI_ROWS, NOW);
    expect(describeMonthKpi(dormant, NOW)).toEqual({ value: '—', caption: [{ text: 'nessuna spesa ad agosto' }], tone: 'muted' });
    expect(plain(describeYearKpi(dormant).value)).toBe('300 €');
  });

  it('reads the category and subcategory tiles', () => {
    const booked = AUTO_ROWS.slice(0, 7);
    expect(plain(describeCategorie(buildCategoryComposition(booked)))).toBe('Assicurazione è il 50% del costo; 3 categorie.');
    const subs = buildSubCategoryComposition(booked);
    expect(plain(describeSottocategorie(subs, new Set(), 5200))).toBe('3 sottocategorie; RCA pesa il 50%.');
    expect(plain(describeSottocategorie(subs, new Set(['s2']), 2580))).toBe('Al netto di RCA, 2580 €: Benzina pesa il 60%.');
    expect(plain(describeSottocategorie(subs, new Set(['s2', 's3']), 1550))).toBe('Al netto di 2 voci, 1550 €: Benzina pesa il 100%.');
    expect(describeSottocategorieAside(0)).toBeNull();
    expect(plain(describeSottocategorieAside(2)!)).toBe('2 escluse');
  });

  it('reads the lifecycle tile', () => {
    expect(plain(describeCiclo(s))).toBe('Attivo: l’ultima spesa è di 4 giorni fa.');
    expect(describeCicloAside(s)).toBe('attivo');
    expect(plain(describeCicloFooter(s))).toBe('Fermo dopo 90 giorni senza spese. Archiviarlo lo toglie dal totale; eliminarlo scollega i suoi movimenti, che restano in Cashflow.');
    const dormant = summarizeCenter(center({ name: 'Bici' }), BICI_ROWS, NOW);
    expect(plain(describeCiclo(dormant))).toBe('Fermo da 120 giorni: ultima spesa il 24/04/2026.');
    expect(describeCicloAside(dormant)).toBe('fermo');
    const archived = summarizeCenter(center({ archivedAt: day('2025-01-10') }), CASA_ROWS, NOW);
    expect(plain(describeCiclo(archived))).toBe('Archiviato il 10/01/2025.');
    expect(describeCicloAside(archived)).toBe('archiviato');
    const today = summarizeCenter(center(), [expense({ date: day('2026-08-22'), amount: -10 })], NOW);
    expect(plain(describeCiclo(today))).toBe('Attivo: l’ultima spesa è di oggi.');
  });

  it('reads the movements tile with the largest row and the scheduled ones', () => {
    expect(plain(describeMovimenti(s))).toBe('7 spese dal 14/03/2023 al 18/08/2026; la più grande è Assicurazione · RCA (2000 €) del 01/06/2024, e 1 è in calendario (50 €).');
    expect(plain(describeMovimentiAside(s))).toBe('8 voci');
    const casa = summarizeCenter(center(), CASA_ROWS, NOW);
    expect(plain(describeMovimenti(casa))).toBe('2 spese dal 10/06/2024 al 10/06/2026; la più grande è Carburante · Benzina (2650 €) del 10/06/2026.');
  });
});

// ─── The form ─────────────────────────────────────────────────────────────────

describe('the create/edit form', () => {
  it('teaches where an expense is linked on the reading of a NEW center, not of an edit', () => {
    const create = describeCostCenterDialogCopy(false);
    expect(plain(create.idle)).toBe(
      'Un centro misura il costo di sempre di un progetto, senza periodo. Le spese si collegano poi una a una dal loro form: campo «Centro di Costo», sotto «Impostazioni avanzate».',
    );
    expect(plain(describeCostCenterDialogCopy(true).idle)).not.toContain('Impostazioni avanzate');
    expect(create.submitting).toBe('Salvataggio in corso…');
  });

  it('names a swatch by its position and by who already wears it', () => {
    expect(describeColorSwatch(0, 8, [], false)).toBe('Colore 1 di 8');
    expect(describeColorSwatch(0, 8, ['Dacia Jogger'], true)).toBe('Colore 1 di 8, in uso da Dacia Jogger (selezionato)');
    expect(describeColorSwatch(2, 8, ['A', 'B'], false)).toBe('Colore 3 di 8, in uso da A e B');
  });

  it('says what a shared colour costs, and nothing when it is free', () => {
    expect(describeColorClash([])).toBeNull();
    expect(describeColorClash(['Dacia Jogger'])).toBe('È già il colore di Dacia Jogger: nei grafici i due centri non si distinguono.');
    expect(describeColorClash(['A', 'B'])).toBe('È già il colore di A e B: nei grafici questi centri non si distinguono.');
  });

  it('promises no notification for a ceiling: it is read on the page', () => {
    expect(describeCeilingHint('monthly')).toContain('tetto mensile');
    expect(describeCeilingHint('annual')).toContain('tetto annuale');
    expect(describeCeilingHint('annual')).not.toMatch(/ricever|avviso/);
  });
});

// ─── Linking many expenses at once ────────────────────────────────────────────

describe('«Collega spese…»', () => {
  it('counts what the confirm writes and names what it MOVES, before the button is pressed', () => {
    expect(plain(describeLinkSelection({ rowCount: 0, total: 0, moves: [] }, 'Dacia Jogger'))).toBe(
      'Nessuna spesa selezionata: spunta quelle che appartengono a Dacia Jogger.',
    );
    expect(plain(describeLinkSelection({ rowCount: 1, total: 70, moves: [] }, 'Dacia Jogger'))).toBe('1 spesa, 70 €.');
    expect(plain(describeLinkSelection({ rowCount: 12, total: 1840, moves: [{ centerId: 'v', centerName: 'Vacanze', count: 3 }] }, 'Dacia Jogger'))).toBe(
      '12 spese, 1840 € · 3 passano da Vacanze a Dacia Jogger.',
    );
    const two = { rowCount: 5, total: 200, moves: [{ centerId: 'v', centerName: 'Vacanze', count: 1 }, { centerId: 'c', centerName: 'Casa', count: 1 }] };
    expect(plain(describeLinkSelection(two, 'Dacia Jogger'))).toBe('5 spese, 200 € · 2 passano da Vacanze e Casa a Dacia Jogger.');
    expect(plain(describeLinkSelection({ rowCount: 2, total: 50, moves: [{ centerId: 'v', centerName: 'Vacanze', count: 1 }] }, 'Dacia Jogger'))).toContain('1 passa da Vacanze');
  });

  it('captions a series as one row that links every occurrence', () => {
    expect(describeLinkSeries({ kind: 'installment', count: 12, scheduledCount: 4 })).toBe('12 rate · 4 in calendario');
    expect(describeLinkSeries({ kind: 'installment', count: 1, scheduledCount: 0 })).toBe('1 rata');
    expect(describeLinkSeries({ kind: 'recurring', count: 24, scheduledCount: 0 })).toBe('serie di 24');
    expect(describeLinkLeaves([{ centerId: 'v', centerName: 'Vacanze', count: 2 }])).toBe('di Vacanze');
  });

  it('tells three kinds of empty list apart', () => {
    expect(describeLinkEmpty({ anyCandidate: false, anyHiddenByOtherCenters: false, filtered: false })).toContain('già tutte in questo centro');
    expect(describeLinkEmpty({ anyCandidate: true, anyHiddenByOtherCenters: true, filtered: true })).toBe('Nessuna uscita corrisponde ai filtri.');
    expect(describeLinkEmpty({ anyCandidate: true, anyHiddenByOtherCenters: true, filtered: false })).toContain('«Mostra anche quelle di altri centri»');
  });

  it('words the outcomes, the undo and the unlink', () => {
    expect(describeLinkOutcome(12, 'Dacia Jogger')).toBe('12 spese collegate a Dacia Jogger');
    expect(describeLinkOutcome(1, 'Dacia Jogger')).toBe('1 spesa collegata a Dacia Jogger');
    expect(describeUnlinkOutcome(3, 'Ornitorinco')).toBe('3 spese scollegate da Ornitorinco');
    expect(plain(describeLinkUndone(1))).toBe('Annullato: la spesa è tornata com’era.');
    expect(plain(describeLinkUndone(6))).toBe('Annullato: 6 spese sono tornate com’erano.');
    expect(UNLINK_CONSEQUENCE).toBe('Scollegando, la spesa resta in Cashflow ed esce dal centro.');
    expect(describeUnlinkSeriesReading('installment', 12, 'Dacia Jogger')).toContain('un piano di 12 rate collegate a Dacia Jogger');
    expect(describeUnlinkSeriesReading('recurring', 3, 'Ornitorinco')).toContain('una serie di 3 occorrenze');
  });
});
