/**
 * Tests for lib/utils/realEstateOperationPlan.ts — the arithmetic of a property's purchase or sale and
 * the plan of writes each event makes (owner, 2026-10-21). Figures are invented and round.
 */

import { describe, expect, it } from 'vitest';

import {
  addMonthsIso,
  buildRealEstatePlan,
  depositsReceivedFrom,
  figuresOf,
  frenchInstalment,
  futureSeriesAfter,
  isProposedToStop,
  isValidIso,
  suggestCategory,
  type PlanStep,
} from '@/lib/utils/realEstateOperationPlan';
import { initialAnswers } from '@/lib/utils/realEstateOperationDraft';
import type { RealEstateOperationAnswers } from '@/types/realEstateOperation';
import { CATEGORIES, EXPENSES, makeContext } from './fixtures/realEstateOperation';

const context = makeContext();
const answersWith = (patch: Partial<RealEstateOperationAnswers>): RealEstateOperationAnswers => ({ ...initialAnswers(context), ...patch });
const kinds = (steps: PlanStep[]) => steps.map((step) => (step.kind === 'row' ? `row:${step.label}` : step.kind));

describe('frenchInstalment', () => {
  it('should give the constant instalment of an amortised loan', () => {
    expect(frenchInstalment(100000, 3, 300)).toBe(474.21);
  });

  it('should divide evenly at 0%, and give nothing without principal or months', () => {
    expect(frenchInstalment(12000, 0, 12)).toBe(1000);
    expect(frenchInstalment(0, 3, 12)).toBe(0);
    expect(frenchInstalment(1000, 3, 0)).toBe(0);
  });
});

describe('dates', () => {
  it('should clamp a month-end to the target month', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-11-15', 2)).toBe('2027-01-15');
  });

  it('should accept only real calendar days', () => {
    expect(isValidIso('2026-02-28')).toBe(true);
    expect(isValidIso('2026-02-30')).toBe(false);
    expect(isValidIso('')).toBe(false);
  });
});

describe('what the account already holds', () => {
  it('should sum the deposits received as the transfers out of the property', () => {
    expect(depositsReceivedFrom('house', EXPENSES)).toBe(15000);
    expect(depositsReceivedFrom('acc', EXPENSES)).toBe(0);
  });

  it('should list the series after a day, oldest first, and propose only the ones of the house and its loans', () => {
    const series = futureSeriesAfter('2026-06-30', EXPENSES, new Set(['loan']), 'house');
    // Two series starting the same day are ordered by their category: «Casa › …» before «Mutuo».
    expect(series.map((entry) => [entry.seriesId, entry.rows.length])).toEqual([
      ['series-gym', 2],
      ['series-car', 1],
      ['series-life', 2],
      ['series-policy', 1],
      ['series-mortgage', 2],
    ]);
    // A personal life policy and a car loan are a policy and a debt too: neither is the house's (owner, 2026-10-21 tour).
    expect(series.filter(isProposedToStop).map((entry) => entry.seriesId)).toEqual(['series-policy', 'series-mortgage']);
  });

  it('should link a series to the house only through its own rows, never another house', () => {
    expect(futureSeriesAfter('2026-06-30', EXPENSES, new Set(), 'house').filter(isProposedToStop).map((entry) => entry.seriesId)).toEqual(['series-policy']);
    expect(futureSeriesAfter('2026-06-30', EXPENSES, new Set(), 'other-house').filter(isProposedToStop)).toEqual([]);
    expect(futureSeriesAfter('2026-06-30', EXPENSES, new Set()).filter(isProposedToStop)).toEqual([]);
  });
});

