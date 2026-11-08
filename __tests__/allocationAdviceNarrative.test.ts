/**
 * The Consulente's sentences (lib/utils/allocationAdviceNarrative.ts): the report's verdict by
 * status, the proposal rows against today, the reading on the two largest moves, the apply
 * summary, the «rivedi entro» line of the Allocazione header.
 */

import { describe, expect, it } from 'vitest';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import { narrativeToText } from '@/lib/utils/narrative';
import {
  buildConsulenteVerdict,
  buildProposalRows,
  describeApplySummary,
  describeLossScenario,
  describeProposalReading,
  describeReviewBy,
  describeReviewInvite,
  reviewDueState,
  describeRunHeadline,
  describeStageTypical,
  EXCHANGE_OPTIONS,
  EXCHANGE_OTHER,
  isListedExchange,
  STAGE_TYPICAL_MINUTES,
} from '@/lib/utils/allocationAdviceNarrative';

const NOW = new Date('2026-10-20T12:00:00.000Z');

const PROPOSAL: AllocationAdviceProposal = {
  summary: 'Più obbligazioni, meno liquidità.',
  classes: [
    { assetClass: 'equity', targetPercentage: 55, rationale: '', subTargets: [{ name: 'All World', targetPercentage: 100, instrument: 'ETF Mondo' }] },
    { assetClass: 'bonds', targetPercentage: 45, rationale: '', subTargets: [] },
    { assetClass: 'cash', targetPercentage: 0, fixedAmount: 10000, rationale: '', subTargets: [] },
  ],
  assetRoles: [],
  goals: [],
  reviewByIso: '2028-10-20',
  reviewReason: 'Due anni.',
  risks: [],
};

function document(overrides: Partial<AllocationAdviceDocument> = {}): AllocationAdviceDocument {
  return {
    userId: 'u1',
    status: 'ready',
    answers: {} as AllocationAdviceDocument['answers'],
    stage: 'review',
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    strategy: null,
    instruments: null,
    report: { markdown: '# Report', proposal: PROPOSAL, model: 'claude-opus-5-5', finishedAt: NOW },
    error: null,
    applied: null,
    interview: null,
    ...overrides,
  };
}

const plain = (segments: ReturnType<typeof describeProposalReading>) => narrativeToText(segments).replace(/ /g, ' ');

describe('buildConsulenteVerdict', () => {
  it('reads the summary and the review date on a ready run', () => {
    const verdict = buildConsulenteVerdict(document());
    expect(verdict.headline).toBe('La proposta è pronta.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Più obbligazioni, meno liquidità. Da rivedere entro il 20/10/2028.');
  });

  it('says the failure in the product\'s words, the applied date once applied, the missing structure when the block is malformed', () => {
    expect(buildConsulenteVerdict(document({ status: 'failed', error: 'Il servizio AI non ha risposto.' }))).toMatchObject({ headline: 'Il percorso non si è concluso.', tone: 'negative' });
    const applied = buildConsulenteVerdict(document({ status: 'applied', applied: { at: NOW, targetsWritten: true, rolesChanged: 1, goalsWritten: 0 } }));
    expect(applied.headline).toBe('Allocazione applicata.');
    expect(plain(applied.sentence)).toBe('Scritta il 20/10/2026; da rivedere entro il 20/10/2028.');
    const noBlock = buildConsulenteVerdict(document({ report: { markdown: 'Testo', proposal: null, model: 'm', finishedAt: NOW } }));
    expect(noBlock.tone).toBe('warning');
    expect(noBlock.headline).toMatch(/senza una proposta leggibile/);
  });
});

describe('buildProposalRows and describeProposalReading', () => {
  it('lists the proposal\'s classes against today and appends the held classes it drops', () => {
    const rows = buildProposalRows(PROPOSAL, { equity: 47, bonds: 7, crypto: 10.6, cash: 21.8 });
    expect(rows.map((row) => row.assetClass)).toEqual(['equity', 'bonds', 'cash', 'crypto']);
    expect(rows[0]).toMatchObject({ label: 'Azioni', currentPct: 47, proposedPct: 55, deltaPp: 8 });
    expect(rows[2]).toMatchObject({ label: 'Liquidità', fixedAmount: 10000, deltaPp: 0 });
    expect(rows[3]).toMatchObject({ label: 'Criptovalute', currentPct: 10.6, proposedPct: 0, deltaPp: -10.6 });
    expect(rows[0].subTargets).toEqual([{ name: 'All World', pct: 100, instrument: 'ETF Mondo' }]);
  });

  it('reads the two largest moves, or says nothing moves', () => {
    const rows = buildProposalRows(PROPOSAL, { equity: 47, bonds: 7, crypto: 10.6 });
    expect(plain(describeProposalReading(rows))).toBe('Obbligazioni passa dal 7% al 45%; Criptovalute passa dal 11% al 0%.');
    const still = buildProposalRows(PROPOSAL, { equity: 55.4, bonds: 44.6 });
    expect(plain(describeProposalReading(still))).toBe('Nessuna classe si muove di più di un punto rispetto a oggi.');
  });
});

