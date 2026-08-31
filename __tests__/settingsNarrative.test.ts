/**
 * Tests for lib/utils/settingsNarrative.ts — the reading line of every Impostazioni tile.
 * The page has no verdict (it is a form), but every tile states its group's current state in
 * ONE rule-generated sentence; each phrasing is pinned here. Pure; chartService's Firebase
 * chain is mocked exactly like __tests__/budgetNarrative.test.ts does. Expectations are
 * written the way the screen prints them (nbsp flattened, four-digit amounts ungrouped).
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

import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import {
  describeAllocationTotal,
  describeAssistantPreferences,
  describeAutoCalc,
  describeBtpItalia,
  describeCashflowSettings,
  describeClassTargets,
  describeColorTheme,
  describeCosts,
  describeDefaultAccounts,
  describeDividendCategory,
  describeExpenseCategories,
  describeEmails,
  describeFamily,
  describeFireToggles,
  describeImport,
  describePerformanceBase,
  describePlanParameters,
  describeProfile,
  describeSharing,
  describeThemeMode,
  summarizeExpenseCategories,
} from '@/lib/utils/settingsNarrative';

const plain = (n: Narrative | null) => (n ? narrativeToText(n).replace(/ /g, ' ') : null);

// ─── Preferenze ───────────────────────────────────────────────────────────────

describe('describeProfile', () => {
  it('names age and rate and their downstream effect', () => {
    expect(plain(describeProfile({ userAge: 34, riskFreeRate: 3.5 }))).toBe(
      "Hai 34 anni e un risk-free al 3,5%: guidano l'auto-calcolo dei target e le metriche di rischio di Rendimenti."
    );
  });

  it('drops the rate clause and says what stalls without it', () => {
    expect(plain(describeProfile({ userAge: 34 }))).toBe(
      "Hai 34 anni; senza il risk-free rate l'auto-calcolo dei target non parte."
    );
  });

  it('drops the age clause and says what stalls without it', () => {
    expect(plain(describeProfile({ riskFreeRate: 3.5 }))).toBe(
      "Risk-free al 3,5%; senza l'età l'auto-calcolo dei target non parte."
    );
  });

  it('states the empty state without placeholders', () => {
    expect(plain(describeProfile({}))).toBe(
      "Età e risk-free rate non sono impostati: servono all'auto-calcolo dei target e alle metriche di rischio di Rendimenti."
    );
  });
});

describe('describePerformanceBase', () => {
  it('reads the managed base with a start month', () => {
    expect(
      plain(
        describePerformanceBase({
          includesPensionFunds: false,
          includesExcludedAssets: false,
          pensionReturnStartMonth: '2025-11',
        })
      )
    ).toBe(
      'Base gestita: fondi pensione e asset esclusi restano fuori; il rendimento del fondo si misura da novembre 2025.'
    );
  });

  it('reads the first-contribution fallback when no month is set', () => {
    expect(
      plain(
        describePerformanceBase({
          includesPensionFunds: false,
          includesExcludedAssets: false,
          pensionReturnStartMonth: '',
        })
      )
    ).toBe(
      'Base gestita: fondi pensione e asset esclusi restano fuori; il rendimento del fondo si misura dal primo versamento registrato.'
    );
  });

  it('names the widened base per toggle', () => {
    expect(
      plain(
        describePerformanceBase({
          includesPensionFunds: true,
          includesExcludedAssets: false,
          pensionReturnStartMonth: '',
        })
      )
    ).toContain('Base allargata ai fondi pensione');
    expect(
      plain(
        describePerformanceBase({
          includesPensionFunds: false,
          includesExcludedAssets: true,
          pensionReturnStartMonth: '',
        })
      )
    ).toContain('Base allargata agli asset esclusi');
    expect(
      plain(
        describePerformanceBase({
          includesPensionFunds: true,
          includesExcludedAssets: true,
          pensionReturnStartMonth: '',
        })
      )
    ).toContain('Base completa');
  });
});

describe('describeCosts', () => {
  it('reads the active duty with the checking subcategory threshold', () => {
    expect(
      plain(
        describeCosts({ stampDutyEnabled: true, stampDutyRate: 0.2, checkingAccountSubCategory: 'Conto Corrente' })
      )
    ).toBe(
      'Bollo allo 0,2% attivo: entra nel costo annuo del portafoglio; per i conti in Conto Corrente vale solo oltre 5000 €.'
    );
  });

  it('says the threshold does not apply without a subcategory', () => {
    expect(
      plain(describeCosts({ stampDutyEnabled: true, stampDutyRate: 0.2, checkingAccountSubCategory: '__none__' }))
    ).toBe(
      'Bollo allo 0,2% attivo: entra nel costo annuo del portafoglio; senza la sottocategoria dei conti correnti, la soglia dei 5000 € non si applica.'
    );
  });

  it('reads the disabled state plainly', () => {
    expect(
      plain(describeCosts({ stampDutyEnabled: false, stampDutyRate: 0.2, checkingAccountSubCategory: '__none__' }))
    ).toBe('Imposta di bollo spenta: non entra nel costo annuo del portafoglio.');
  });
});

describe('describeFireToggles', () => {
  it('reads house out, goals on with manual targets', () => {
    expect(
      plain(
        describeFireToggles({
          includePrimaryResidenceInFIRE: false,
          goalBasedInvestingEnabled: true,
          goalDrivenAllocationEnabled: false,
        })
      )
    ).toBe('La casa resta fuori dal patrimonio FIRE; obiettivi attivi, con target di allocazione manuali.');
  });

  it('reads house in and goal-derived targets', () => {
    expect(
      plain(
        describeFireToggles({
          includePrimaryResidenceInFIRE: true,
          goalBasedInvestingEnabled: true,
          goalDrivenAllocationEnabled: true,
        })
      )
    ).toBe('La casa è dentro il patrimonio FIRE; obiettivi attivi e target di allocazione derivati dagli obiettivi.');
  });

  it('reads goals off', () => {
    expect(
      plain(
        describeFireToggles({
          includePrimaryResidenceInFIRE: false,
          goalBasedInvestingEnabled: false,
          goalDrivenAllocationEnabled: false,
        })
      )
    ).toBe('La casa resta fuori dal patrimonio FIRE; obiettivi di investimento spenti.');
  });
});

describe('describePlanParameters', () => {
  it('reads the full plan with the lock clause', () => {
    expect(
      plain(
        describePlanParameters({
          withdrawalRate: 3.5,
          plannedAnnualExpenses: 24000,
          pensionInpsRetirementAge: 67,
          pensionRitaLongUnemployment: false,
          respectPensionLockInFire: true,
        })
      )
    ).toBe(
      "SWR al 3,5% e spese per 24.000 € l'anno; pensione INPS a 67 anni, RITA a 62 anni; il fondo pensione vincolato resta fuori dal FIRE fino allo sblocco."
    );
  });

  it('applies the long-unemployment RITA rule and drops the lock clause when off', () => {
    expect(
      plain(
        describePlanParameters({
          withdrawalRate: 4,
          plannedAnnualExpenses: undefined,
          pensionInpsRetirementAge: 67,
          pensionRitaLongUnemployment: true,
          respectPensionLockInFire: false,
        })
      )
    ).toBe('SWR al 4%; pensione INPS a 67 anni, RITA a 57 anni.');
  });

  it('marks the applicative INPS default as such', () => {
    expect(
      plain(
        describePlanParameters({
          withdrawalRate: undefined,
          plannedAnnualExpenses: 24000,
          pensionInpsRetirementAge: undefined,
          pensionRitaLongUnemployment: false,
          respectPensionLockInFire: false,
        })
      )
    ).toBe("Spese per 24.000 € l'anno; pensione INPS a 67 anni (predefinita), RITA a 62 anni.");
  });

  it('states the empty state and where the parameters live', () => {
    expect(
      plain(
        describePlanParameters({
          withdrawalRate: undefined,
          plannedAnnualExpenses: undefined,
          pensionInpsRetirementAge: undefined,
          pensionRitaLongUnemployment: false,
          respectPensionLockInFire: false,
        })
      )
    ).toBe('Nessun parametro salvato: SWR e spese si impostano da FIRE › Calcolatore, età INPS e RITA da Coast FIRE.');
  });
});

describe('describeAssistantPreferences', () => {
  it('reads the three preferences', () => {
    expect(
      plain(describeAssistantPreferences({ responseStyle: 'balanced', memoryEnabled: true, macroContextEnabled: false }))
    ).toBe('Risposte bilanciate, apprendimento attivo, ricerca web spenta.');
  });

  it('maps the other styles and drops missing clauses', () => {
    expect(plain(describeAssistantPreferences({ responseStyle: 'deep', memoryEnabled: undefined, macroContextEnabled: true }))).toBe(
      'Risposte approfondite, ricerca web attiva.'
    );
    expect(plain(describeAssistantPreferences({ responseStyle: 'concise', memoryEnabled: false, macroContextEnabled: undefined }))).toBe(
      'Risposte concise, apprendimento spento.'
    );
  });

  it('states the never-synced state', () => {
    expect(plain(describeAssistantPreferences({}))).toBe(
      'Preferenze non ancora sincronizzate: si leggono e modificano accanto alla conversazione.'
    );
  });
});

describe('describeCashflowSettings', () => {
  const SPLIT_OFF = { expenseSplitEnabled: false, familyMemberCount: 0 };

  it('names up to two labor categories, the history floor and cost centers', () => {
    expect(
      plain(
        describeCashflowSettings({
          laborCategoryNames: ['Stipendio', 'Freelance'],
          historyStartYear: 2023,
          costCentersEnabled: true,
          ...SPLIT_OFF,
        })
      )
    ).toBe(
      'Stipendio e Freelance contano come reddito da lavoro; lo storico parte dal 2023; Centri di Costo attivi; Divisione spenta.'
    );
  });

  it('counts the overflow past two names and reads the off state', () => {
    expect(
      plain(
        describeCashflowSettings({
          laborCategoryNames: ['Stipendio', 'Freelance', 'Bonus'],
          historyStartYear: 2025,
          costCentersEnabled: false,
          ...SPLIT_OFF,
        })
      )
    ).toBe(
      'Stipendio, Freelance e 1 altra contano come reddito da lavoro; lo storico parte dal 2025; Centri di Costo spenti; Divisione spenta.'
    );
  });

  it('reads the empty labor selection', () => {
    expect(
      plain(
        describeCashflowSettings({
          laborCategoryNames: [],
          historyStartYear: 2025,
          costCentersEnabled: false,
          ...SPLIT_OFF,
        })
      )
    ).toBe(
      'Nessuna categoria conta come reddito da lavoro; lo storico parte dal 2025; Centri di Costo spenti; Divisione spenta.'
    );
  });

  it('states what the Divisione does once two people exist', () => {
    expect(
      plain(
        describeCashflowSettings({
          laborCategoryNames: ['Stipendio'],
          historyStartYear: 2025,
          costCentersEnabled: false,
          expenseSplitEnabled: true,
          familyMemberCount: 2,
        })
      )
    ).toBe(
      'Stipendio conta come reddito da lavoro; lo storico parte dal 2025; Centri di Costo spenti; ogni voce si può marcare come personale e la Divisione ripartisce le comuni fra 2 persone.'
    );
  });

  // The toggle can be on with the household half-configured, and the reading has to say which
  // input is missing instead of promising a division that cannot happen.
  it('names the missing input when the split is on without two people', () => {
    expect(
      plain(
        describeCashflowSettings({
          laborCategoryNames: ['Stipendio'],
          historyStartYear: 2025,
          costCentersEnabled: false,
          expenseSplitEnabled: true,
          familyMemberCount: 1,
        })
      )
    ).toContain('Divisione attiva, ma in Famiglia c\'è una persona sola: servono almeno due.');

    expect(
      plain(
        describeCashflowSettings({
          laborCategoryNames: ['Stipendio'],
          historyStartYear: 2025,
          costCentersEnabled: false,
          expenseSplitEnabled: true,
          familyMemberCount: 0,
        })
      )
    ).toContain('Divisione attiva, ma senza nessuno in Famiglia non riparte nulla.');
  });
});

describe('describeFamily', () => {
  it('reads each member with their RAL', () => {
    expect(
      plain(
        describeFamily({
          members: [
            { name: 'Mario', grossAnnualIncome: 35000 },
            { name: 'Anna', grossAnnualIncome: 28000 },
          ],
        })
      )
    ).toBe('Il beneficio fiscale di Previdenza si calcola per persona: Mario (RAL 35.000 €) e Anna (RAL 28.000 €).');
  });

  it('says when a member has no RAL', () => {
    expect(plain(describeFamily({ members: [{ name: 'Anna' }] }))).toBe(
      'Il beneficio fiscale di Previdenza si calcola per persona: Anna (senza RAL).'
    );
  });

  it('states the empty state and its consequence', () => {
    expect(plain(describeFamily({ members: [] }))).toBe(
      'Nessun membro: i fondi pensione restano in Previdenza senza il calcolo del beneficio fiscale.'
    );
  });
});

describe('describeEmails', () => {
  it('lists the active reports and the recipients', () => {
    expect(
      plain(
        describeEmails({
          monthly: true,
          quarterly: false,
          semiAnnual: false,
          yearly: false,
          weeklyBudget: true,
          recipientCount: 2,
        })
      )
    ).toBe('Report mensile e budget settimanale attivi, verso 2 destinatari.');
  });

  it('uses the singular for one report and one recipient', () => {
    expect(
      plain(
        describeEmails({
          monthly: true,
          quarterly: false,
          semiAnnual: false,
          yearly: false,
          weeklyBudget: false,
          recipientCount: 1,
        })
      )
    ).toBe('Report mensile attivo, verso 1 destinatario.');
  });

  it('flags active reports with no recipients', () => {
    expect(
      plain(
        describeEmails({
          monthly: true,
          quarterly: true,
          semiAnnual: false,
          yearly: false,
          weeklyBudget: false,
          recipientCount: 0,
        })
      )
    ).toBe('Report mensile e trimestrale attivi, ma senza destinatari: aggiungi un indirizzo o non parte nulla.');
  });

  it('states the all-off state', () => {
    expect(
      plain(
        describeEmails({
          monthly: false,
          quarterly: false,
          semiAnnual: false,
          yearly: false,
          weeklyBudget: false,
          recipientCount: 2,
        })
      )
    ).toBe('Nessun report attivo: nessuna email in partenza.');
  });
});

// ─── Allocazione ──────────────────────────────────────────────────────────────

describe('describeAllocationTotal', () => {
  it('reads a leveraged plan', () => {
    expect(
      plain(
        describeAllocationTotal({
          total: 102.5,
          isValid: true,
          leverageRatio: 1.025,
          hasLeverage: true,
          cashUseFixedAmount: false,
          cashFixedAmount: 0,
        })
      )
    ).toBe('Il piano impegna il 102,5% del capitale investito: leva target 1,03×.');
  });

  it('reads an unleveraged plan', () => {
    expect(
      plain(
        describeAllocationTotal({
          total: 100,
          isValid: true,
          leverageRatio: 1,
          hasLeverage: false,
          cashUseFixedAmount: false,
          cashFixedAmount: 0,
        })
      )
    ).toBe('Il piano impegna il 100% del capitale investito, senza leva.');
  });

  it('reads an under-allocated plan as blocking', () => {
    expect(
      plain(
        describeAllocationTotal({
          total: 92.5,
          isValid: false,
          leverageRatio: 0.925,
          hasLeverage: false,
          cashUseFixedAmount: false,
          cashFixedAmount: 0,
        })
      )
    ).toBe('Il piano impegna il 92,5% del capitale investito: mancano 7,5 punti al 100% e il salvataggio è bloccato.');
  });

  it('names the fixed cash outside the percentage budget', () => {
    expect(
      plain(
        describeAllocationTotal({
          total: 100,
          isValid: true,
          leverageRatio: 1,
          hasLeverage: false,
          cashUseFixedAmount: true,
          cashFixedAmount: 10000,
        })
      )
    ).toBe(
      'Il piano impegna il 100% del capitale investito, senza leva; la liquidità fissa (10.000 €) resta fuori dal budget percentuale.'
    );
  });
});

describe('describeAutoCalc', () => {
  it('reads the enabled formula with the funded classes', () => {
    expect(
      plain(
        describeAutoCalc({
          enabled: true,
          userAge: 34,
          riskFreeRate: 3.5,
          equityPct: 46,
          bondsPct: 26.5,
          otherTotal: 27.5,
        })
      )
    ).toBe(
      'Formula su 34 anni e 3,5%: 46% alle Azioni e 26,5% alle Obbligazioni; le altre classi (27,5%) scalano dalle Azioni.'
    );
  });

  it('drops the funding clause when no other class has a target', () => {
    expect(
      plain(
        describeAutoCalc({ enabled: true, userAge: 34, riskFreeRate: 3.5, equityPct: 73.5, bondsPct: 26.5, otherTotal: 0 })
      )
    ).toBe('Formula su 34 anni e 3,5%: 73,5% alle Azioni e 26,5% alle Obbligazioni.');
  });

  it('reads the off state with what the formula would do', () => {
    expect(
      plain(
        describeAutoCalc({ enabled: false, userAge: 34, riskFreeRate: 3.5, equityPct: 46, bondsPct: 26.5, otherTotal: 27.5 })
      )
    ).toBe('Spento: i target sono manuali; con la formula su 34 anni e 3,5% le Azioni andrebbero al 46%.');
  });

  it('reads the off state without inputs', () => {
    expect(plain(describeAutoCalc({ enabled: false }))).toBe(
      'Spento: i target sono manuali; per usare la formula servono età e risk-free rate nel Profilo.'
    );
  });
});

describe('describeClassTargets', () => {
  it('counts the classes and reads leverage as legitimate', () => {
    expect(plain(describeClassTargets({ classCount: 8, withSubcategories: 1, isValid: true }))).toBe(
      '8 classi, 1 con sotto-categorie; un totale sopra il 100% è la leva target.'
    );
  });

  it('reads the invalid total as blocking', () => {
    expect(plain(describeClassTargets({ classCount: 8, withSubcategories: 0, isValid: false }))).toBe(
      '8 classi, nessuna con sotto-categorie; il totale è sotto il 100% e il salvataggio è bloccato.'
    );
  });
});

// ─── Spese ────────────────────────────────────────────────────────────────────

describe('describeDefaultAccounts', () => {
  it('reads two different accounts', () => {
    expect(plain(describeDefaultAccounts({ debitName: 'Conto A', creditName: 'Conto B' }))).toBe(
      'Le spese scalano da Conto A, le entrate arrivano su Conto B.'
    );
  });

  it('collapses the same account into one clause', () => {
    expect(plain(describeDefaultAccounts({ debitName: 'Conto BancoPosta', creditName: 'Conto BancoPosta' }))).toBe(
      'Spese ed entrate passano entrambe da Conto BancoPosta.'
    );
  });

  it('names the missing half', () => {
    expect(plain(describeDefaultAccounts({ debitName: 'Conto A' }))).toBe(
      'Le spese scalano da Conto A; nessun conto di accredito predefinito.'
    );
    expect(plain(describeDefaultAccounts({ creditName: 'Conto B' }))).toBe(
      'Le entrate arrivano su Conto B; nessun conto di prelievo predefinito.'
    );
  });

  it('states the empty state', () => {
    expect(plain(describeDefaultAccounts({}))).toBe(
      'Nessun conto predefinito: il dialog delle spese parte senza conto.'
    );
  });
});

describe('summarizeExpenseCategories + describeExpenseCategories', () => {
  it('counts by type and with subcategories', () => {
    const counts = summarizeExpenseCategories([
      { type: 'income', subCategories: [] },
      { type: 'income', subCategories: [{}, {}] },
      { type: 'fixed', subCategories: [{}] },
      { type: 'variable', subCategories: [] },
      { type: 'debt', subCategories: [] },
    ]);
    expect(counts).toEqual({ income: 2, fixed: 1, variable: 1, debt: 1, withSubcategories: 2 });
  });

  it('reads the counts with singulars where due', () => {
    expect(
      plain(describeExpenseCategories({ income: 4, fixed: 4, variable: 5, debt: 1, withSubcategories: 8 }))
    ).toBe('14 categorie: 4 di entrate, 4 fisse, 5 variabili e 1 di debito; 8 con sottocategorie.');
    expect(plain(describeExpenseCategories({ income: 0, fixed: 1, variable: 0, debt: 0, withSubcategories: 0 }))).toBe(
      '1 categoria: 1 fissa.'
    );
  });

  it('states the empty state', () => {
    expect(plain(describeExpenseCategories({ income: 0, fixed: 0, variable: 0, debt: 0, withSubcategories: 0 }))).toBe(
      'Nessuna categoria: creane una per dare un nome ai movimenti.'
    );
  });
});

describe('describeImport', () => {
  it('reads the idle promise', () => {
    expect(plain(describeImport({ phase: 'idle' }))).toBe(
      'Carichi un CSV e vedi cosa verrà importato, saltato e creato prima di confermare; ogni import si annulla in un tocco.'
    );
  });

  it('reads the preview counts', () => {
    expect(
      plain(describeImport({ phase: 'preview', fileName: 'movimenti-2023.csv', validCount: 142, skippedCount: 6, newCategoriesCount: 3 }))
    ).toBe('Da movimenti-2023.csv: 142 voci da importare, 6 righe scartate, 3 categorie da creare.');
  });

  it('spells the zeroes out in the preview', () => {
    expect(
      plain(describeImport({ phase: 'preview', fileName: 'due.csv', validCount: 1, skippedCount: 0, newCategoriesCount: 0 }))
    ).toBe('Da due.csv: 1 voce da importare, nessuna riga scartata, nessuna categoria da creare.');
  });

  it('reads the done state with the undo', () => {
    expect(plain(describeImport({ phase: 'done', created: 142 }))).toBe(
      'Importate 142 transazioni: le trovi in Cashflow e Analisi; «Annulla import» le rimuove tutte insieme.'
    );
    expect(plain(describeImport({ phase: 'done', created: 1 }))).toBe(
      'Importata 1 transazione: la trovi in Cashflow e Analisi; «Annulla import» la rimuove.'
    );
  });
});

// ─── Dividendi ────────────────────────────────────────────────────────────────

describe('describeDividendCategory', () => {
  it('names the landing category and subcategory', () => {
    expect(plain(describeDividendCategory({ categoryName: 'Dividendi', subCategoryName: 'ETF' }))).toBe(
      "Ogni incasso registrato diventa un'entrata in Dividendi › ETF, senza doppioni."
    );
  });

  it('works without a subcategory', () => {
    expect(plain(describeDividendCategory({ categoryName: 'Dividendi' }))).toBe(
      "Ogni incasso registrato diventa un'entrata in Dividendi, senza doppioni."
    );
  });

  it('states the consequence of no category', () => {
    expect(plain(describeDividendCategory({}))).toBe(
      'Senza una categoria, gli incassi non diventano entrate nel cashflow.'
    );
  });
});

describe('describeBtpItalia', () => {
  it('declares where the FOI is announced', () => {
    expect(plain(describeBtpItalia())).toBe(
      'Le cedole indicizzate attendono il FOI del periodo: lo annunci dal calendario di Dividendi, cedola per cedola.'
    );
  });
});

// ─── Condivisione e Aspetto ───────────────────────────────────────────────────

describe('describeSharing', () => {
  it('names the member and what they can do', () => {
    expect(plain(describeSharing({ memberNames: ['Marcella'] }))).toBe(
      'Marcella vede e modifica tutto — spese, asset, dividendi — con le sue credenziali.'
    );
  });

  it('handles more members', () => {
    expect(plain(describeSharing({ memberNames: ['Marcella', 'Luca'] }))).toBe(
      'Marcella e Luca vedono e modificano tutto — spese, asset, dividendi — con le loro credenziali.'
    );
  });

  it('states the empty state', () => {
    expect(plain(describeSharing({ memberNames: [] }))).toBe(
      'Nessun accesso condiviso: questi dati li vedi solo tu.'
    );
  });
});

describe('describeThemeMode', () => {
  it('reads the explicit modes', () => {
    expect(plain(describeThemeMode('dark'))).toBe(
      'Tema scuro su questo dispositivo; «Sistema» segue le impostazioni del dispositivo.'
    );
    expect(plain(describeThemeMode('light'))).toBe(
      'Tema chiaro su questo dispositivo; «Sistema» segue le impostazioni del dispositivo.'
    );
    expect(plain(describeThemeMode('system'))).toBe(
      'Il tema segue il dispositivo; la scelta vale solo su questo browser.'
    );
  });

  it('returns null before hydration resolves the theme', () => {
    expect(describeThemeMode(undefined)).toBeNull();
  });
});

describe('describeColorTheme', () => {
  it('names the active theme and its sync scope', () => {
    expect(plain(describeColorTheme('Solar Dusk'))).toBe('Solar Dusk attivo, sincronizzato su tutti i dispositivi.');
  });
});