describe('suggestCategory', () => {
  it('should start on the saved default when it still exists with an allowed type', () => {
    expect(suggestCategory('notary', CATEGORIES, { notary: { categoryId: 'tasse' } })).toEqual({ categoryId: 'tasse' });
  });

  it('should drop a default of the wrong type and fall back to the name match, a subcategory first', () => {
    expect(suggestCategory('notary', CATEGORIES, { notary: { categoryId: 'mutuo' } })).toEqual({ categoryId: 'casa', subCategoryId: 'casa-notaio' });
    expect(suggestCategory('homeInsurance', CATEGORIES, undefined)).toEqual({ categoryId: 'casa', subCategoryId: 'casa-assicurazione-casa' });
    expect(suggestCategory('lifeInsurance', CATEGORIES, undefined)).toEqual({ categoryId: 'assic', subCategoryId: 'assic-vita' });
  });

  it('should match a broad word on a category before a subcategory (owner, 2026-10-21 tour)', () => {
    // «casa» used to pick «Casa › Assicurazione casa» for the sale's certificates.
    expect(suggestCategory('saleCertificates', CATEGORIES, undefined)).toEqual({ categoryId: 'casa' });
    // Among the categories a word matches, the most generic name wins, whatever their order.
    const withFurniture = [{ ...CATEGORIES[0], id: 'arredo', name: 'Arredo e casa', subCategories: [] }, ...CATEGORIES];
    expect(suggestCategory('saleCertificates', withFurniture, undefined)).toEqual({ categoryId: 'casa' });
    // A specific word still reaches into the subcategories.
    expect(suggestCategory('homeInsurance', CATEGORIES, undefined)).toEqual({ categoryId: 'casa', subCategoryId: 'casa-assicurazione-casa' });
  });

  it('should take only debt categories for an instalment and income for a refund', () => {
    expect(suggestCategory('mortgageInstalment', CATEGORIES, undefined)).toEqual({ categoryId: 'mutuo' });
    expect(suggestCategory('insuranceRefund', CATEGORIES, undefined)).toEqual({ categoryId: 'rimborsi' });
    expect(suggestCategory('agency', CATEGORIES, undefined)).toBeNull();
  });
});