describe('the small sentences', () => {
  it('summarises what «Applica» writes', () => {
    expect(describeApplySummary({ targets: true, roles: 2, goals: 1 })).toBe('Scrive i target in Impostazioni → Allocazione, 2 ruoli degli asset, 1 obiettivo. Puoi sempre cambiarli a mano dopo.');
    expect(describeApplySummary({ targets: false, roles: 0, goals: 0 })).toBe('Niente selezionato: scegli almeno una voce.');
  });

  it('knows where today stands against the review date, and says it near or past it (2026-10-20)', () => {
    const applied = document({ status: 'applied', applied: { at: NOW, targetsWritten: true, rolesChanged: 0, goalsWritten: 0 } });
    expect(reviewDueState(applied, '2027-01-01')).toEqual({ state: 'later', reviewByIso: '2028-10-20', daysLeft: 658 });
    expect(reviewDueState(applied, '2028-09-21')).toEqual({ state: 'soon', reviewByIso: '2028-10-20', daysLeft: 29 });
    expect(reviewDueState(applied, '2028-10-20')).toMatchObject({ state: 'due', daysLeft: 0 });
    expect(reviewDueState(applied, '2028-11-03')).toMatchObject({ state: 'due', daysLeft: -14 });
    expect(reviewDueState(document(), '2028-10-20')).toEqual({ state: 'none' });
    expect(reviewDueState(null, '2028-10-20')).toEqual({ state: 'none' });

    expect(describeReviewInvite(reviewDueState(applied, '2027-01-01'))).toBeNull();
    expect(describeReviewInvite(reviewDueState(applied, '2028-10-19'))).toBe('La revisione del piano è vicina: entro il 20/10/2028, fra 1 giorno.');
    expect(describeReviewInvite(reviewDueState(applied, '2028-10-20'))).toBe('Oggi è il giorno della revisione del piano (20/10/2028).');
    expect(describeReviewInvite(reviewDueState(applied, '2028-11-03'))).toBe('La data della revisione del piano, 20/10/2028, è passata da 14 giorni.');

    const verdict = buildConsulenteVerdict(applied, '2028-11-03');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toContain('è passata da 14 giorni. «Rifai il percorso», in fondo, riparte dal piano in vigore');
    expect(buildConsulenteVerdict(applied, '2027-01-01').tone).toBe('positive');
    expect(plain(buildConsulenteVerdict(applied).sentence)).toBe('Scritta il 20/10/2026; da rivedere entro il 20/10/2028.');
  });

  it('prints the «rivedi entro» line only once applied', () => {
    expect(describeReviewBy(document())).toBeNull();
    expect(describeReviewBy(document({ status: 'applied', applied: { at: NOW, targetsWritten: true, rolesChanged: 0, goalsWritten: 0 } }))).toBe(
      'Piano del Consulente applicato il 20/10/2026 · rivedi entro il 20/10/2028'
    );
    expect(describeReviewBy(null)).toBeNull();
  });

  it('names the stage and the loss in euro', () => {
    expect(describeRunHeadline(null)).toBe('Avvio il percorso.');
    expect(describeRunHeadline('instruments')).toBe('Cerco gli strumenti.');
    expect(plain(describeLossScenario(25, 4250))).toBe('−25% sarebbero 4250 € in meno.');
  });
});

describe('the exchange list (2026-10-20)', () => {
  it('knows its four rows and nothing else, so «Altra…» opens for a free text', () => {
    expect(isListedExchange('Borsa Italiana (Milano, XMIL)')).toBe(true);
    expect(isListedExchange('SIX Swiss Exchange')).toBe(false);
    expect(isListedExchange('')).toBe(false);
    expect(EXCHANGE_OPTIONS).not.toContain(EXCHANGE_OTHER);
  });
});

describe('the stages’ typical durations (2026-11-07)', () => {
  it('names the four stages at 0 · 2 · 2 · 1 minutes', () => {
    expect(STAGE_TYPICAL_MINUTES).toEqual({ context: 0, strategy: 2, instruments: 2, review: 1 });
  });

  it('prints «di solito ~N min», and nothing for the context', () => {
    expect(describeStageTypical('strategy')).toBe('di solito ~2 min');
    expect(describeStageTypical('review')).toBe('di solito ~1 min');
    expect(describeStageTypical('context')).toBeNull();
  });
});
