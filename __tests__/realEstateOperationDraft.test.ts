/**
 * Tests for lib/utils/realEstateOperationDraft.ts — the Compravendita path as a value: which screens
 * an answer set needs, the moves between them, what leaving the property screen fills in, the draft
 * kept on this browser.
 */

import { describe, expect, it } from 'vitest';

import {
  initialAnswers,
  initialDraft,
  readStoredDraft,
  realEstateOperationReducer,
  screensFor,
  writeStoredDraft,
  type RealEstateOperationDraft,
} from '@/lib/utils/realEstateOperationDraft';
import type { RealEstateOperationAnswers } from '@/types/realEstateOperation';
import { CENTERS, makeContext } from './fixtures/realEstateOperation';

const context = makeContext();
const answersWith = (patch: Partial<RealEstateOperationAnswers>, ctx = context): RealEstateOperationAnswers => ({ ...initialAnswers(ctx), ...patch });

describe('initialAnswers', () => {
  it('should open on a purchase preliminare today, on the default account, every category on its suggestion', () => {
    const answers = initialAnswers(context);
    expect(answers).toMatchObject({ kind: 'purchase', event: 'preliminare', eventDateIso: '2026-06-15', accountId: 'acc', isPrimaryResidence: true });
    expect(answers.costs.notary?.category).toEqual({ categoryId: 'casa', subCategoryId: 'casa-notaio' });
    expect(answers.mortgageCategory).toEqual({ categoryId: 'mutuo' });
    expect(answers.mortgage.firstInstalmentIso).toBe('2026-07-15');
  });

  it('should start on a saved default over the suggestion', () => {
    const ctx = makeContext({ settings: { realEstateCostCategories: [{ kind: 'notary', categoryId: 'tasse' }] } });
    expect(initialAnswers(ctx).costs.notary?.category).toEqual({ categoryId: 'tasse' });
  });
});

describe('screensFor', () => {
  it('should ask a purchase preliminare only for the deposit and the costs', () => {
    expect(screensFor(answersWith({}), context)).toEqual(['operazione', 'immobile', 'caparra', 'costi', 'centro', 'riepilogo']);
  });

  it('should ask a purchase rogito for the mortgage BEFORE the balance, then the policies', () => {
    expect(screensFor(answersWith({ event: 'rogito' }), context)).toEqual(['operazione', 'immobile', 'mutuo', 'saldo', 'polizze', 'costi', 'centro', 'riepilogo']);
  });

  it('should ask a sale rogito to revalue, pay off and stop the series only when there is something to do', () => {
    const sale = answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 150000, depositsReceived: 0 });
    expect(screensFor(sale, context)).toEqual(['operazione', 'immobile', 'saldo', 'rivaluta', 'estinzione', 'serie', 'costi', 'centro', 'riepilogo']);
    // At the recorded value nothing is revalued.
    expect(screensFor({ ...sale, price: 130000 }, context)).not.toContain('rivaluta');
  });

  it('should drop the centre screen with the cost centres off', () => {
    expect(screensFor(answersWith({}), makeContext({ costCentersEnabled: false }))).not.toContain('centro');
  });
});

describe('realEstateOperationReducer', () => {
  const at = (screen: RealEstateOperationDraft['screen'], answers: RealEstateOperationAnswers): RealEstateOperationDraft => ({ screen, answers, preparedFor: null });

  it('should walk forward and back among the screens the answers need', () => {
    let draft = initialDraft(answersWith({}));
    draft = realEstateOperationReducer(draft, { type: 'next', context });
    expect(draft.screen).toBe('immobile');
    draft = realEstateOperationReducer(draft, { type: 'next', context });
    expect(draft.screen).toBe('caparra');
    draft = realEstateOperationReducer(draft, { type: 'back', context });
    draft = realEstateOperationReducer(draft, { type: 'back', context });
    draft = realEstateOperationReducer(draft, { type: 'back', context });
    expect(draft.screen).toBe('operazione');
  });

  it('should fill the sale rogito from the property when leaving its screen: deposits, payoff, series, centre', () => {
    const ctx = makeContext({ costCenters: CENTERS });
    const draft = realEstateOperationReducer(at('immobile', answersWith({ kind: 'sale', event: 'rogito', eventDateIso: '2026-06-30', propertyId: 'house', price: 150000 }, ctx)), { type: 'next', context: ctx });

    expect(draft.answers.depositsReceived).toBe(15000);
    expect(draft.answers.payoffs).toEqual([{ loanId: 'loan', amount: 60000, include: true }]);
    expect(draft.answers.stopSeriesIds).toEqual(['series-policy', 'series-mortgage']);
    // A centre named like the default already exists: the run books in it instead of creating a twin.
    expect(draft.answers.costCenter).toEqual({ mode: 'existing', name: 'Vendita Casa Gabbiano', existingId: 'cc1' });
    expect(draft.screen).toBe('saldo');
  });

  it('should not prefill again for the same property, keeping what was typed', () => {
    const first = realEstateOperationReducer(at('immobile', answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 150000 })), { type: 'next', context });
    const typed = realEstateOperationReducer({ ...first, screen: 'immobile' }, { type: 'patch', patch: { depositsReceived: 1000 } });
    const again = realEstateOperationReducer(typed, { type: 'next', context });
    expect(again.answers.depositsReceived).toBe(1000);
  });

  it('should step past a screen the answers no longer need', () => {
    // On «Rivaluta», the price changed to the recorded value: «Avanti» moves on from its place.
    const draft = realEstateOperationReducer(at('rivaluta', answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 130000, depositsReceived: 0 })), { type: 'next', context });
    expect(draft.screen).toBe('estinzione');
  });

  it('should add, edit and remove a life policy', () => {
    let draft = initialDraft(answersWith({ mortgage: { principal: 1000, ratePct: 1, years: 10, firstInstalmentIso: '2026-07-27', instalmentOverride: null } }));
    draft = realEstateOperationReducer(draft, { type: 'addLifePolicy' });
    expect(draft.answers.lifePolicies[0]).toMatchObject({ mode: 'monthly', firstIso: '2026-07-27', months: 120 });
    draft = realEstateOperationReducer(draft, { type: 'updateLifePolicy', index: 0, patch: { insuredMemberId: 'm-airone' } });
    expect(draft.answers.lifePolicies[0].insuredMemberId).toBe('m-airone');
    draft = realEstateOperationReducer(draft, { type: 'removeLifePolicy', index: 0 });
    expect(draft.answers.lifePolicies).toEqual([]);
  });
});

describe('the draft on this browser', () => {
  const memory = () => {
    const store = new Map<string, string>();
    return { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  };

  it('should come back as it was written', () => {
    const storage = memory();
    const draft = initialDraft(answersWith({ propertyName: 'Casa Nuova' }));
    writeStoredDraft(storage, 'u1', draft);
    expect(readStoredDraft(storage, 'u1')).toEqual(draft);
  });

  it('should ignore a stored draft of another shape, and a missing storage', () => {
    const storage = memory();
    storage.setItem('real-estate-operation-draft:u1', JSON.stringify({ screen: 'altrove', answers: {} }));
    expect(readStoredDraft(storage, 'u1')).toBeNull();
    expect(readStoredDraft(null, 'u1')).toBeNull();
  });
});
