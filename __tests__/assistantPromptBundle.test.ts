/**
 * Tests for the numeric data block the assistant prompt builders emit.
 *
 * Everything here goes through `buildMonthAnalysisPrompt(...).userContent` — the path a
 * real request takes — rather than through `formatBundleForPrompt` directly. (The formatter
 * is exported, but only because the periodic emails send the same block; asserting against
 * the real entry point still reads just as well and covers the wiring too.)
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_SYSTEM_CORE,
  WEB_OFF_LINE,
  buildAssistantSystem,
  buildEmailPeriodicFormatContract,
  REGISTER_CONTRACT,
  buildChatPrompt,
  buildRegisterPrompt,
  REGISTER_MEMORY_EMPTY_LINE,
  buildHistoryAnalysisPrompt,
  buildMonthAnalysisPrompt,
  buildYearAnalysisPrompt,
  buildYtdAnalysisPrompt,
  formatTodayContextForPrompt,
  formatCashflowBlockSection,
} from '@/lib/server/assistant/prompts';
import { AssistantMonthContextBundle, AssistantPreferences } from '@/types/assistant';
import { emptyAssistantPortfolioContext } from '@/lib/utils/assistantPortfolioContext';
import { EXPENSE_PROPOSALS_MAX_PER_MESSAGE } from '@/lib/utils/expenseProposal';
import { ASSISTANT_QUESTION_MAX_PER_MESSAGE } from '@/lib/utils/questionSet';
import { MAX_RECURRENCE_OCCURRENCES } from '@/lib/utils/recurrenceDates';

const PREFERENCES: AssistantPreferences = {
  responseStyle: 'balanced',
  includeMacroContext: false,
  memoryEnabled: false,
  includeDummySnapshots: false,
};

function makeBundle(overrides: Partial<AssistantMonthContextBundle> = {}): AssistantMonthContextBundle {
  return {
    selector: { year: 2025, month: 3 },
    currentSnapshot: null,
    previousSnapshot: null,
    cashflow: {
      totalIncome: 3000,
      totalDividends: 0,
      totalExpenses: -1000,
      netCashFlow: 2000,
      transactionCount: 12,
      expenseTransactionCount: 9,
    },
    netWorth: { start: null, end: null, delta: null, deltaPct: null },
    allocationChanges: [],
    expensesByCategory: [],
    incomeByCategory: [],
    expensesByType: [],
    topIndividualExpenses: [],
    bySubCategoryAllocation: {},
    targetAllocation: null,
    targetAllocationSource: 'manual',
    portfolio: emptyAssistantPortfolioContext(),
    goals: null,
    expenseCategories: [],
    dataQuality: {
      hasSnapshot: true,
      hasPreviousBaseline: false,
      hasCashflowData: true,
      isPartialMonth: false,
      notes: [],
    },
    ...overrides,
  };
}

const CASA = {
  categoryName: 'Casa',
  total: -800,
  transactionCount: 4,
  subCategories: [
    { subCategoryName: 'Elettricità', total: -500, transactionCount: 3 },
    { subCategoryName: 'Bonifica', total: -300, transactionCount: 1 },
  ],
};

/**
 * Renders the data block, collapsing the non-breaking space Intl.NumberFormat puts
 * before "€" into a plain one. Without this every currency assertion would have to
 * embed an invisible U+00A0 to match, which is unreadable and easy to get wrong.
 */
function render(bundle: AssistantMonthContextBundle): string {
  return buildMonthAnalysisPrompt(bundle, '', PREFERENCES).userContent.replace(/ /g, ' ');
}

