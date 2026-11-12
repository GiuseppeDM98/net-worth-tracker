/**
 * The Consulente's contract (lib/utils/allocationAdviceProposal.ts): the answers' schema, the
 * proposal's schema and its sum rules, the candidates' schema, the fenced block lifted out of
 * the prose. Invented round figures throughout.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_PROPOSAL_BLOCK,
  allocationAdviceAnswerSchema,
  allocationAdviceAnswersSchema,
  allocationAdviceProposalSchema,
  instrumentCandidatesSchema,
  parseAllocationAnswer,
  parseFencedBlock,
  parseInstrumentCandidates,
  parseInstrumentCandidatesLenient,
  stripFencedBlocks,
  interviewRoundSchema,
  interviewSchema,
  parseInterviewRound,
} from '@/lib/utils/allocationAdviceProposal';
import { z } from 'zod';
import { QUESTION_DECLINE_VALUE } from '@/lib/utils/questionSet';

const ANSWERS = {
  age: 35,
  horizonYears: 20,
  lossTolerance: 'media',
  exchange: 'Borsa Italiana (Milano, XMIL)',
  broker: 'Broker X',
  distributionPolicy: 'accumulazione',
  goals: [{ goalId: 'g1', name: 'Casa', targetAmount: 50000, targetDateIso: '2031-06-01', priority: 'alta', keep: true, note: '' }],
  goalsReflectReality: true,
  newGoalsNote: '',
  homeRole: 'excluded',
  pensionRole: 'frozen',
  privateEquityRole: 'frozen',
  keepAssets: ['ETF Mondo'],
  avoid: '',
  esg: false,
  notes: '',
};

const PROPOSAL = {
  summary: 'Più obbligazioni, meno liquidità.',
  classes: [
    { assetClass: 'equity', targetPercentage: 60, rationale: 'Orizzonte lungo.', subTargets: [{ name: 'All World', targetPercentage: 100, instrument: 'ETF Mondo' }] },
    { assetClass: 'bonds', targetPercentage: 40, rationale: 'Ammortizza.', subTargets: [] },
    { assetClass: 'cash', targetPercentage: 0, fixedAmount: 10000, rationale: 'Riserva.', subTargets: [] },
  ],
  assetRoles: [{ assetName: 'Fondo pensione', role: 'frozen', reason: 'Conta nella base.' }],
  goals: [{ goalId: 'g1', name: 'Casa', targetAmount: 50000, targetDateIso: '2031-06-01', priority: 'alta', assignments: [{ assetName: 'ETF Mondo', percentage: 40 }], rationale: 'Scadenza media.' }],
  reviewByIso: '2028-10-20',
  reviewReason: 'Due anni, o prima se la casa si avvicina.',
  risks: ['Un ribasso azionario del 30%.'],
};

describe('allocationAdviceAnswersSchema', () => {
  it('accepts the answers the screens type', () => {
    expect(allocationAdviceAnswersSchema.safeParse(ANSWERS).success).toBe(true);
  });

  it('refuses an age outside 18–100 and a goal date that is not ISO', () => {
    expect(allocationAdviceAnswersSchema.safeParse({ ...ANSWERS, age: 12 }).success).toBe(false);
    expect(allocationAdviceAnswersSchema.safeParse({ ...ANSWERS, goals: [{ ...ANSWERS.goals[0], targetDateIso: '01/06/2031' }] }).success).toBe(false);
  });
});

describe('allocationAdviceProposalSchema', () => {
  it('accepts a proposal whose percentage classes sum to 100 beside a fixed cash reserve', () => {
    expect(allocationAdviceProposalSchema.safeParse(PROPOSAL).success).toBe(true);
  });

  it('refuses classes that do not sum to 100', () => {
    const off = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], targetPercentage: 50 }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(off).success).toBe(false);
  });

  it('tolerates half a point of rounding, no more', () => {
    const near = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], targetPercentage: 60.3 }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(near).success).toBe(true);
    const far = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], targetPercentage: 61 }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(far).success).toBe(false);
  });

  it('refuses sub-targets that do not sum to 100 inside their class, and a class listed twice', () => {
    const subs = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], subTargets: [{ name: 'A', targetPercentage: 60 }] }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(subs).success).toBe(false);
    const twice = { ...PROPOSAL, classes: [PROPOSAL.classes[0], { ...PROPOSAL.classes[0], targetPercentage: 0 }, { ...PROPOSAL.classes[1], targetPercentage: 40 }] };
    expect(allocationAdviceProposalSchema.safeParse(twice).success).toBe(false);
  });

  it('refuses a class outside the app\'s enumeration and a goal allocation that does not sum to 100', () => {
    expect(allocationAdviceProposalSchema.safeParse({ ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], assetClass: 'gold', targetPercentage: 100 }] }).success).toBe(false);
    const goal = { ...PROPOSAL.goals[0], recommendedAllocation: { equity: 70, bonds: 20 } };
    expect(allocationAdviceProposalSchema.safeParse({ ...PROPOSAL, goals: [goal] }).success).toBe(false);
  });
});

describe('instrumentCandidatesSchema', () => {
  it('accepts a sleeve with verified candidates and a caveat', () => {
    const candidates = {
      sleeves: [
        {
          assetClass: 'equity',
          subTarget: 'All World',
          candidates: [{ name: 'ETF Mondo', isin: 'IE00B0000001', ticker: 'MONDO', exchange: 'Borsa Italiana', policy: 'accumulazione', ter: 0.2, alreadyHeld: true, note: 'Già in portafoglio.' }],
          caveat: 'TER non verificato per il secondo candidato.',
        },
      ],
    };
    expect(instrumentCandidatesSchema.safeParse(candidates).success).toBe(true);
  });

  it("takes a bond ETF's duration in years, 0–40, and refuses one beyond (2026-11-08)", () => {
    const sleeve = (duration: number) => ({ sleeves: [{ assetClass: 'bonds', subTarget: 'Euro 1-3 anni', candidates: [{ name: 'ETF Bond Breve', exchange: 'Borsa Italiana', note: 'ok', duration }] }] });
    expect(instrumentCandidatesSchema.safeParse(sleeve(1.9)).success).toBe(true);
    expect(instrumentCandidatesSchema.safeParse(sleeve(0)).success).toBe(true);
    expect(instrumentCandidatesSchema.safeParse(sleeve(41)).success).toBe(false);
  });
});

describe('parseFencedBlock', () => {
  const schema = z.object({ a: z.number() });

  it('lifts the LAST block of the language out of the prose', () => {
    const text = 'Prima bozza:\n```x\n{"a": 1}\n```\nRivista:\n```x\n{"a": 2}\n```\nFine.';
    expect(parseFencedBlock(text, 'x', schema)).toEqual({ a: 2 });
  });

  it('answers null without a block, on broken JSON and on a shape the schema refuses', () => {
    expect(parseFencedBlock('nessun blocco', 'x', schema)).toBeNull();
    expect(parseFencedBlock('```x\n{"a": \n```', 'x', schema)).toBeNull();
    expect(parseFencedBlock('```x\n{"b": 1}\n```', 'x', schema)).toBeNull();
  });

  it('parses the candidates through their own helper', () => {
    expect(parseInstrumentCandidates('```instrument-candidates\n{"sleeves": []}\n```')).toEqual({ sleeves: [] });
  });

  it('strips the structure blocks from the prose a reader is shown', () => {
    const text = `Prima.\n\n\`\`\`${ALLOCATION_PROPOSAL_BLOCK}\n{}\n\`\`\`\n\n\nDopo.`;
    expect(stripFencedBlocks(text)).toBe('Prima.\n\nDopo.');
  });
});

describe('parseAllocationAnswer — the structured answer of the strategy and the review (2026-10-23)', () => {
  it('reads the markdown and the proposal', () => {
    const parsed = parseAllocationAnswer(JSON.stringify({ markdown: '  # Report\nTesto.  ', proposal: PROPOSAL }));
    expect(parsed?.markdown).toBe('# Report\nTesto.');
    expect(parsed?.proposal?.summary).toBe('Più obbligazioni, meno liquidità.');
    expect(parsed?.refused).toEqual([]);
  });

  it('keeps the markdown and says why when the proposal breaks a sum the API does not enforce', () => {
    const broken = { ...PROPOSAL, classes: PROPOSAL.classes.slice(0, 1) };
    const parsed = parseAllocationAnswer(JSON.stringify({ markdown: 'Testo.', proposal: broken }));
    expect(parsed?.markdown).toBe('Testo.');
    expect(parsed?.proposal).toBeNull();
    expect(parsed?.refused.join(' ')).toMatch(/sommare a 100/);
  });

  it('answers null for anything that is not the answer object', () => {
    expect(parseAllocationAnswer('Solo testo.')).toBeNull();
    expect(parseAllocationAnswer('{"proposal": {}}')).toBeNull();
    expect(parseAllocationAnswer('null')).toBeNull();
  });

  it('takes a goal mix as one optional key per class, and refuses a key that is not a class', () => {
    const goal = { name: 'Casa', priority: 'alta', assignments: [], rationale: '' };
    const withMix = { ...PROPOSAL, goals: [{ ...goal, recommendedAllocation: { bonds: 70, cash: 30 } }] };
    expect(allocationAdviceProposalSchema.safeParse(withMix).success).toBe(true);
    const offSum = { ...PROPOSAL, goals: [{ ...goal, recommendedAllocation: { bonds: 70 } }] };
    expect(allocationAdviceProposalSchema.safeParse(offSum).success).toBe(false);
    const stray = allocationAdviceProposalSchema.safeParse({ ...PROPOSAL, goals: [{ ...goal, recommendedAllocation: { bonds: 70, cash: 30, oro: 0 } }] });
    expect(stray.success && stray.data.goals[0].recommendedAllocation).toEqual({ bonds: 70, cash: 30 });
  });

  it('reads a goal mix sent as pairs in any order back into the stored object', () => {
    const goal = { name: 'Casa', priority: 'alta', assignments: [], rationale: '' };
    const answer = (recommendedAllocation: unknown) =>
      parseAllocationAnswer(JSON.stringify({ markdown: 'Testo.', proposal: { ...PROPOSAL, goals: [{ ...goal, recommendedAllocation }] } }));
    const pairs = [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'trendFollowing', percentage: 15 }, { assetClass: 'bonds', percentage: 25 }];
    expect(answer(pairs)?.proposal?.goals[0].recommendedAllocation).toEqual({ equity: 60, bonds: 25, trendFollowing: 15 });
    expect(answer([])?.proposal?.goals[0].recommendedAllocation).toBeUndefined();
    expect(answer([{ assetClass: 'equity', percentage: 50 }, { assetClass: 'equity', percentage: 50 }])?.proposal).toBeNull();
    expect(answer([{ assetClass: 'equity', percentage: 80 }])?.refused.join(' ')).toMatch(/sommare a 100/);
  });

  it('sends the goal mix as a list on the wire, so its order is free', () => {
    const wire = z.toJSONSchema(allocationAdviceAnswerSchema) as unknown as {
      properties: { proposal: { properties: { goals: { items: { properties: { recommendedAllocation: { type?: string } } } } } } };
    };
    expect(wire.properties.proposal.properties.goals.items.properties.recommendedAllocation.type).toBe('array');
  });
});

describe('parseInstrumentCandidatesLenient (2026-10-20)', () => {
  const good = { assetClass: 'equity', subTarget: 'All World', candidates: [{ name: 'ETF Mondo', exchange: 'Borsa Italiana', note: 'ok' }] };

  it('keeps the sleeves that parse when one is written wrong, and names the refused', () => {
    const bad = { assetClass: 'moon', subTarget: 'Luna', candidates: [] };
    const text = '```instrument-candidates\n' + JSON.stringify({ sleeves: [good, bad] }) + '\n```';
    const { candidates, refused } = parseInstrumentCandidatesLenient(text);
    expect(candidates?.sleeves.map((s) => s.subTarget)).toEqual(['All World']);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/sleeve 1/);
  });

  it('keeps a sleeve whose one candidate is wrong, with the candidates that parse', () => {
    const mixed = { ...good, candidates: [good.candidates[0], { name: '', exchange: 'X', note: 'senza nome' }] };
    const { candidates, refused } = parseInstrumentCandidatesLenient('```instrument-candidates\n' + JSON.stringify({ sleeves: [mixed] }) + '\n```');
    expect(candidates?.sleeves[0].candidates.map((c) => c.name)).toEqual(['ETF Mondo']);
    expect(refused[0]).toMatch(/1 candidati rifiutati/);
  });

  it('is the plain parse when the whole block is right, and null without a block', () => {
    expect(parseInstrumentCandidatesLenient('```instrument-candidates\n' + JSON.stringify({ sleeves: [good] }) + '\n```')).toEqual({ candidates: { sleeves: [good] }, refused: [] });
    expect(parseInstrumentCandidatesLenient('nessun blocco')).toEqual({ candidates: null, refused: [] });
    expect(parseInstrumentCandidatesLenient('```instrument-candidates\n{"sleeves": 3}\n```').candidates).toBeNull();
  });
});

// ── The interview round (2026-11-08) ──────────────────────────────────────────────────
describe('parseInterviewRound (lenient: the API keeps only part of the schema, 2026-11-08)', () => {
  const Q = (id: string) => ({ id, kind: 'single', text: `Domanda ${id}?`, why: "l'86% delle entrate", options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }], allowOther: true });
  const roundText = (questions: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ note: 'Vedo un reddito concentrato.', satisfied: false, questions, ...extra });

  it('reads the note, satisfied and the questions, forcing allowOther', () => {
    const { round, refused } = parseInterviewRound(roundText([{ ...Q('a'), allowOther: false }]));
    expect(round).toMatchObject({ note: 'Vedo un reddito concentrato.', satisfied: false });
    expect(round?.questions[0].allowOther).toBe(true);
    expect(refused).toEqual([]);
  });

  it('keeps four of five questions, refuses a one-option question and a repeated id, leniently', () => {
    const five = parseInterviewRound(roundText([Q('a'), Q('b'), Q('c'), Q('d'), Q('e')]));
    expect(five.round?.questions.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(five.refused).toHaveLength(1);
    const oneOption = parseInterviewRound(roundText([{ ...Q('a'), options: [{ value: 'si', label: 'Sì' }] }, Q('b')]));
    expect(oneOption.round?.questions.map((q) => q.id)).toEqual(['b']);
    const twice = parseInterviewRound(roundText([Q('a'), Q('a')]));
    expect(twice.round?.questions).toHaveLength(1);
    expect(twice.refused[0]).toMatch(/id già usato/);
    const reserved = parseInterviewRound(roundText([{ ...Q('a'), options: [...Q('a').options, { value: QUESTION_DECLINE_VALUE, label: 'Non dico' }] }]));
    expect(reserved.round?.questions[0].options.map((o) => o.value)).toEqual(['si', 'no']);
  });

  it('cuts a note over 600 characters at 600 and says so; a round with no questions key is a round with none', () => {
    const long = parseInterviewRound(JSON.stringify({ note: 'x'.repeat(700), satisfied: true, questions: [] }));
    expect(long.round?.note).toHaveLength(600);
    expect(long.refused[0]).toMatch(/^note: 700 caratteri, tagliata a 600/);
    expect(parseInterviewRound(JSON.stringify({ note: 'n', satisfied: true })).round?.questions).toEqual([]);
  });

  it('is null when the text is not JSON, not an object, or note / satisfied are missing', () => {
    expect(parseInterviewRound('Solo testo.').round).toBeNull();
    expect(parseInterviewRound('[1]').round).toBeNull();
    expect(parseInterviewRound(JSON.stringify({ satisfied: true, questions: [] })).round).toBeNull();
    expect(parseInterviewRound(JSON.stringify({ note: '  ', satisfied: true, questions: [] })).round).toBeNull();
    expect(parseInterviewRound(JSON.stringify({ note: 'n', satisfied: 'yes', questions: [] })).round).toBeNull();
  });

  it('the wire schema lists note, satisfied and questions in that order, why required', () => {
    expect(Object.keys(interviewRoundSchema.shape)).toEqual(['note', 'satisfied', 'questions']);
    expect(interviewRoundSchema.safeParse({ note: 'n', satisfied: false, questions: [{ ...Q('a'), why: undefined }] }).success).toBe(false);
    expect(interviewRoundSchema.safeParse({ note: 'n', satisfied: false, questions: [Q('a')] }).success).toBe(true);
  });
});

describe('interviewSchema (the body, the draft and the document)', () => {
  const stored = (askedAt: unknown) => ({ note: 'n', satisfied: false, questions: [], answers: [], model: 'opus-finto', askedAt });

  it('reads an ISO askedAt as a Date and refuses four rounds', () => {
    const parsed = interviewSchema.safeParse({ rounds: [stored('2026-11-08T11:00:00.000Z')], skipped: false });
    expect(parsed.success && parsed.data.rounds[0].askedAt).toBeInstanceOf(Date);
    expect(interviewSchema.safeParse({ rounds: [stored(new Date()), stored(new Date()), stored(new Date()), stored(new Date())], skipped: false }).success).toBe(false);
    expect(interviewSchema.safeParse({ rounds: [], skipped: true }).success).toBe(true);
  });

  it('refuses an «Altro…» of 501 characters in an answer', () => {
    const round = { ...stored(new Date()), answers: [{ questionId: 'a', value: { other: 'x'.repeat(501) } }] };
    expect(interviewSchema.safeParse({ rounds: [round], skipped: false }).success).toBe(false);
    const fine = { ...stored(new Date()), answers: [{ questionId: 'a', value: { other: 'fenicottero' } }] };
    expect(interviewSchema.safeParse({ rounds: [fine], skipped: false }).success).toBe(true);
  });
});
