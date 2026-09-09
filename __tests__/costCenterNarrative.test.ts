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
import {
  CENTRI_FOOTER,
  buildCostCenterVerdict,
  buildCostCentersVerdict,
  describeArchiviati,
  describeArchivedRow,
  describeAverageKpi,
  describeBudgetCaptions,
  describeBudgetLabel,
  describeBudgetUsed,
  describeCategorie,
  describeCenterChip,
  describeCenterRow,
  describeCenterTrailingCaption,
  describeCentri,
  describeCiclo,
  describeCicloAside,
  describeCicloFooter,
  describeCosto,
  describeCostoAside,
  describeCostoFooter,
  describeDormantRow,
  describeDormienti,
  describeIdle,
  describeLastYearCaption,
  describeMonthEndKpi,
  describeMovimenti,
  describeMovimentiAside,
  describeSottocategorie,
  describeSottocategorieAside,
  describeTotale,
  describeTotaleAside,
  describeTotaleFooter,
  describeTrailingCaption,
  describeYearEndKpi,
} from '@/lib/utils/costCenterNarrative';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-22T10:00:00+02:00');
// Flattens the no-break space before € and the straight apostrophe the copy uses, so the
// expectations can be written with the typographic one inside single-quoted literals.
const plain = (narrative: Narrative | string) =>
  (typeof narrative === 'string' ? narrative : narrativeToText(narrative)).replace(/ /g, ' ').replace(/'/g, '’');
const day = (iso: string) => new Date(`${iso}T00:00:00`);

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
const BICI_ROWS = [expense({ date: day('2024-09-01'), amount: -700 }), expense({ date: day('2026-04-24'), amount: -300 })];

const list = (overrides: Partial<Record<'auto' | 'casa' | 'bici', Partial<CostCenter>>> = {}, extra: { center: CostCenter; expenses: Expense[] }[] = []) =>
  summarizeCostCenters(
    [
      { center: center({ id: 'auto', name: 'Automobile', budgetAmount: 300, budgetPeriod: 'monthly', ...overrides.auto }), expenses: AUTO_ROWS },
      { center: center({ id: 'casa', name: 'Casa al mare', ...overrides.casa }), expenses: CASA_ROWS },
      { center: center({ id: 'bici', name: 'Bici', ...overrides.bici }), expenses: BICI_ROWS },
      ...extra,
    ],
    NOW,
  );

// ─── The list's verdict ───────────────────────────────────────────────────────

describe('buildCostCentersVerdict', () => {
  it('opens on the center at risk, names the most expensive one and the longest-idle one', () => {
    const v = buildCostCentersVerdict(list(), NOW);
    expect(v.headline).toBe('Automobile rischia di sforare il tetto di agosto.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toBe(
      '3 centri attivi per 10.300 € in totale: Automobile è il più caro (5200 €, il 50%) e ad agosto è all’87% del tetto, al ritmo attuale chiude a ~346 € su 300 €; Bici è fermo da 120 giorni.',
    );
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
    const v = buildCostCentersVerdict(list({ auto: { budgetAmount: undefined, budgetPeriod: undefined }, casa: { budgetAmount: 2700, budgetPeriod: 'annual' } }), NOW);
    expect(v.headline).toBe('Casa al mare rischia di sforare il tetto del 2026.');
    expect(plain(v.sentence)).toBe(
      '3 centri attivi per 10.300 € in totale: Automobile è il più caro (5200 €, il 50%); Casa al mare nel 2026 è al 98% del tetto, al ritmo attuale chiude a ~4134 € su 2700 €; Bici è fermo da 120 giorni.',
    );
  });

  it('counts two centers at risk or over', () => {
    const v = buildCostCentersVerdict(list({ casa: { budgetAmount: 2700, budgetPeriod: 'annual' } }), NOW);
    expect(v.headline).toBe('2 centri rischiano di sforare il tetto.');
    expect(v.tone).toBe('warning');
  });

  it('says when there is nothing to judge', () => {
    expect(buildCostCentersVerdict(summarizeCostCenters([], NOW), NOW)).toEqual({
      headline: 'Nessun centro di costo.',
      tone: 'neutral',
      sentence: [{ text: 'Crea il primo centro per raggruppare le spese di un oggetto o di un progetto.' }],
    });

    const empty = summarizeCostCenters([{ center: center({ id: 'a', name: 'A' }), expenses: [] }, { center: center({ id: 'b', name: 'B' }), expenses: [] }], NOW);
    const v = buildCostCentersVerdict(empty, NOW);
    expect(v.headline).toBe('Nessuna spesa nei centri di costo.');
    expect(plain(v.sentence)).toBe('2 centri creati, ancora senza movimenti: collega una spesa da Tracciamento per vederla qui.');

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

  it('reads the total with the top shares', () => {
    expect(plain(describeTotale(s))).toBe('10.300 € dal marzo 2023: Automobile pesa il 50%, i primi 2 il 90%.');
    expect(plain(describeTotaleAside(s))).toBe('3 centri attivi · in totale');
    expect(describeTotaleFooter(s)).toBeNull();
    const withArchived = list({ bici: { archivedAt: day('2026-05-01') } });
    expect(plain(describeTotaleFooter(withArchived)!)).toBe('Escluso 1 centro archiviato (1000 €): è sotto la griglia.');
  });

  it('reads a single center without a second share', () => {
    const one = summarizeCostCenters([{ center: center(), expenses: AUTO_ROWS }], NOW);
    expect(plain(describeTotale(one))).toBe('5200 € dal marzo 2023: Automobile è l’unico centro con spese.');
    expect(plain(describeTotaleAside(one))).toBe('1 centro attivo · in totale');
  });

  it('captions last year by its number', () => {
    expect(plain(describeLastYearCaption(NOW))).toBe('2025, intero');
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
    expect(plain(describeCenterRow(auto, NOW))).toBe('7 movimenti · ultima spesa il 18/08 · al ritmo attuale ~346 € su 300 € ad agosto');
    expect(plain(describeCenterRow(casa, NOW))).toBe('2 movimenti · ultima spesa il 10/06 · quest’anno 2650 €');
    expect(plain(describeCenterRow(bici, NOW))).toBe('2 movimenti · ultima spesa il 24/04');
    expect(describeCenterChip(auto)).toEqual({ label: "tetto mensile all'87%", tone: 'warning' });
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
  it('judges a monthly ceiling at risk, then tells the whole cost', () => {
    const v = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 300, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(v.headline).toBe('Automobile rischia di sforare il tetto di agosto.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toBe(
      'A 9 giorni dalla fine del mese hai impegnato 260 € su 300 €, e al ritmo attuale chiudi a ~346 €, 46 € oltre; in tutto ti è costato 5200 € da marzo 2023.',
    );

    const annual = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 2500, budgetPeriod: 'annual' }), AUTO_ROWS, NOW), NOW);
    expect(annual.headline).toBe('Automobile rischia di sforare il tetto del 2026.');
    expect(plain(annual.sentence)).toBe(
      'Da gennaio hai impegnato 1910 € su 2500 €, il 76% al 64% dell’anno, e al ritmo attuale chiudi a ~2951 €, 451 € oltre; in tutto ti è costato 5200 € da marzo 2023.',
    );
  });

  it('tells when a monthly ceiling was crossed, or will be by a row already in the calendar', () => {
    const crossed = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 200, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(crossed.headline).toBe('Automobile ha superato il tetto di agosto.');
    expect(crossed.tone).toBe('negative');
    expect(plain(crossed.sentence)).toBe('Lo hai superato il 18; a 9 giorni dalla fine del mese hai impegnato 260 € su 200 €, 60 € oltre; in tutto ti è costato 5200 € da marzo 2023.');

    const ahead = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 250, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(ahead.headline).toBe('Automobile supererà il tetto di agosto.');
    expect(plain(ahead.sentence)).toBe('Lo superi il 28 con le spese già in calendario; a 9 giorni dalla fine del mese hai impegnato 260 € su 250 €, 10 € oltre; in tutto ti è costato 5200 € da marzo 2023.');
  });

  it('judges a holding ceiling with the calendar, and an annual one on the year', () => {
    const monthly = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 800, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW), NOW);
    expect(monthly.headline).toBe('Automobile resta nel tetto di agosto.');
    expect(monthly.tone).toBe('positive');
    expect(plain(monthly.sentence)).toBe(
      'A 9 giorni dalla fine del mese hai impegnato 260 € su 800 €, il 33% al 71% del mese, e al ritmo attuale chiudi a ~346 €; in tutto ti è costato 5200 € da marzo 2023.',
    );

    const annual = buildCostCenterVerdict(summarizeCenter(center({ budgetAmount: 6000, budgetPeriod: 'annual' }), AUTO_ROWS, NOW), NOW);
    expect(annual.headline).toBe('Automobile resta nel tetto del 2026.');
    expect(plain(annual.sentence)).toBe(
      'Da gennaio hai impegnato 1910 € su 6000 €, il 32% al 64% dell’anno, e al ritmo attuale chiudi a ~2951 €; in tutto ti è costato 5200 € da marzo 2023.',
    );
  });

  it('reads a center without a ceiling by its monthly average', () => {
    const v = buildCostCenterVerdict(summarizeCenter(center(), AUTO_ROWS, NOW), NOW);
    expect(plain(v.headline)).toBe('Automobile costa 124 € al mese.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('5200 € in 7 movimenti da marzo 2023, 1860 € quest’anno; al ritmo attuale l’anno chiude a ~2951 €.');
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
    expect(plain(never.sentence)).toBe('Collega una spesa da Tracciamento per vederla qui.');
  });
});