describe('assistant prompt data block', () => {
  describe('expense category and subcategory section', () => {
    it('should render every category with its subcategories indented beneath it', () => {
      // Arrange
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- SPESE PER CATEGORIA E SOTTOCATEGORIA (elenco completo del periodo) ---');
      expect(content).toContain('  › Elettricità:');
      expect(content).toContain('  › Bonifica:');
    });

    it('should state the share of total spending each category represents', () => {
      // Arrange — Casa is 800 of 1000 total spending
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('80,0% delle uscite');
    });

    it('should not prefix a share with a plus sign', () => {
      // Arrange — pct() would render "+80.00%", which reads as growth, not a proportion
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).not.toContain('+80');
    });

    it('should omit the section entirely when the period has no spending', () => {
      // Act
      const content = render(makeBundle());

      // Assert
      expect(content).not.toContain('SPESE PER CATEGORIA E SOTTOCATEGORIA');
    });

    it('should use the singular form for a one-transaction row', () => {
      // Arrange
      const bundle = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('(1 transazione)');
      expect(content).not.toContain('(1 transazioni)');
    });
  });

  describe('subcategory safety valve', () => {
    // 200 subcategory rows across 4 categories — past the 150-row rendering cap.
    const oversized = Array.from({ length: 4 }, (_, categoryIndex) => ({
      categoryName: `Categoria ${categoryIndex}`,
      total: -5000,
      transactionCount: 50,
      subCategories: Array.from({ length: 50 }, (_, subIndex) => ({
        subCategoryName: `Voce ${categoryIndex}-${subIndex}`,
        total: -100,
        transactionCount: 1,
      })),
    }));

    it('should declare the omission rather than truncating silently', () => {
      // Act
      const content = render(makeBundle({ expensesByCategory: oversized }));

      // Assert — a silent cap is what made the assistant answer "N/D" in the first place
      expect(content).toContain('50 sottocategorie minori omesse per brevità');
      expect(content).toContain('le categorie sopra sono comunque complete');
    });

    it('should still list every category when subcategory rows are capped', () => {
      // Act
      const content = render(makeBundle({ expensesByCategory: oversized }));

      // Assert
      for (const category of oversized) {
        expect(content).toContain(`${category.categoryName}:`);
      }
    });

    it('should not mention any omission when the data fits', () => {
      // Act
      const content = render(makeBundle({ expensesByCategory: [CASA] }));

      // Assert
      expect(content).not.toContain('omesse per brevità');
    });
  });

  describe('other cashflow sections', () => {
    it('should render spending by type with each share of the total', () => {
      // Arrange
      const bundle = makeBundle({
        expensesByType: [
          { type: 'fixed', label: 'Spese Necessarie', total: -750 },
          { type: 'variable', label: 'Spese Non Necessarie', total: -250 },
        ],
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- SPESE PER TIPO ---');
      expect(content).toContain('Spese Necessarie: -750 € (75,0%)');
    });

    it('should print «Entrate» as the Cashflow page does, dividends inside and named', () => {
      // Arrange: 3000 of salary and 140 of coupons — Tracciamento prints 3140 as Entrate.
      const bundle = makeBundle({ cashflow: { ...makeBundle().cashflow, totalDividends: 140 } });

      // Act
      const content = render(bundle);

      // Assert: the same total as the page, the coupons named inside it, no second «Entrate».
      expect(content).toContain('Entrate: 3140 € (di cui dividendi e cedole 140 €; è lo stesso totale della pagina Cashflow)');
      expect(content).not.toContain('Entrate (esclusi dividendi)');
    });

    it('should render income by category and say dividends are reported elsewhere', () => {
      // Arrange
      const bundle = makeBundle({
        incomeByCategory: [{ categoryName: 'Stipendio', total: 3000, transactionCount: 1 }],
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- ENTRATE PER CATEGORIA (esclusi i dividendi, già contati in Entrate) ---');
      // No thousands separator at four digits: it-IT groups from five up.
      expect(content).toContain('Stipendio: 3000 € (1 transazione)');
    });

    it('should date each individual expense and name its subcategory', () => {
      // Arrange
      const bundle = makeBundle({
        topIndividualExpenses: [
          {
            categoryName: 'Casa',
            subCategoryName: 'Bonifica',
            amount: -300,
            notes: 'Bonifica cisterna',
            date: '2025-03-12',
          },
        ],
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('2025-03-12 · Casa › Bonifica – Bonifica cisterna: -300 €');
    });

    it('should separate the spending transaction count from the overall one', () => {
      // Act
      const content = render(makeBundle());

      // Assert
      expect(content).toContain('Numero transazioni: 12 (di cui 9 di spesa');
    });
  });

  describe('goals section', () => {
    it('should state that Goal-Based Investing is off rather than omitting the section', () => {
      // Arrange — a missing section is indistinguishable, to a model, from missing data.
      const bundle = makeBundle({ goals: null });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('--- OBIETTIVI DI INVESTIMENTO (Goal-Based Investing) ---');
      expect(content).toContain('Goal-Based Investing non attivo');
      expect(content).toContain('Non è un dato mancante');
    });

    it('should distinguish an enabled feature with no goals from a disabled one', () => {
      // Arrange
      const bundle = makeBundle({
        goals: { enabled: true, goalDrivenAllocationEnabled: false, items: [] },
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('Funzionalità attiva ma nessun obiettivo ancora creato');
      expect(content).not.toContain('Goal-Based Investing non attivo');
    });

    it('should render each goal with progress, deadline, priority and verdict', () => {
      // Arrange
      const bundle = makeBundle({
        goals: {
          enabled: true,
          goalDrivenAllocationEnabled: false,
          items: [
            {
              id: 'goal-1', name: 'Acquisto Casa',
              targetAmount: 100000,
              targetDateIso: '2032-06-01',
              priority: 'alta',
              currentValue: 25000,
              monthlyContribution: 500,
              recommendedAllocation: { bonds: 70, equity: 30 },
              verdict: 'offTrack',
              assignments: [],
            },
          ],
        },
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('Elenco completo (1)');
      // The id beside the name is the handle a ```goal-proposal block names to MODIFY the goal.
      expect(content).toContain('Acquisto Casa [id goal-1]: valore attuale 25.000 €');
      expect(content).toContain('target 100.000 € (25,0% raggiunto)');
      expect(content).toContain('scadenza 2032-06-01');
      expect(content).toContain('priorità alta');
      expect(content).toContain('contributo mensile pianificato 500 €');
      expect(content).toContain('stato: in ritardo');
      expect(content).toContain('allocazione consigliata per questo obiettivo: Obbligazioni 70%, Azioni 30%');
    });

    it('should state the required pace as a projection, with the return it assumes', () => {
      // Arrange
      const bundle = makeBundle({
        goals: {
          enabled: true,
          goalDrivenAllocationEnabled: false,
          items: [
            {
              id: 'goal-2', name: 'Acquisto Casa',
              targetAmount: 100000,
              targetDateIso: '2032-06-01',
              priority: 'alta',
              currentValue: 25000,
              monthlyContribution: 500,
              verdict: 'offTrack',
              assignments: [],
              requiredMonthlyContribution: 780,
              projectedValueAtDeadline: 62000,
              assumedAnnualReturn: 3.85,
            },
          ],
        },
      });

      // Act
      const content = render(bundle);

      // Assert — the number AND the assumption behind it, or the model presents an
      // annuity calculation as a measurement.
      expect(content).toContain('versamento mensile necessario per arrivare al target entro la scadenza: 780 €');
      expect(content).toContain('proiezione, ipotizzando un rendimento nominale del 3,9% annuo');
      expect(content).toContain('valore proiettato alla scadenza al ritmo attuale: 62.000 €');
    });

    it('should say plainly when no further contribution is needed', () => {
      // Arrange — a zero required pace is a statement, not an amount to print as "0 €".
      const bundle = makeBundle({
        goals: {
          enabled: true,
          goalDrivenAllocationEnabled: false,
          items: [
            {
              id: 'goal-3', name: 'Quasi fatto',
              targetAmount: 10000,
              targetDateIso: '2040-01-01',
              priority: 'bassa',
              currentValue: 9500,
              verdict: 'onTrack',
              assignments: [],
              requiredMonthlyContribution: 0,
              assumedAnnualReturn: 4,
            },
          ],
        },
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('nessun altro versamento necessario');
      expect(content).not.toContain('necessario per arrivare al target entro la scadenza: 0 €');
    });

    it('should say an open-ended goal has no target instead of printing a zero', () => {
      // Arrange
      const bundle = makeBundle({
        goals: {
          enabled: true,
          goalDrivenAllocationEnabled: false,
          items: [
            { id: 'goal-4', name: 'Fondo libero', priority: 'bassa', currentValue: 4000, verdict: 'noTarget', assignments: [] },
          ],
        },
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('nessun importo target (obiettivo aperto)');
      expect(content).toContain('nessuna scadenza');
    });

    it('should announce that the allocation targets come from the goals', () => {
      // Arrange
      const bundle = makeBundle({
        goals: {
          enabled: true,
          goalDrivenAllocationEnabled: true,
          items: [
            { id: 'goal-5', name: 'Pensione', priority: 'alta', currentValue: 1000, verdict: 'noDeadline', assignments: [] },
          ],
        },
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('Allocazione goal-driven ATTIVA');
    });
  });

  describe('target allocation source', () => {
    const SNAPSHOT = {
      byAssetClass: { equity: 60000, bonds: 40000 },
      totalNetWorth: 100000,
    } as unknown as NonNullable<AssistantMonthContextBundle['currentSnapshot']>;

    it('should name the manual targets as manual', () => {
      // Arrange
      const bundle = makeBundle({
        currentSnapshot: SNAPSHOT,
        targetAllocation: { equity: { targetPercentage: 60 } },
        targetAllocationSource: 'manual',
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('Origine dei target di allocazione: impostati manualmente');
    });

    it('should warn that goal-derived targets are not the ones in Impostazioni', () => {
      // Arrange
      const bundle = makeBundle({
        currentSnapshot: SNAPSHOT,
        targetAllocation: { equity: { targetPercentage: 30 } },
        targetAllocationSource: 'goal_driven',
      });

      // Act
      const content = render(bundle);

      // Assert
      expect(content).toContain('derivati dagli obiettivi di investimento');
      expect(content).toContain('Non sono i target manuali');
    });
  });

  describe('portfolio block', () => {
    function portfolio() {
      const base = emptyAssistantPortfolioContext();
      return {
        ...base,
        holdings: [
          {
            assetId: 'a1',
            name: 'ETF Mondo',
            ticker: 'MONDO.MI',
            type: 'etf',
            assetClass: 'equity',
            subCategory: 'All World',
            role: 'tradable' as const,
            quantity: 100,
            currency: 'EUR',
            valueEur: 12000,
            costPerUnitEur: 100,
            costBasisEur: 10000,
            gainEur: 2000,
            gainPct: 20,
            owner: 'di Paolo',
            isLiquid: true,
            goalAssignedPct: 50,
            goalFreeEur: 6000,
          },
          {
            assetId: 'a2',
            name: 'Casa',
            type: 'realestate',
            assetClass: 'realestate',
            role: 'excluded' as const,
            quantity: 200000,
            currency: 'EUR',
            valueEur: 200000,
            owner: null,
            isLiquid: false,
          },
        ],
        allocation: {
          baseTotal: 67000,
          tradableTotal: 37000,
          frozenTotal: 30000,
          excludedTotal: 120000,
          byClass: [
            {
              assetClass: 'equity',
              label: 'Azioni',
              value: 42000,
              pct: 62.7,
              tradableValue: 12000,
              frozenValue: 30000,
              subCategories: [{ subCategory: 'All World', value: 12000, pctOfClass: 28.6, pctOfBase: 17.9 }],
            },
          ],
          excluded: [{ name: 'Casa', assetClass: 'realestate', value: 200000 }],
          frozen: [{ name: 'Fondo pensione', assetClass: 'equity', value: 30000 }],
          targets: [
            {
              assetClass: 'equity',
              label: 'Azioni',
              currentPct: 62.7,
              currentValue: 42000,
              targetPct: 51,
              gapPp: 11.7,
              subRows: [{ subCategory: 'All World', currentPctOfClass: 28.6, targetPctOfClass: 100, gapPp: -71.4 }],
            },
            { assetClass: 'cash', label: 'Liquidità', currentPct: 29.9, currentValue: 20000, targetPct: 14.9, fixedAmount: 10000, gapPp: 15, subRows: [] },
          ],
        },
        ledger: {
          rows: [
            { dateIso: '2026-09-10', assetName: 'ETF Mondo', ticker: 'MONDO.MI', type: 'sell' as const, quantity: 20, priceEur: 118, feesEur: 2, feeIsSpendingRow: true, amountEur: 2360, isBaseline: false },
          ],
          totalRows: 5,
          omittedRows: 4,
        },
        dividends: {
          received: [{ paymentDateIso: '2026-09-01', assetName: 'BTP Esempio', grossEur: 75, netEur: 65.63, kind: 'coupon', isProvisional: false }],
          announced: [{ paymentDateIso: '2027-03-01', assetName: 'BTP Esempio', grossEur: 75, netEur: 65.63, kind: 'coupon', isProvisional: true }],
          omittedReceived: 0,
          coupons: [
            { assetName: 'BTP Esempio', annualRatePct: 3, frequency: 'semestrale', maturityIso: '2030-03-01', nextCouponIso: '2027-03-01', indexation: null, nextCouponPerUnitEur: 0.015 },
          ],
        },
        pension: [
          {
            assetId: 'p1', name: 'Fondo pensione', valueEur: 30000, memberName: 'Elena', role: 'frozen' as const,
            byYear: [{ taxYear: 2025, tfr: 1500, voluntary: 500, employer: 0, total: 2000 }],
            paidInPeriod: {
              label: 'ottobre 2026',
              total: 850,
              rows: [
                { source: 'tfr' as const, amount: 700, dateIso: '2026-09-30', recordedIso: '2026-10-13' },
                { source: 'voluntary' as const, amount: 150, dateIso: '2026-09-30', recordedIso: '2026-10-13' },
              ],
            },
          },
        ],
        loans: [{ name: 'Mutuo casa', financedAssetName: 'Casa', residualDebtEur: 80000, interestRatePct: 3.2, lastInstalmentEur: 655, role: 'excluded' as const }],
        family: { ownerAge: 35, members: [{ name: 'Paolo', grossAnnualIncome: 40000 }, { name: 'Elena', grossAnnualIncome: null }] },
      };
    }

    it('should list every instrument with its class, role, PMC, G/P and owner', () => {
      const content = render(makeBundle({ portfolio: portfolio() }));
      expect(content).toContain('--- STRUMENTI IN PORTAFOGLIO OGGI (elenco completo, 2) ---');
      expect(content).toContain(
        'ETF Mondo (MONDO.MI): Azioni › All World | negoziabile | 100 quote | valore 12.000 € | PMC 100,00 € | G/P 2000 € (+20.00%) | intestatario: di Paolo | liquido | obiettivi: assegnato 50,0%, libero 6000 €'
      );
      expect(content).toContain("Casa: Immobili (senza sottocategoria) | escluso dall'Allocazione | 200.000 € | valore 200.000 € | illiquido");
    });

    // Choice u (2026-11-12): an instrument created empty for a plan reaches the model as «0 quote, mai comprato»,
    // in the user content only — the system prompt stays one constant for every user.
    // Seen red with the row count printed in the system.
    it('prints an instrument never bought as «0 quote, mai comprato», the system unchanged', () => {
      const base = portfolio();
      const withRow = { ...base, holdings: [...base.holdings, { assetId: 'a3', name: 'ETF Nuovo', type: 'etf', assetClass: 'equity', role: 'tradable' as const, quantity: 0, currency: 'EUR', valueEur: 0, owner: null, isLiquid: true, neverBought: true as const }] };
      const content = render(makeBundle({ portfolio: withRow }));
      expect(content).toContain('ETF Nuovo: Azioni (senza sottocategoria) | negoziabile | 0 quote, mai comprato | valore 0 €');
      const a = buildMonthAnalysisPrompt(makeBundle({ portfolio: withRow }), '', PREFERENCES);
      const b = buildMonthAnalysisPrompt(makeBundle({ portfolio: base }), '', PREFERENCES);
      expect(a.system).toBe(b.system);
      expect(a.system).toContain('Una riga «0 quote, mai comprato» è uno strumento già creato e mai acquistato: non è posseduto, ma per proporlo usa quel nome.');
    });

    it("should measure the allocation and the targets on the page's base, the fixed cash amount named", () => {
      const content = render(makeBundle({ portfolio: portfolio() }));
      expect(content).toContain("Base: 67.000 € (negoziabile 37.000 €, non negoziabile 30.000 €). Fuori dall'allocazione: 120.000 €.");
      expect(content).toContain('Azioni: 42.000 € (62,7% della base) — di cui non negoziabile 30.000 €');
      expect(content).toContain('Azioni: attuale 62,7% (42.000 €) | target 51,0% | gap +11.7 p.p.');
      expect(content).toContain('Liquidità: attuale 29,9% (20.000 €) | target 10.000 € fisso (14,9% della base oggi) | gap +15.0 p.p.');
      expect(content).toContain('  › All World: attuale 28,6% della classe | target 100,0% della classe | gap -71.4 p.p.');
      expect(content).toContain("Esclusi dall'Allocazione (fuori dalla base, elencati per completezza): Casa 200.000 €.");
    });

    it('should declare what the ledger cap left out and keep received and announced dividends apart', () => {
      const content = render(makeBundle({ portfolio: portfolio() }));
      expect(content).toContain('--- REGISTRO OPERAZIONI (acquisti, vendite, rettifiche; 5 in tutto) ---');
      expect(content).toContain('(le 4 operazioni più vecchie sono omesse; sotto le 1 più recenti)');
      expect(content).toContain('2026-09-10 · vendita · ETF Mondo (MONDO.MI): 20 quote a 118,00 € = 2360 €, commissioni 2,00 € (già fra le spese)');
      expect(content).toContain('--- DIVIDENDI E CEDOLE: REGISTRO (1 incassati, 1 annunciati) ---');
      expect(content).toContain('2026-09-01 · incassato · BTP Esempio: netto 65,63 € (lordo 75,00 €)');
      expect(content).toContain('2027-03-01 · annunciato, non ancora incassato · BTP Esempio: netto 65,63 € (lordo 75,00 €) — provvisorio');
      expect(content).toContain('  BTP Esempio: tasso annuo 3,0% | semestrale | scadenza 2030-03-01 | prossima cedola 2027-03-01 (0,02 € per unità)');
    });

    it('should say a fee is already among the spending only when its row exists', () => {
      const legacy = { dateIso: '2025-05-05', assetName: 'ETF Mondo', type: 'buy' as const, quantity: 10, priceEur: 100, feesEur: 3, feeIsSpendingRow: false, amountEur: 1000, isBaseline: false };
      const content = render(makeBundle({ portfolio: { ...portfolio(), ledger: { rows: [legacy], totalRows: 1, omittedRows: 0 } } }));
      expect(content).toContain('ETF Mondo: 10 quote a 100,00 € = 1000 €, commissioni 3,00 €');
      expect(content).not.toContain('(già fra le spese)');
    });

    it('should describe the pension funds, the loans and the household', () => {
      const content = render(makeBundle({ portfolio: portfolio() }));
      expect(content).toContain('Fondo pensione: valore 30.000 € | di Elena | non negoziabile (conta nella base, i piani non lo toccano)');
      expect(content).toContain('  › 2025: 2000 € (TFR 1500 €, volontari 500 €, datoriali 0 €)');
      // The period's contributions by the month they moved the value, with the rule that reads them.
      expect(content).toContain('  › con effetto sul valore in ottobre 2026: 850 € — TFR 700 € (competenza 2026-09-30, registrato il 2026-10-13), volontario 150 € (competenza 2026-09-30, registrato il 2026-10-13)');
      expect(content).toContain('Un versamento muove il valore del fondo nel mese in cui è registrato, non in quello di competenza');
      expect(content).toContain("Mutuo casa: debito residuo 80.000 € | finanzia: Casa | TAN 3,2% | ultima rata nel periodo 655 € | escluso dall'Allocazione");
      expect(content).toContain("Età dell'intestatario del conto: 35 anni.");
      expect(content).toContain('Membri: Paolo (RAL 40.000 €), Elena.');
    });

    it('should say each register is empty rather than leaving it out', () => {
      const content = render(makeBundle());
      expect(content).toContain('Nessuno strumento registrato.');
      expect(content).toContain("Nessun target di allocazione configurato: è una scelta dell'utente, non un dato mancante.");
      expect(content).toContain('Nessuna operazione registrata');
      expect(content).toContain('Nessun dividendo o cedola nel registro.');
      expect(content).toContain('Nessun fondo pensione registrato.');
      expect(content).toContain('Nessun debito registrato.');
      expect(content).toContain('Nessun membro della famiglia configurato: ogni strumento è in comune.');
    });

    it('should list the instruments assigned to a goal with their quota and euro', () => {
      const content = render(
        makeBundle({
          goals: {
            enabled: true,
            goalDrivenAllocationEnabled: false,
            items: [
              {
                id: 'goal-6', name: 'Figli',
                priority: 'alta',
                currentValue: 6000,
                verdict: 'noDeadline',
                assignments: [{ assetName: 'ETF Mondo', ticker: 'MONDO.MI', quota: '50%', valueEur: 6000 }],
              },
            ],
          },
        })
      );
      expect(content).toContain('  › strumenti assegnati: ETF Mondo (MONDO.MI) 50% = 6000 €');
    });

    it('should close the goals block with what no goal holds, the figure FIRE › Obiettivi prints', () => {
      const content = render(
        makeBundle({
          goals: { enabled: true, goalDrivenAllocationEnabled: false, items: [] },
          portfolio: { ...emptyAssistantPortfolioContext(), goalCoverage: { totalEur: 267000, assignedEur: 11000, freeEur: 256000 } },
        })
      );
      expect(content).toContain('Non assegnato a nessun obiettivo: 256.000 € su 267.000 € di strumenti posseduti (un immobile al netto del mutuo che lo finanzia; mutui e prestiti non sono strumenti); assegnato 11.000 €.');
    });

    // ── A free question with no period: the portfolio of today (2026-10-20) ───────────────
    describe('the portfolio of today for a free question with no context', () => {
    function todayContext() {
      const bundle = makeBundle({ portfolio: portfolio() });
      return { portfolio: bundle.portfolio, goals: null, targetAllocation: bundle.targetAllocation, targetAllocationSource: bundle.targetAllocationSource };
    }

    it('prints the instruments, the allocation and the goals under a header that names what is missing', () => {
      const block = formatTodayContextForPrompt(todayContext());
      expect(block).toContain('=== DATI FINANZIARI: PORTAFOGLIO DI OGGI (nessun periodo selezionato) ===');
      // What the block lacks, said as a fact (2026-11-25): never how the user should ask, which the
      // answer used to repeat to him («nominalo nella domanda»). Seen RED with the old sentence restored.
      expect(block).toContain('niente entrate, uscite, snapshot o confronto tra date in questo blocco');
      expect(block).not.toContain('nominarlo nella domanda');
      expect(block).not.toContain('«cambia»');
      expect(block).not.toContain('selezionarlo');
      expect(block).toContain('--- STRUMENTI IN PORTAFOGLIO OGGI');
      expect(block).toContain('ETF Mondo');
      expect(block).toContain('obiettivi: assegnato 50,0%, libero 6000');
      expect(block).toContain('--- OBIETTIVI DI INVESTIMENTO');
      expect(block).not.toContain('--- CASHFLOW');
      expect(block).not.toContain('PATRIMONIO PER CLASSE A FINE PERIODO');
    });

    it('goes into the chat prompt in place of the «nessun periodo» note, and only when there is no bundle', () => {
      const withToday = buildChatPrompt('Quali strumenti ho liberi?', PREFERENCES, undefined, [], null, todayContext());
      expect(withToday.userContent).toContain('portafoglio di oggi');
      expect(withToday.userContent).toContain('--- STRUMENTI IN PORTAFOGLIO OGGI');
      expect(withToday.userContent).not.toContain('Non è stato selezionato un periodo di riferimento');

      const withNothing = buildChatPrompt('Ciao', PREFERENCES, undefined, [], null, null);
      expect(withNothing.userContent).toContain('Non è stato selezionato un periodo di riferimento');
      expect(withNothing.userContent).not.toContain('STRUMENTI IN PORTAFOGLIO OGGI');

      const withBundle = buildChatPrompt('Come è andato marzo?', PREFERENCES, 'marzo 2026', [], makeBundle({ portfolio: portfolio() }), todayContext());
      expect(withBundle.userContent).toContain('=== DATI FINANZIARI: ');
      expect(withBundle.userContent).not.toContain('PORTAFOGLIO DI OGGI (nessun periodo selezionato)');
      // The system block never moves with the data.
      expect(withToday.system).toBe(withNothing.system);
    });
    });
  });

  describe('system block stability', () => {
    it('should stay byte-identical across bundles, carrying no per-request data', () => {
      // Arrange
      const lean = makeBundle();
      const rich = makeBundle({ expensesByCategory: [CASA] });

      // Act
      const first = buildMonthAnalysisPrompt(lean, 'Come è andato il mese?', PREFERENCES).system;
      const second = buildMonthAnalysisPrompt(rich, 'Dettagliami le sottocategorie di Casa', {
        ...PREFERENCES,
        responseStyle: 'deep',
      }).system;

      // Assert — the system block is sent as a cacheable prefix; interpolating request
      // data into it would silently break the prefix match.
      expect(first).toBe(second);
    });
  });
});

describe('the CASHFLOW 12 MESI block in every mode of the Assistente (since 2026-11-07)', () => {
  const BLOCK = '--- CASHFLOW 12 MESI (x) ---\nX';
  // The note the owner approved on 2026-11-07, verbatim.
  const NOTE = "Il blocco CASHFLOW 12 MESI qui sotto è il cashflow di tutta la storia registrata fino a oggi, qualunque sia il periodo in esame: le cifre di un periodo vengono dai blocchi del periodo; usalo per l'andamento recente, la capacità di risparmio e la sua stabilità, gli impegni ricorrenti e i conti.";
  const builders = [
    ['month', buildMonthAnalysisPrompt],
    ['year', buildYearAnalysisPrompt],
    ['ytd', buildYtdAnalysisPrompt],
    ['history', buildHistoryAnalysisPrompt],
  ] as const;

  it.each(builders)('%s: the note and the block sit after the numeric block and before the question', (_, build) => {
    const bundle = makeBundle();
    const withBlock = build(bundle, 'Come va?', PREFERENCES, [], BLOCK).userContent;
    const numeric = withBlock.indexOf('--- CASHFLOW ---');
    const note = withBlock.indexOf(NOTE);
    const block = withBlock.indexOf(BLOCK);
    const question = withBlock.indexOf("Domanda dell'utente: Come va?");
    expect(numeric).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(numeric);
    expect(block).toBe(note + NOTE.length + 1);
    expect(question).toBeGreaterThan(block);
    expect(withBlock).toContain(`${BLOCK}\n\nDomanda dell'utente: Come va?`);
  });

  it.each(builders)('%s: without the block the user turn is today\'s, and system is the same with or without', (_, build) => {
    const bundle = makeBundle();
    const without = build(bundle, 'Come va?', PREFERENCES, []);
    const withBlock = build(bundle, 'Come va?', PREFERENCES, [], BLOCK);
    expect(without.userContent).not.toContain('CASHFLOW 12 MESI');
    // The block adds exactly its three lines (note, block, blank) and changes nothing else.
    expect(withBlock.userContent.replace(`${NOTE}\n${BLOCK}\n\n`, '')).toBe(without.userContent);
    expect(withBlock.system).toBe(without.system);
    expect(withBlock.system).not.toContain('CASHFLOW 12 MESI');
  });

  function todayContext() {
    const bundle = makeBundle();
    return { portfolio: bundle.portfolio, goals: null, targetAllocation: bundle.targetAllocation, targetAllocationSource: bundle.targetAllocationSource };
  }

  it.each([
    ['a period attached', () => buildChatPrompt('x', PREFERENCES, 'marzo 2026', [], makeBundle(), null, BLOCK), () => buildChatPrompt('x', PREFERENCES, 'marzo 2026', [], makeBundle(), null)],
    ['the portfolio of today', () => buildChatPrompt('x', PREFERENCES, undefined, [], null, todayContext(), BLOCK), () => buildChatPrompt('x', PREFERENCES, undefined, [], null, todayContext())],
    ['no data at all', () => buildChatPrompt('x', PREFERENCES, undefined, [], null, null, BLOCK), () => buildChatPrompt('x', PREFERENCES, undefined, [], null, null)],
  ])('the chat with %s carries it right before the request, and system does not move', (_, withIt, withoutIt) => {
    const withBlock = withIt();
    const without = withoutIt();
    expect(withBlock.userContent).toContain(`\n\n${NOTE}\n${BLOCK}\n\nRichiesta utente: x`);
    expect(withBlock.userContent.replace(`\n${NOTE}\n${BLOCK}\n`, '')).toBe(without.userContent);
    expect(without.userContent).not.toContain('CASHFLOW 12 MESI');
    expect(withBlock.system).toBe(without.system);
  });

  it('formatCashflowBlockSection prints the note, the block and a blank line, or nothing', () => {
    expect(formatCashflowBlockSection(BLOCK)).toEqual([NOTE, BLOCK, '']);
    expect(formatCashflowBlockSection(null)).toEqual([]);
    expect(formatCashflowBlockSection('')).toEqual([]);
  });
});

describe('the Registra prompt (2026-11)', () => {
  const REGISTER_BLOCK = '--- REGISTRA ---\nOggi: domenica 1 novembre 2026 (2026-11-01)\n[cat-cibo] Cibo';
  const CASHFLOW_BLOCK = '--- CASHFLOW 12 MESI (x) ---\nX';
  const NOTE_START = 'Il blocco CASHFLOW 12 MESI qui sotto è il cashflow di tutta la storia registrata fino a oggi';

  it('puts the proposal contract in the system, after the shared core, and nowhere else', () => {
    const { system } = buildRegisterPrompt('ho fatto spesa per 103 euro', PREFERENCES, [], REGISTER_BLOCK, null);
    expect(system).toBe(`${ASSISTANT_SYSTEM_CORE}\n\n${REGISTER_CONTRACT}`);
    expect(REGISTER_CONTRACT).toContain('```expense-proposal'.slice(3));
    expect(REGISTER_CONTRACT).toContain('al massimo 5 per messaggio');
    // The owner's tour, 2026-11-11: the answer stays short whatever the style preference says, with no
    // titled sections under the cards and no mention of the rows' cut.
    expect(REGISTER_CONTRACT).toContain('qualunque sia lo stile di risposta');
    expect(REGISTER_CONTRACT).toContain('Niente sezioni con titolo');
    expect(REGISTER_CONTRACT).toContain('Non dire quante righe hai letto');
  });

  it('carries the four kinds, when to ask, the questions and the chain of caps, verbatim (2026-11)', () => {
    const sentences = [
      'TIPI DI RIGA: "kind" è "expense" (type "fixed" o "variable"), "income" (type "income"), "transfer" (type "transfer") o "debt" (type "debt").',
      'Un trasferimento sposta soldi fra due conti, o fra un conto e un immobile: scrivi "fromAccount" e "toAccount" con l\'[id] dei blocchi CONTI o IMMOBILI (o il nome come lo dice l\'utente), mai "accountId"; un immobile sta su un lato solo. Se l\'utente non nomina uno dei due lati, chiedilo.',
      'Una rata di mutuo o di prestito ha kind "debt" e "loanName" con l\'[id] o il nome del blocco PRESTITI; con due o più prestiti e un nome che non li distingue, chiedi «Quale prestito?» con una domanda "loan:"; una rata che non ripaga un prestito del blocco si propone senza "loanName"; "payoff": true solo per un\'estinzione anticipata.',
      `Le entrate e i trasferimenti non si ripetono: una serie ("recurring") è solo per spese e rate, al più ${MAX_RECURRENCE_OCCURRENCES.monthly} occorrenze mensili o ${MAX_RECURRENCE_OCCURRENCES.yearly} annuali; un'estinzione anticipata è una riga sola.`,
      'Una commissione si scrive "fee": { "amount" } sulla riga che la paga; la sua categoria è quella di Impostazioni: non sceglierla.',
      'Proponi una categoria nuova SOLO se nessuna esistente si adatta, e preferisci una sottocategoria sotto una categoria esistente; segui il modo di categorizzare dell\'utente (le righe recenti, le regole in memoria). Si scrive "newSubCategory": { "categoryId", "name" } con "categoryId" uguale a quello della riga, oppure "newCategory": { "name", "type" } senza "categoryId"; mai una categoria nuova di tipo "transfer".',
      'L\'ordine è: ciò che l\'utente dice in questo messaggio, poi le regole di categorizzazione in memoria, poi lo storico delle righe recenti.',
      'QUANDO CHIEDERE: chiedi il conto solo se l\'utente non l\'ha nominato E (non c\'è un conto predefinito per quel tipo O il conto più usato della categoria copre meno dell\'80% delle sue righe). Chiedi l\'intestatario solo se la Divisione è attiva e almeno il 50% delle righe della categoria è personale. Applica «fuori budget» se l\'utente lo dice o se almeno il 50% delle righe della categoria lo è: non chiederlo mai. Chiedi il centro di costo solo se i centri sono attivi e almeno una riga della categoria negli ultimi 12 mesi sta in un centro. Le percentuali sono quelle del blocco PATTERN.',
      'Se l\'importo arriva senza oggetto, chiedi «Di cosa si tratta?» con 2-4 categorie probabili e "allowOther": true. Non chiedere mai ciò che il messaggio, la memoria o le righe recenti già dicono.',
      'DOMANDE: una domanda è un blocco ```assistant-question con UN oggetto JSON { "id", "kind": "single", "text", "options": [{ "value", "label" }], "allowOther" }, alla fine del messaggio. L\'"id" di una domanda su conti, centri, intestatari, prestiti o categorie comincia con "account:", "center:", "member:", "loan:" o "category:" ("account:from" e "account:to" per i due lati di un trasferimento); i "value" sono gli [id] dei blocchi (per una categoria l\'[id] della sottocategoria, o della categoria se non ne ha). Su conti, centri, intestatari e prestiti al più 3 opzioni, le più probabili secondo il blocco PATTERN, e "allowOther": true; non scrivere mai un\'opzione «Altro»: la riga «Altro…» è della card.',
      `Al più ${EXPENSE_PROPOSALS_MAX_PER_MESSAGE} blocchi \`\`\`expense-proposal o al più ${ASSISTANT_QUESTION_MAX_PER_MESSAGE} blocchi \`\`\`assistant-question per messaggio, mai i due tipi nello stesso messaggio, mai un \`\`\`goal-proposal in questa modalità: prima chiedi, poi proponi.`,
      'La risposta dell\'utente arriva come un messaggio con una riga per domanda, «{domanda} → {scelta} [id]»: usa l\'[id] fra parentesi quadre e riproponi la riga intera, senza chiedere di nuovo ciò che è stato risposto.',
      'Se il blocco memoria dice «memoria disattivata» e l\'utente detta una regola, rispondi: «non posso ricordarlo: la memoria è spenta ("Apprendimento automatico" nelle Preferenze dell\'Assistente)».',
    ];
    for (const sentence of sentences) expect(REGISTER_CONTRACT).toContain(sentence);
    // A real doubt is a question block, never a prose question under the cards (the owner’s tour, 2026-11-11).
    expect(REGISTER_CONTRACT).not.toContain('come domanda breve');
    expect(REGISTER_CONTRACT).not.toContain('non proponibile');
    // A doubt on the property is a question too: on the owner's tour a deposit «sulla casa» became a spending
    // row with a prose question under it (2026-11-11).
    // The rules of the first contract defer to QUANDO CHIEDERE and to the answers' [id] (2026-11-11, the retirement of
    // the Registra details): «fuori budget only when the user says it», «the default account, unless the user names
    // another» and «a centre or a member only when the user names it» contradicted the thresholds and the questions
    // printed below them, and the opening still described spending and income alone.
    expect(REGISTER_CONTRACT).toContain("In questa modalità l'utente ti dice cosa ha speso, incassato, spostato fra i suoi conti o pagato a rata e tu gli proponi la riga da registrare nel Cashflow.");
    expect(REGISTER_CONTRACT).toContain('- Il conto è quello che l\'utente nomina o sceglie rispondendo a una domanda "account:" (il suo [id]); se non lo nomina e QUANDO CHIEDERE non dice di chiederlo, è il predefinito del tipo (addebito per una spesa e per una rata, accredito per un\'entrata): ometti `accountId`.');
    expect(REGISTER_CONTRACT).toContain('- `costCenterId` e `memberId` solo se il loro blocco è attivo e l\'utente li nomina o li sceglie rispondendo a una domanda; `excludeFromBudget` su una spesa o una rata quando QUANDO CHIEDERE lo applica.');
    expect(REGISTER_CONTRACT).not.toContain('solo su una spesa che l\'utente dice fuori dal budget');
    expect(REGISTER_CONTRACT).not.toContain('salvo che l\'utente ne nomini un altro');
    expect(REGISTER_CONTRACT).not.toContain('cosa ha speso o incassato');
    expect(REGISTER_CONTRACT).toContain('Un dubbio vero su categoria, conto, immobile, intestatario o prestito si chiede con un blocco ```assistant-question in un messaggio SENZA proposte, mai con una domanda in prosa sotto le card.');
  });

  it('stays byte-identical across users, rows and memory, and says when memory is off', () => {
    const rule = { id: 'm1', userId: 'u1', category: 'preference' as const, text: 'Categorizzazione: palestra → Salute', createdAt: new Date(), updatedAt: new Date(), status: 'active' as const };
    const a = buildRegisterPrompt('ho speso 5 euro', { ...PREFERENCES, memoryEnabled: true }, [rule], REGISTER_BLOCK, null);
    const b = buildRegisterPrompt('stipendio', { ...PREFERENCES, memoryEnabled: false }, [], '--- REGISTRA ---\n[cat-x] X', CASHFLOW_BLOCK);
    expect(a.system).toBe(b.system);
    expect(a.userContent).toContain('Categorizzazione:');
    expect(b.userContent).toContain('Memoria: memoria disattivata.');
    const off = buildRegisterPrompt('ho speso 5 euro', { ...PREFERENCES, memoryEnabled: false }, [rule], REGISTER_BLOCK, null);
    expect(off.userContent).toContain('memoria disattivata');
    expect(off.userContent).not.toContain('Categorizzazione:');
    expect(off.userContent).not.toContain(REGISTER_MEMORY_EMPTY_LINE);
  });

  it('says the memory is on when it is on and still empty, and only then (2026-11-11)', () => {
    const archived = { id: 'm2', userId: 'u1', category: 'preference' as const, text: 'Categorizzazione: palestra → Salute', createdAt: new Date(), updatedAt: new Date(), status: 'archived' as const };
    const empty = buildRegisterPrompt('la palestra la metto sempre in Salute', { ...PREFERENCES, memoryEnabled: true }, [archived], REGISTER_BLOCK, null);
    expect(empty.userContent).toContain('Memoria: attiva, nessuna regola salvata.');
    expect(empty.userContent).not.toContain('memoria disattivata');
    const full = buildRegisterPrompt('ho speso 5 euro', { ...PREFERENCES, memoryEnabled: true }, [{ ...archived, status: 'active' as const }], REGISTER_BLOCK, null);
    expect(full.userContent).not.toContain(REGISTER_MEMORY_EMPTY_LINE);
    expect(empty.system).toBe(full.system);
  });

  it('prints a categorisation rule in every analysis mode and in the chat too (2026-11-01: rules in every prompt)', () => {
    const bundle = makeBundle();
    const rule = { id: 'm1', userId: 'u1', category: 'preference' as const, text: 'Categorizzazione: palestra → Salute', createdAt: new Date(), updatedAt: new Date(), status: 'active' as const };
    const on = { ...PREFERENCES, memoryEnabled: true };
    for (const build of [buildMonthAnalysisPrompt, buildYearAnalysisPrompt, buildYtdAnalysisPrompt, buildHistoryAnalysisPrompt]) {
      expect(build(bundle, 'Come va?', on, [rule]).userContent).toContain('Categorizzazione: palestra → Salute');
    }
    expect(buildChatPrompt('Come va?', on, 'marzo 2025', [rule], bundle).userContent).toContain('Categorizzazione: palestra → Salute');
  });

  it('leaves the shared core and every other mode’s system without the protocol', () => {
    const bundle = makeBundle();
    expect(ASSISTANT_SYSTEM_CORE).not.toContain('expense-proposal');
    expect(buildChatPrompt('Come va?', PREFERENCES, 'marzo 2025', [], bundle).system).not.toContain('expense-proposal');
    expect(buildChatPrompt('Come va?', PREFERENCES, undefined, []).system).not.toContain('expense-proposal');
    for (const build of [buildMonthAnalysisPrompt, buildYearAnalysisPrompt, buildYtdAnalysisPrompt, buildHistoryAnalysisPrompt]) {
      expect(build(bundle, 'Come va?', PREFERENCES, []).system).not.toContain('expense-proposal');
    }
  });

  it('keeps the system byte-identical across users, days and blocks: the data is in the user turn', () => {
    const a = buildRegisterPrompt('ho speso 5 euro', PREFERENCES, [], REGISTER_BLOCK, null);
    const b = buildRegisterPrompt('stipendio di 2000 ieri', { ...PREFERENCES, responseStyle: 'deep' }, [], '--- REGISTRA ---\nOggi: lunedì 2 novembre 2026 (2026-11-02)\n[cat-altro] Altro', CASHFLOW_BLOCK);
    expect(a.system).toBe(b.system);
    expect(a.system).not.toContain('2026-11-01');
    // No date at all, in either form: one read off the clock when the module loads would be the
    // same in `a` and `b`, and would not be the fixture's day (2026-11-11).
    expect(a.system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(a.system).not.toMatch(/\d{1,2} (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre) \d{4}/);
    expect(a.system).not.toContain('cat-cibo');
    expect(a.userContent).toContain(REGISTER_BLOCK);
  });

  it('prints the cashflow block under its note, between the register block and the request', () => {
    const { userContent } = buildRegisterPrompt('ho speso 5 euro', PREFERENCES, [], REGISTER_BLOCK, CASHFLOW_BLOCK);
    const register = userContent.indexOf(REGISTER_BLOCK);
    const note = userContent.indexOf(NOTE_START);
    const block = userContent.indexOf(CASHFLOW_BLOCK);
    const request = userContent.indexOf('Richiesta utente: ho speso 5 euro');
    expect(register).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(register);
    expect(block).toBeGreaterThan(note);
    expect(request).toBeGreaterThan(block);
    expect(userContent.endsWith('Richiesta utente: ho speso 5 euro')).toBe(true);
  });

  it('prints neither the note nor the block without one', () => {
    const { userContent } = buildRegisterPrompt('ho speso 5 euro', PREFERENCES, [], REGISTER_BLOCK, null);
    expect(userContent).not.toContain('CASHFLOW 12 MESI');
    expect(userContent).toContain(`${REGISTER_BLOCK}\n\nRichiesta utente: ho speso 5 euro`);
  });
});

// The change of the period, split as Storico's Driver splits it (owner, 2026-11-16: the assistant
// saw the contributions but could not say how much of the month was market).
describe('the split of the change in the analysis data block', () => {
  const DRIVERS = {
    from: { year: 2026, month: 9 }, to: { year: 2026, month: 10 },
    total: 1500, savings: 900, market: -1000, taxes: 0, debtRepaid: 0, pensionContributions: 1600,
    other: 0, otherPension: 0, otherHoldings: 0, otherAccounts: 0, isMarketMeasured: true,
  };

  it('should print the six parts after the net worth, with the rule to read the market from them', () => {
    const content = render(makeBundle({ netWorth: { start: 300_000, end: 301_500, delta: 1500, deltaPct: 0.5 }, netWorthDrivers: DRIVERS }));
    expect(content).toContain('--- DA DOVE VIENE LA VARIAZIONE (il calcolo del Driver di Storico: le parti sommano alla variazione) ---');
    expect(content).toContain('Risparmio dal cashflow: +900 €');
    expect(content).toContain('Mercato: −1000 € (misurato strumento per strumento)');
    expect(content).toContain('Versati nei fondi pensione: +1600 €');
    expect(content).toContain('Usa queste parti per dire quanto viene dal mercato: non stimarlo per differenza.');
    expect(content.indexOf('--- DA DOVE VIENE LA VARIAZIONE')).toBeGreaterThan(content.indexOf('--- PATRIMONIO ---'));
  });

  it('should name the rest by cause, and an estimated market as estimated', () => {
    const content = render(makeBundle({ netWorthDrivers: { ...DRIVERS, other: 300, otherPension: 200, otherHoldings: 0, otherAccounts: 100, isMarketMeasured: false } }));
    expect(content).toContain('Mercato: −1000 € (stimato: non ogni mese del periodo è misurato strumento per strumento)');
    expect(content).toContain('Altre variazioni: +300 € (fondi pensione +200 €, conti +100 €)');
  });

  it('should print nothing without a split', () => {
    expect(render(makeBundle({ netWorthDrivers: null }))).not.toContain('DA DOVE VIENE LA VARIAZIONE');
  });
});

describe('the analysis data block — income subcategories, the funds by class, the web rule (2026-11-16)', () => {
  it('should print the income subcategories under their category', () => {
    const content = render(makeBundle({ incomeByCategory: [{ categoryName: 'Rimborsi', total: 700, transactionCount: 4, subCategories: [
      { subCategoryName: 'Sanitari', total: 500, transactionCount: 2 },
      { subCategoryName: 'Senza sottocategoria', total: 200, transactionCount: 2 },
    ] }] }));
    expect(content).toContain('Rimborsi: 700 € (4 transazioni)\n  › Sanitari: 500 € (2 transazioni)\n  › Senza sottocategoria: 200 € (2 transazioni)');
  });

  it('should name, in a class, the funds change and the contributions inside it', () => {
    const content = render(makeBundle({ allocationChanges: [
      { assetClass: 'bonds', previousValue: 30_000, currentValue: 31_300, absoluteChange: 1300, percentagePointsChange: 0.2, pension: { change: 1500, paidIn: 1100 } },
      { assetClass: 'crypto', previousValue: 5_000, currentValue: 4_000, absoluteChange: -1000, percentagePointsChange: -0.4, pension: null },
    ] }));
    expect(content).toContain('  › di cui fondi pensione: Δ +1500 €, di cui versati +1100 € (ripartiti con la composizione del fondo); il resto della classe: Δ −200 €');
    expect(content.match(/di cui fondi pensione/g)).toHaveLength(1);
  });

  it('should never let the model call a search it ran unavailable', () => {
    const { system } = buildMonthAnalysisPrompt(makeBundle(), 'Come va?', PREFERENCES);
    expect(system).toContain("Se la ricerca non trova nulla di datato, scrivi che non l'ha trovato: non scrivere mai che la ricerca web non era disponibile quando l'hai usata.");
  });
});

// ── One form for every answer (2026-11-25) ──────────────────────────────────────────────
// Seen RED: the verdict-first test with the core's old «non calcolarli» line restored; the
// same-string test with today's date interpolated into the system; the period-line test with
// one line reused for every mode; the Registra-and-emails test with the form put back in the
// core; the web-off test with one old «Non cercare…» sentence kept.
describe('the answer contract: one form for every mode but Registra', () => {
  const REGISTER_BLOCK = '--- REGISTRA ---\nOggi: domenica 1 novembre 2026 (2026-11-01)';
  const bundle = makeBundle();
  const systems = {
    chat: buildChatPrompt('Quanto ho speso?', PREFERENCES, undefined).system,
    month_analysis: buildMonthAnalysisPrompt(bundle, 'Come va?', PREFERENCES).system,
    year_analysis: buildYearAnalysisPrompt(bundle, 'Come va?', PREFERENCES).system,
    ytd_analysis: buildYtdAnalysisPrompt(bundle, 'Come va?', PREFERENCES).system,
    history_analysis: buildHistoryAnalysisPrompt(bundle, 'Come va?', PREFERENCES).system,
  };
  const registerSystem = buildRegisterPrompt('ho speso 5 euro', PREFERENCES, [], REGISTER_BLOCK, null).system;
  const emailSystem = `${ASSISTANT_SYSTEM_CORE}\n\n${buildEmailPeriodicFormatContract('monthly')}`;

  it('asks every mode but Registra for the verdict first, lets it compute and marks an unconfirmed threshold', () => {
    for (const system of Object.values(systems)) {
      expect(system).toContain('La prima riga è il verdetto');
      expect(system).toContain('il conto è lavoro tuo');
      expect(system).toContain('da verificare');
      // The owner, phase F of 2026-11-25: «Ipotesi:», «Mensa:» and the table's totals were bold too.
      expect(system).toContain('Il grassetto va SOLO sulla cifra o sul sì/no della prima riga');
      for (const old of ['non calcolarli', 'ESCLUSIVAMENTE', 'In sintesi', 'Trend storici principali']) {
        expect(system).not.toContain(old);
      }
    }
  });

  it('gives a year ONE comparison section, a month two (owner, phase F, 2026-11-28)', () => {
    const yearly = buildEmailPeriodicFormatContract('yearly');
    const monthly = buildEmailPeriodicFormatContract('monthly');
    expect(yearly).toContain("3. **Rispetto all'anno precedente**");
    expect(yearly).not.toContain("Confronto con l'anno precedente");
    expect(yearly).not.toContain('Rispetto al periodo precedente');
    expect(yearly).toContain('4. **Entrate e spese');
    expect(yearly).toContain('5. **Azioni o attenzioni**');
    expect(monthly).toContain('3. **Rispetto al periodo precedente**');
    expect(monthly).toContain("4. **Confronto con l'anno precedente**");
    expect(monthly).toContain('6. **Azioni o attenzioni**');
  });

  it('tells the emails they are emails: no offer to act, no name of the data blocks, names never shortened', () => {
    for (const contract of [buildEmailPeriodicFormatContract('monthly'), buildEmailPeriodicFormatContract('yearly')]) {
      expect(contract).toContain("È un'email: chi legge non può risponderti.");
      expect(contract).toContain('Non offrire di fare qualcosa');
      expect(contract).toContain('Non nominare i blocchi di dati');
      expect(contract).toContain('con il nome esatto dei dati, senza accorciarlo');
    }
  });

  it('tells every mode but Registra of the tools on the data; Registra and the emails have none (2026-11-26)', () => {
    for (const system of Object.values(systems)) expect(system).toContain('# Gli strumenti sui tuoi dati');
    expect(registerSystem).not.toContain('# Gli strumenti sui tuoi dati');
    expect(emailSystem).not.toContain('# Gli strumenti sui tuoi dati');
  });

  it('is the same string twice, for two users on two days', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));
      const first = buildAssistantSystem('chat');
      const memory = [{ id: 'm1', userId: 'u2', category: 'preference' as const, text: 'Persona A', createdAt: new Date(), updatedAt: new Date(), status: 'active' as const }];
      vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
      const second = buildChatPrompt('Altro?', { ...PREFERENCES, memoryEnabled: true, responseStyle: 'deep' }, 'ottobre 2026', memory).system;
      expect(buildAssistantSystem('chat')).toBe(first);
      expect(second).toBe(first);
      expect(buildAssistantSystem('month_analysis')).toBe(buildAssistantSystem('month_analysis'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('differs between a period mode and the chat by exactly the period line', () => {
    const lines = new Set<string>();
    for (const mode of ['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis'] as const) {
      const system = systems[mode];
      expect(system.startsWith(`${systems.chat}\n\n`)).toBe(true);
      const line = system.slice(systems.chat.length + 2);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain('\n');
      lines.add(line);
    }
    expect(lines.size).toBe(4);
  });

  it('leaves the form out of Registra and the emails, which still read the shared core', () => {
    for (const system of [registerSystem, emailSystem]) {
      expect(system).toContain('il conto è lavoro tuo');
      for (const form of ['Forma della risposta', 'assistant-followups', 'Una sola, come scheda']) {
        expect(system).not.toContain(form);
      }
    }
  });

  it('says only that the web is off when the macro preference is, in every period mode', () => {
    const contents = [
      buildMonthAnalysisPrompt(bundle, 'Come va?', PREFERENCES).userContent,
      buildYearAnalysisPrompt(bundle, 'Come va?', PREFERENCES).userContent,
      buildYtdAnalysisPrompt(bundle, 'Come va?', PREFERENCES).userContent,
      buildHistoryAnalysisPrompt(bundle, 'Come va?', PREFERENCES).userContent,
    ];
    for (const userContent of contents) {
      expect(userContent).toContain(WEB_OFF_LINE);
      expect(userContent).not.toContain('Non cercare');
    }
  });
});
