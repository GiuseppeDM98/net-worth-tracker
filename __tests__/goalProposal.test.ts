/**
 * Unit tests for the ```goal-proposal payload.
 *
 * The card renders whatever this parser accepts and falls back to a plain code block on
 * null, so every rejection here is a case the user still sees as text — and every
 * acceptance is a payload POST /api/goals will also accept, since both ends share the
 * schema.
 */

import { describe, expect, it } from 'vitest';
import { goalProposalSchema, parseGoalProposal } from '@/lib/utils/goalProposal';

const VALID = {
  name: 'Acquisto Casa',
  targetAmount: 200000,
  targetDateIso: '2032-06-01',
  priority: 'alta',
  monthlyContribution: 800,
  recommendedAllocation: { bonds: 70, equity: 20, cash: 10 },
  notes: 'Anticipo per la prima casa',
};

describe('parseGoalProposal', () => {
  it('should parse a complete proposal', () => {
    const result = parseGoalProposal(JSON.stringify(VALID));

    expect(result).toEqual(VALID);
  });

  it('should parse a minimal proposal carrying only the required fields', () => {
    const result = parseGoalProposal(JSON.stringify({ name: 'Pensione', priority: 'media' }));

    expect(result).toEqual({ name: 'Pensione', priority: 'media' });
  });

  it('should tolerate the whitespace a fenced block leaves around the JSON', () => {
    const result = parseGoalProposal(`\n  ${JSON.stringify(VALID)}\n`);

    expect(result?.name).toBe('Acquisto Casa');
  });

  it('should return null on malformed JSON instead of throwing', () => {
    expect(parseGoalProposal('{ name: "Casa", ')).toBeNull();
  });

  it('should return null when the name is missing', () => {
    expect(parseGoalProposal(JSON.stringify({ priority: 'alta' }))).toBeNull();
  });

  it('should return null on an unknown priority', () => {
    expect(parseGoalProposal(JSON.stringify({ name: 'Casa', priority: 'urgente' }))).toBeNull();
  });

  it('should return null when the recommended allocation does not total 100', () => {
    const proposal = { ...VALID, recommendedAllocation: { bonds: 70, equity: 20 } };

    expect(parseGoalProposal(JSON.stringify(proposal))).toBeNull();
  });

  it('should accept an allocation off by less than the rounding tolerance', () => {
    const proposal = { ...VALID, recommendedAllocation: { bonds: 66.7, equity: 33.4 } };

    expect(parseGoalProposal(JSON.stringify(proposal))?.recommendedAllocation).toEqual({
      bonds: 66.7,
      equity: 33.4,
    });
  });

  it('should return null on an asset class that does not exist', () => {
    const proposal = { ...VALID, recommendedAllocation: { azioni: 100 } };

    expect(parseGoalProposal(JSON.stringify(proposal))).toBeNull();
  });

  it('should return null on a deadline that is not YYYY-MM-DD', () => {
    const proposal = { ...VALID, targetDateIso: '01/06/2032' };

    expect(parseGoalProposal(JSON.stringify(proposal))).toBeNull();
  });

  it('should return null on a well-formed but impossible deadline', () => {
    const proposal = { ...VALID, targetDateIso: '2032-13-45' };

    expect(parseGoalProposal(JSON.stringify(proposal))).toBeNull();
  });

  it('should return null on a negative target amount', () => {
    expect(parseGoalProposal(JSON.stringify({ ...VALID, targetAmount: -1000 }))).toBeNull();
  });

  it('should return null on a JSON value that is not an object', () => {
    expect(parseGoalProposal('"Acquisto Casa"')).toBeNull();
    expect(parseGoalProposal('[]')).toBeNull();
  });
});

describe('goalProposalSchema', () => {
  it('should trim the goal name', () => {
    const result = goalProposalSchema.parse({ name: '  Casa  ', priority: 'bassa' });

    expect(result.name).toBe('Casa');
  });
});

describe('the proposal that MODIFIES a goal and names its instruments (2026-10-20)', () => {
  it('accepts a goalId and quotas by instrument name, in percent of the instrument', () => {
    const proposal = parseGoalProposal(
      JSON.stringify({ ...VALID, goalId: 'g-1', assignments: [{ assetName: 'ETF Mondo', percentage: 50 }, { assetName: 'BTP Esempio', percentage: 100 }] })
    );
    expect(proposal?.goalId).toBe('g-1');
    expect(proposal?.assignments).toEqual([
      { assetName: 'ETF Mondo', percentage: 50 },
      { assetName: 'BTP Esempio', percentage: 100 },
    ]);
  });

  it('refuses a quota past the whole instrument, an empty name and an empty goalId', () => {
    expect(parseGoalProposal(JSON.stringify({ ...VALID, assignments: [{ assetName: 'ETF Mondo', percentage: 120 }] }))).toBeNull();
    expect(parseGoalProposal(JSON.stringify({ ...VALID, assignments: [{ assetName: ' ', percentage: 10 }] }))).toBeNull();
    expect(goalProposalSchema.safeParse({ ...VALID, goalId: '' }).success).toBe(false);
  });

  it('takes twenty instruments and refuses a twenty-first', () => {
    const assignments = Array.from({ length: 21 }, (_, index) => ({ assetName: `ETF ${index + 1}`, percentage: 10 }));
    expect(parseGoalProposal(JSON.stringify({ ...VALID, assignments }))).toBeNull();
    expect(parseGoalProposal(JSON.stringify({ ...VALID, assignments: assignments.slice(0, 20) }))?.assignments).toHaveLength(20);
  });

  it('keeps a proposal without them a plain creation', () => {
    const proposal = parseGoalProposal(JSON.stringify(VALID));
    expect(proposal?.goalId).toBeUndefined();
    expect(proposal?.assignments).toBeUndefined();
  });
});