describe('a purchase', () => {
  it('should create the property at zero and transfer the deposit onto it at the preliminare', () => {
    const answers = answersWith({ propertyName: 'Casa Nuova', price: 200000, depositAmount: 20000, costs: { agency: { amount: 3000, category: { categoryId: 'casa' } } }, costCenter: { mode: 'new', name: 'Acquisto Casa Nuova', existingId: '' } });
    const plan = buildRealEstatePlan(answers, context);

    expect(kinds(plan.steps)).toEqual(['createCostCenter', 'createProperty', 'row:deposit', 'row:cost:agency']);
    const deposit = plan.steps[2] as Extract<PlanStep, { kind: 'row' }>;
    expect(deposit.row).toMatchObject({ type: 'transfer', amount: 20000, account: { id: 'acc' }, destination: { ref: 'property' }, inCostCenter: false });
    const agency = plan.steps[3] as Extract<PlanStep, { kind: 'row' }>;
    expect(agency.row).toMatchObject({ type: 'fixed', amount: 3000, inCostCenter: true, notes: 'Agenzia · Casa Nuova' });
  });

  it('should open the mortgage on the property and transfer only the rest of the price at the rogito', () => {
    const answers = answersWith({
      event: 'rogito',
      propertyId: 'house',
      price: 280000,
      hasMortgage: true,
      mortgage: { principal: 100000, ratePct: 3, years: 25, firstInstalmentIso: '2026-07-27', instalmentOverride: null },
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
    // The house holds 130.000 already (the deposits): 280.000 − 130.000 − 100.000 = 50.000 from the account.
    expect(figuresOf(answers, context)).toMatchObject({ valueToday: 130000, purchaseBalance: 50000, mortgageInstalment: 474.21, mortgageLastIso: '2051-06-27' });

    const plan = buildRealEstatePlan(answers, context);
    expect(kinds(plan.steps)).toEqual(['createLoan', 'adjustProperty', 'row:balance', 'row:mortgageInstalments']);
    expect(plan.steps[0]).toMatchObject({ kind: 'createLoan', ref: 'mortgage', principal: 100000, financesProperty: true });
    expect(plan.steps[1]).toEqual({ kind: 'adjustProperty', delta: 100000, reason: 'mortgage' });
    expect((plan.steps[3] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ type: 'debt', amount: 474.21, months: 300, loan: { ref: 'mortgage' }, dateIso: '2026-07-27' });
    // The house comes from the mortgage (lib/utils/propertyLink.ts): no second link on the instalments.
    expect((plan.steps[3] as Extract<PlanStep, { kind: 'row' }>).row.property).toBeUndefined();
  });

  it('should write the policies: a monthly home series, a paid life premium, a financed one as a loan and its instalments', () => {
    const answers = answersWith({
      event: 'rogito',
      propertyName: 'Casa Nuova',
      price: 100000,
      hasMortgage: false,
      homeInsurance: { mode: 'monthly', amount: 2, firstIso: '2026-07-27', months: 120, category: { categoryId: 'casa', subCategoryId: 'casa-assicurazione-casa' } },
      lifePolicies: [
        { insuredMemberId: 'm-airone', mode: 'single', amount: 900, firstIso: '2026-07-27', months: null, loan: { principal: null, ratePct: null, years: null, firstInstalmentIso: '2026-07-27', instalmentOverride: null }, linkedToProperty: false },
        { insuredMemberId: 'm-cormorano', mode: 'financed', amount: 1200, firstIso: '2026-07-27', months: null, loan: { principal: null, ratePct: 0, years: 1, firstInstalmentIso: '2026-07-27', instalmentOverride: null }, linkedToProperty: true },
      ],
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
    const plan = buildRealEstatePlan(answers, context);

    expect(kinds(plan.steps)).toEqual(['createProperty', 'row:balance', 'row:homeInsurance', 'row:lifeInsurance', 'createLoan', 'row:lifeLoanInstalments']);
    // The home policy belongs to the house; a life policy only when ticked «Legata alla casa» (a CPI).
    expect((plan.steps[2] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ months: 120, amount: 2, inCostCenter: false, property: { ref: 'property' } });
    expect((plan.steps[3] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ amount: 900, dateIso: '2026-06-15', inCostCenter: true });
    expect((plan.steps[3] as Extract<PlanStep, { kind: 'row' }>).row.property).toBeUndefined();
    expect(plan.steps[4]).toMatchObject({ ref: 'lifeLoan:1', principal: 1200, financesProperty: false });
    // A financed premium is no spending row: the loan's twelve instalments of 100 are.
    expect((plan.steps[5] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ type: 'debt', amount: 100, months: 12, loan: { ref: 'lifeLoan:1' }, property: { ref: 'property' } });
  });
});

describe('a life policy and its insured (owner, 2026-10-21 tour)', () => {
  const policies = (linkedToProperty: boolean) =>
    answersWith({
      event: 'rogito',
      propertyName: 'Casa Nuova',
      price: 100000,
      hasMortgage: false,
      lifePolicies: [
        { insuredMemberId: 'm-airone', mode: 'monthly', amount: 30, firstIso: '2026-07-15', months: 12, loan: { principal: null, ratePct: null, years: null, firstInstalmentIso: '2026-07-15', instalmentOverride: null }, linkedToProperty },
      ],
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
  const lifeRow = (plan: ReturnType<typeof buildRealEstatePlan>) => (plan.steps.find((step) => step.kind === 'row' && step.label === 'lifeInsurance') as Extract<PlanStep, { kind: 'row' }>).row;

  it('should name the policy after its insured and give a personal one to them with Divisione on', () => {
    const row = lifeRow(buildRealEstatePlan(policies(false), makeContext({ splitEnabled: true })));
    expect(row).toMatchObject({ notes: 'Polizza vita Airone', member: 'm-airone' });
  });

  it('should keep a CPI linked to the house in comune, and every policy with Divisione off', () => {
    expect(lifeRow(buildRealEstatePlan(policies(true), makeContext({ splitEnabled: true }))).member).toBeUndefined();
    expect(lifeRow(buildRealEstatePlan(policies(false), context)).member).toBeUndefined();
  });

  it('should name a policy by its number without a household', () => {
    expect(lifeRow(buildRealEstatePlan(policies(false), makeContext({ familyMembers: [] }))).notes).toBe('Polizza vita 1');
  });
});

describe('a sale', () => {
  it('should transfer the deposit received out of the property at the preliminare', () => {
    const answers = answersWith({ kind: 'sale', propertyId: 'house', price: 150000, depositAmount: 15000, costCenter: { mode: 'none', name: '', existingId: '' } });
    const plan = buildRealEstatePlan(answers, context);

    expect(kinds(plan.steps)).toEqual(['row:deposit']);
    expect((plan.steps[0] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ type: 'transfer', amount: 15000, account: { id: 'house' }, destination: { id: 'acc' } });
  });

  it('should revalue the house to the price, close the loan with the price, transfer the net and stop the chosen series at the rogito', () => {
    const answers = answersWith({
      kind: 'sale',
      event: 'rogito',
      eventDateIso: '2026-06-30',
      propertyId: 'house',
      price: 160000,
      depositsReceived: 15000,
      payoffs: [{ loanId: 'loan', amount: 60000, include: true }],
      stopSeriesIds: ['series-mortgage'],
      costs: { agency: { amount: 4000, category: { categoryId: 'casa' } }, insuranceRefund: { amount: 50, category: { categoryId: 'rimborsi' } } },
      costCenter: { mode: 'existing', name: '', existingId: 'cc1' },
    });
    const withCenter = makeContext({ costCenters: [{ id: 'cc1', userId: 'u1', name: 'Vendita', createdAt: new Date(), updatedAt: new Date() } as never] });
    // 160.000 − 15.000 received = 145.000 to come; the house holds 130.000: +15.000 first.
    // The buyer's bank closes the 60.000 of debt out of the price: 145.000 − 60.000 reach the account.
    expect(figuresOf(answers, withCenter)).toMatchObject({ saleBalance: 145000, salePayoff: 60000, saleNet: 85000, saleAdjustment: 15000 });

    const plan = buildRealEstatePlan(answers, withCenter);
    expect(plan.costCenterId).toBe('cc1');
    expect(kinds(plan.steps)).toEqual(['adjustProperty', 'payOffWithSale', 'row:balance', 'row:cost:agency', 'row:cost:insuranceRefund', 'stopSeries']);
    expect(plan.steps[0]).toEqual({ kind: 'adjustProperty', delta: 15000, reason: 'revaluation' });
    // No spending row for the payoff (owner, 2026-10-21 tour): the debt and the house fall together.
    expect(plan.steps[1]).toEqual({ kind: 'payOffWithSale', loanId: 'loan', loanName: 'Mutuo Gabbiano', amount: 60000 });
    expect((plan.steps[2] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ type: 'transfer', amount: 85000, account: { id: 'house' }, destination: { id: 'acc' } });
    expect(plan.steps.some((step) => step.kind === 'row' && step.row.type === 'debt')).toBe(false);
    // A refund is income: never booked in the operation's centre.
    expect((plan.steps[4] as Extract<PlanStep, { kind: 'row' }>).row).toMatchObject({ type: 'income', inCostCenter: false });
    expect((plan.steps[5] as Extract<PlanStep, { kind: 'stopSeries' }>).series.rows.map((row) => row.id)).toEqual(['m2', 'm3']);
  });

  it('should lower the value when the house sells below what is recorded', () => {
    const answers = answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 120000, depositsReceived: 0, costCenter: { mode: 'none', name: '', existingId: '' } });

    expect(figuresOf(answers, context).saleAdjustment).toBe(-10000);
    expect(buildRealEstatePlan(answers, context).steps[0]).toEqual({ kind: 'adjustProperty', delta: -10000, reason: 'revaluation' });
  });

  it('should leave out a cost whose category no longer resolves, never guess one', () => {
    const answers = answersWith({ kind: 'sale', event: 'preliminare', propertyId: 'house', depositAmount: 1000, costs: { agency: { amount: 500, category: { categoryId: 'gone' } } }, costCenter: { mode: 'none', name: '', existingId: '' } });

    expect(kinds(buildRealEstatePlan(answers, context).steps)).toEqual(['row:deposit']);
  });
});
