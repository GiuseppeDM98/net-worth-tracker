/**
 * Tests for lib/utils/realEstateOperationNarrative.ts — why a Compravendita screen cannot advance, and
 * the sentences of the summary. Figures are invented and round.
 */

import { describe, expect, it } from 'vitest';

import { emptyLifePolicy, initialAnswers } from '@/lib/utils/realEstateOperationDraft';
import { buildRealEstatePlan } from '@/lib/utils/realEstateOperationPlan';
import {
  describeBalance,
  describeMortgageInstalment,
  describePlanStep,
  describeSaleAdjustment,
  describeScreenBlock,
  formatIsoDay,
  type PlanNames,
} from '@/lib/utils/realEstateOperationNarrative';
import type { RealEstateOperationAnswers } from '@/types/realEstateOperation';
import { makeContext } from './fixtures/realEstateOperation';

const context = makeContext();
const answersWith = (patch: Partial<RealEstateOperationAnswers>): RealEstateOperationAnswers => ({ ...initialAnswers(context), ...patch });
const flat = (text: string) => text.replace(/ /g, ' ');
const names: PlanNames = { assetName: (id) => ({ acc: 'Conto Fenicottero', house: 'Casa Gabbiano', loan: 'Mutuo Gabbiano' })[id] ?? id, propertyName: 'Casa Gabbiano', costCenterName: 'Vendita' };

describe('describeScreenBlock', () => {
  it('should refuse an event in the future: one run per event, as it happens', () => {
    expect(describeScreenBlock('operazione', answersWith({ eventDateIso: '2026-06-16' }), context)).toContain('nel futuro');
    expect(describeScreenBlock('operazione', answersWith({ eventDateIso: '2026-06-15' }), context)).toBeNull();
  });

  it('should ask a new property for a name and a price, quotas for 100%', () => {
    expect(describeScreenBlock('immobile', answersWith({}), context)).toBe('Dai un nome alla casa.');
    expect(describeScreenBlock('immobile', answersWith({ propertyName: 'Casa Nuova' }), context)).toBe('Scrivi il prezzo pattuito.');
    expect(describeScreenBlock('immobile', answersWith({ propertyName: 'Casa Nuova', price: 100000, ownership: { mode: 'shares', shares: [{ memberId: 'a', percent: 60 }, { memberId: 'b', percent: 30 }] } }), context)).toBe('Le quote sommano a 90%: devono fare 100%.');
  });

  it('should refuse a deposit received above the house’s value', () => {
    expect(flat(describeScreenBlock('caparra', answersWith({ kind: 'sale', propertyId: 'house', depositAmount: 140000 }), context) ?? '')).toBe('La caparra supera il valore della casa (130.000,00 €).');
  });

  it('should refuse a mortgage over what is left to pay, and a term over thirty years', () => {
    const rogito = { event: 'rogito' as const, propertyName: 'Casa Nuova', price: 100000, hasMortgage: true };
    expect(flat(describeScreenBlock('mutuo', answersWith({ ...rogito, mortgage: { principal: 120000, ratePct: 3, years: 20, firstInstalmentIso: '2026-07-15', instalmentOverride: null } }), context) ?? '')).toBe(
      'Il mutuo supera quanto resta da pagare della casa (100.000,00 €).'
    );
    expect(describeScreenBlock('mutuo', answersWith({ ...rogito, mortgage: { principal: 80000, ratePct: 3, years: 31, firstInstalmentIso: '2026-07-15', instalmentOverride: null } }), context)).toBe('Scrivi la durata in anni, al massimo 30.');
  });

  it('should ask who a life policy insures among the household, and nothing without one', () => {
    const policy = { ...emptyLifePolicy(initialAnswers(context)), amount: 30, months: 12 };
    const polizze = answersWith({ event: 'rogito', homeInsurance: { mode: 'none', amount: null, firstIso: '2026-07-15', months: null, category: null }, lifePolicies: [policy] });
    expect(describeScreenBlock('polizze', polizze, context)).toBe('Scegli chi assicura la polizza vita 1.');
    expect(describeScreenBlock('polizze', { ...polizze, lifePolicies: [{ ...policy, insuredMemberId: 'm-airone' }] }, context)).not.toBe('Scegli chi assicura la polizza vita 1.');
    expect(describeScreenBlock('polizze', polizze, makeContext({ familyMembers: [] }))).not.toBe('Scegli chi assicura la polizza vita 1.');
  });

  it('should ask a typed cost for its category', () => {
    const answers = answersWith({ costs: { agency: { amount: 3000, category: null } } });
    expect(describeScreenBlock('costi', answers, context)).toBe('Scegli la categoria di «Agenzia».');
  });
});

