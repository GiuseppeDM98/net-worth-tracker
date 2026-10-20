/**
 * Tests for the numeric data block the assistant prompt builders emit.
 *
 * Everything here goes through `buildMonthAnalysisPrompt(...).userContent` — the path a
 * real request takes — rather than through `formatBundleForPrompt` directly. (The formatter
 * is exported, but only because the periodic emails send the same block; asserting against
 * the real entry point still reads just as well and covers the wiring too.)
 */

import { describe, expect, it } from 'vitest';
import { buildChatPrompt, buildMonthAnalysisPrompt, formatTodayContextForPrompt } from '@/lib/server/assistant/prompts';
import { AssistantMonthContextBundle, AssistantPreferences } from '@/types/assistant';
import { emptyAssistantPortfolioContext } from '@/lib/utils/assistantPortfolioContext';

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
            owner: 'di Giuseppe',
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
            { dateIso: '2026-09-10', assetName: 'ETF Mondo', ticker: 'MONDO.MI', type: 'sell' as const, quantity: 20, priceEur: 118, feesEur: 2, amountEur: 2360, isBaseline: false },
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
          { assetId: 'p1', name: 'Fondo pensione', valueEur: 30000, memberName: 'Marcella', role: 'frozen' as const, byYear: [{ taxYear: 2025, tfr: 1500, voluntary: 500, employer: 0, total: 2000 }] },
        ],
        loans: [{ name: 'Mutuo casa', financedAssetName: 'Casa', residualDebtEur: 80000, interestRatePct: 3.2, lastInstalmentEur: 655, role: 'excluded' as const }],
        family: { ownerAge: 35, members: [{ name: 'Giuseppe', grossAnnualIncome: 40000 }, { name: 'Marcella', grossAnnualIncome: null }] },
      };
    }

    it('should list every instrument with its class, role, PMC, G/P and owner', () => {
      const content = render(makeBundle({ portfolio: portfolio() }));
      expect(content).toContain('--- STRUMENTI IN PORTAFOGLIO OGGI (elenco completo, 2) ---');
      expect(content).toContain(
        'ETF Mondo (MONDO.MI): Azioni › All World | negoziabile | 100 quote | valore 12.000 € | PMC 100,00 € | G/P 2000 € (+20.00%) | intestatario: di Giuseppe | liquido | obiettivi: assegnato 50,0%, libero 6000 €'
      );
      expect(content).toContain("Casa: Immobili (senza sottocategoria) | escluso dall'Allocazione | 200.000 € | valore 200.000 € | illiquido");
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
      expect(content).toContain('2026-09-10 · vendita · ETF Mondo (MONDO.MI): 20 quote a 118,00 € = 2360 €, commissioni 2,00 €');
      expect(content).toContain('--- DIVIDENDI E CEDOLE: REGISTRO (1 incassati, 1 annunciati) ---');
      expect(content).toContain('2026-09-01 · incassato · BTP Esempio: netto 65,63 € (lordo 75,00 €)');
      expect(content).toContain('2027-03-01 · annunciato, non ancora incassato · BTP Esempio: netto 65,63 € (lordo 75,00 €) — provvisorio');
      expect(content).toContain('  BTP Esempio: tasso annuo 3,0% | semestrale | scadenza 2030-03-01 | prossima cedola 2027-03-01 (0,02 € per unità)');
    });

    it('should describe the pension funds, the loans and the household', () => {
      const content = render(makeBundle({ portfolio: portfolio() }));
      expect(content).toContain('Fondo pensione: valore 30.000 € | di Marcella | non negoziabile (conta nella base, i piani non lo toccano)');
      expect(content).toContain('  › 2025: 2000 € (TFR 1500 €, volontari 500 €, datoriali 0 €)');
      expect(content).toContain("Mutuo casa: debito residuo 80.000 € | finanzia: Casa | TAN 3,2% | ultima rata nel periodo 655 € | escluso dall'Allocazione");
      expect(content).toContain("Età dell'intestatario del conto: 35 anni.");
      expect(content).toContain('Membri: Giuseppe (RAL 40.000 €), Marcella.');
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
      expect(block).toContain('niente entrate, uscite, snapshot o confronto tra date');
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