// ─── The detail's tiles ───────────────────────────────────────────────────────

describe('detail readings', () => {
  const s = summarizeCenter(center({ budgetAmount: 400, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW);

  it('reads the cost tile', () => {
    expect(plain(describeCosto(s))).toBe('5200 € in 7 movimenti, 124 € al mese in media; quest’anno 1860 €, il 36%.');
    expect(plain(describeCostoAside(s))).toBe('dal marzo 2023 · in totale');
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
    expect(plain(describeMonthEndKpi(s, NOW).value)).toBe('~346 €');
    expect(describeMonthEndKpi(s, NOW).caption).toEqual([{ text: 'al ritmo attuale' }]);
    expect(describeMonthEndKpi(s, NOW).tone).toBe('neutral');
    const atRisk = summarizeCenter(center({ budgetAmount: 300, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW);
    expect(describeMonthEndKpi(atRisk, NOW).tone).toBe('negative');
    expect(plain(describeMonthEndKpi(atRisk, NOW).caption)).toBe('al ritmo attuale, 46 € oltre');
    expect(plain(describeYearEndKpi(s).value)).toBe('~2951 €');
    expect(plain(describeYearEndKpi(s).caption)).toBe('al ritmo di quest’anno');
    expect(plain(describeAverageKpi(s).value)).toBe('124 €');
    expect(describeAverageKpi(s).caption).toEqual([{ text: 'media su ' }, { text: '42', mono: true }, { text: ' mesi' }]);
    const dormant = summarizeCenter(center({ name: 'Bici' }), BICI_ROWS, NOW);
    expect(describeMonthEndKpi(dormant, NOW)).toEqual({ value: '—', caption: [{ text: 'nessuna spesa ad agosto' }], tone: 'muted' });
    expect(describeYearEndKpi(dormant)).toEqual({ value: '—', caption: [{ text: 'centro fermo' }], tone: 'muted' });
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