describe('the sentences', () => {
  it('should say the instalment and where it comes from', () => {
    const answers = answersWith({ mortgage: { principal: 100000, ratePct: 3, years: 25, firstInstalmentIso: '2026-07-27', instalmentOverride: null } });
    expect(flat(describeMortgageInstalment(answers) ?? '')).toBe('300 rate da 474,21 € (piano alla francese), dalla prima del 27 luglio 2026.');
  });

  it('should say the balance of a purchase and of a sale', () => {
    expect(flat(describeBalance(answersWith({ event: 'rogito', propertyId: 'house', price: 280000, hasMortgage: true, mortgage: { principal: 100000, ratePct: 3, years: 25, firstInstalmentIso: '2026-07-27', instalmentOverride: null } }), context))).toBe(
      'Dal conto escono 50.000,00 €: il prezzo meno 130.000,00 € già nella casa e 100.000,00 € di mutuo.'
    );
    expect(flat(describeBalance(answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 150000, depositsReceived: 15000 }), context))).toBe(
      'Sul conto entrano 135.000,00 €: il prezzo meno le caparre già ricevute.'
    );
  });

  it('should say the revaluation up and down', () => {
    expect(flat(describeSaleAdjustment(answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 150000, depositsReceived: 0 }), context, 'Casa Gabbiano'))).toBe(
      'Casa Gabbiano è registrata a 130.000,00 € e la vendi per 150.000,00 €: prima della vendita il suo valore sale di 20.000,00 €.'
    );
    expect(flat(describeSaleAdjustment(answersWith({ kind: 'sale', event: 'rogito', propertyId: 'house', price: 120000, depositsReceived: 0 }), context, 'Casa Gabbiano'))).toContain('scende di 10.000,00 €');
  });

  it('should list a sale rogito in sentences the reader can check', () => {
    const answers = answersWith({
      kind: 'sale',
      event: 'rogito',
      eventDateIso: '2026-06-15',
      propertyId: 'house',
      price: 150000,
      depositsReceived: 15000,
      payoffs: [{ loanId: 'loan', amount: 60000, include: true }],
      stopSeriesIds: ['series-mortgage'],
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
    const lines = buildRealEstatePlan(answers, context).steps.map((step) => flat(describePlanStep(step, names)));
    expect(lines).toEqual([
      'Rivaluta Casa Gabbiano di 5000,00 €, al prezzo di vendita.',
      'Estingue Mutuo Gabbiano con 60.000,00 € del prezzo: il debito va a zero e il valore di Casa Gabbiano scende dello stesso importo. Nessuna spesa: è patrimonio che cambia forma.',
      'Trasferimento di 75.000,00 € da Casa Gabbiano a Conto Fenicottero, il 15 giugno 2026 (saldo al rogito).',
      'Ferma la serie «Mutuo» da 500,00 €: cancella le 3 voci dopo il rogito.',
    ]);
  });

  it('should name a policy loan it creates by its own name (owner, 2026-10-21 tour: «di il prestito»)', () => {
    const answers = answersWith({
      event: 'rogito',
      propertyName: 'Casa Nuova',
      price: 100000,
      hasMortgage: false,
      lifePolicies: [{ insuredMemberId: 'm-cormorano', mode: 'financed', amount: 1200, firstIso: '2026-07-15', months: null, loan: { principal: null, ratePct: 0, years: 1, firstInstalmentIso: '2026-07-15', instalmentOverride: null }, linkedToProperty: false }],
      costCenter: { mode: 'none', name: '', existingId: '' },
    });
    const lines = buildRealEstatePlan(answers, context).steps.map((step) => flat(describePlanStep(step, { ...names, propertyName: 'Casa Nuova' })));
    expect(lines.find((line) => line.startsWith('Serie di 12'))).toContain('che riducono il debito di Prestito polizza vita Cormorano');
  });

  it('should print a calendar day in words', () => {
    expect(formatIsoDay('2026-01-05')).toBe('5 gennaio 2026');
  });
});
