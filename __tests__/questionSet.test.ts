/**
 * The shared question contract (lib/utils/questionSet.ts, 2026-11-08): the bounds the schemas
 * hold, the lenient parser that drops what the API does not refuse (counts, reserved values,
 * repeated ids), the decline row appended once and last, the ONE describer of an answer and the
 * lines a prompt reads. Invented questions and figures.
 */

import { describe, expect, it } from 'vitest';
import {
  QUESTION_DECLINE_LABEL,
  QUESTION_DECLINE_VALUE,
  QUESTION_MAX_PER_ROUND,
  QUESTION_OTHER_VALUE,
  answerOf,
  describeAnswer,
  formatQuestionAnswersForPrompt,
  parseQuestionsLenient,
  questionAnswerSchema,
  questionSchema,
  questionSetSchema,
  withDeclineOption,
  type Question,
} from '@/lib/utils/questionSet';

const Q1: Question = {
  id: 'reddito',
  kind: 'single',
  text: 'Quanto dipendi dalla tua unica fonte di reddito?',
  why: "copre l'86% delle entrate",
  options: [
    { value: 'tutto', label: 'Interamente' },
    { value: 'meta', label: 'Circa metà' },
  ],
  allowOther: true,
};

const Q2: Question = {
  id: 'riserva',
  kind: 'multiple',
  text: 'Cosa copre la riserva di emergenza?',
  options: [
    { value: 'conti', label: 'I conti correnti' },
    { value: 'btp', label: 'I BTP a breve' },
    { value: 'niente', label: 'Niente di specifico' },
  ],
  allowOther: true,
};

const question = (id: string, overrides: Partial<Question> = {}): Question => ({ ...Q1, id, ...overrides });

describe('the schemas', () => {
  it(`refuses a set of ${QUESTION_MAX_PER_ROUND + 1} questions and a question with one option`, () => {
    expect(questionSetSchema.safeParse([question('a'), question('b'), question('c'), question('d')]).success).toBe(true);
    expect(questionSetSchema.safeParse([question('a'), question('b'), question('c'), question('d'), question('e')]).success).toBe(false);
    expect(questionSchema.safeParse({ ...Q1, options: [Q1.options[0]] }).success).toBe(false);
    expect(questionSchema.safeParse({ ...Q1, kind: 'ternary' }).success).toBe(false);
  });

  it('refuses an «Altro…» of 501 characters, accepts a blank one and an entity', () => {
    expect(questionAnswerSchema.safeParse({ questionId: 'reddito', value: { other: 'x'.repeat(501) } }).success).toBe(false);
    expect(questionAnswerSchema.safeParse({ questionId: 'reddito', value: { other: '' } }).success).toBe(true);
    expect(questionAnswerSchema.safeParse({ questionId: 'reddito', value: { entity: 'acc-2' } }).success).toBe(true);
    expect(questionAnswerSchema.safeParse({ questionId: 'reddito', value: QUESTION_DECLINE_VALUE }).success).toBe(true);
    expect(questionAnswerSchema.safeParse({ questionId: 'reddito', value: [] }).success).toBe(false);
  });
});

describe('parseQuestionsLenient', () => {
  it(`keeps ${QUESTION_MAX_PER_ROUND} of five and names the fifth`, () => {
    const { questions, refused } = parseQuestionsLenient([question('a'), question('b'), question('c'), question('d'), question('e')]);
    expect(questions.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(refused).toEqual([`domanda 4 (e): oltre le ${QUESTION_MAX_PER_ROUND} domande`]);
  });

  it('refuses a question that repeats an earlier id, keeping the first', () => {
    const { questions, refused } = parseQuestionsLenient([question('a'), question('a', { text: 'Altra.' })]);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe(Q1.text);
    expect(refused[0]).toMatch(/^domanda 1 \(a\): id già usato/);
  });

  it('removes a repeated option value and the reserved ones first, and refuses a question left with one option', () => {
    const repeated = question('a', { options: [{ value: 'si', label: 'Sì' }, { value: 'si', label: 'Ancora sì' }, { value: 'no', label: 'No' }] });
    const reserved = question('b', { options: [{ value: 'si', label: 'Sì' }, { value: QUESTION_DECLINE_VALUE, label: 'Non dico' }, { value: QUESTION_OTHER_VALUE, label: 'Altro' }] });
    const { questions, refused } = parseQuestionsLenient([repeated, reserved]);
    expect(questions.map((q) => q.options.map((o) => o.value))).toEqual([['si', 'no']]);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/^domanda 1 \(b\): options/);
  });

  it('refuses a question the schema refuses, with its reason, and answers empty for a non-list', () => {
    const { questions, refused } = parseQuestionsLenient([{ ...Q1, id: '' }, Q2]);
    expect(questions.map((q) => q.id)).toEqual(['riserva']);
    expect(refused[0]).toMatch(/^domanda 0 \(\): id/);
    expect(parseQuestionsLenient({ not: 'a list' })).toEqual({ questions: [], refused: ['not a list'] });
    expect(parseQuestionsLenient([])).toEqual({ questions: [], refused: [] });
  });
});

describe('withDeclineOption', () => {
  it('appends «Preferisco non dire» last, once', () => {
    const once = withDeclineOption(Q1);
    expect(once.options.at(-1)).toEqual({ value: QUESTION_DECLINE_VALUE, label: QUESTION_DECLINE_LABEL });
    expect(once.options).toHaveLength(3);
    expect(withDeclineOption(once)).toBe(once);
    expect(Q1.options).toHaveLength(2);
  });
});

describe('describeAnswer', () => {
  it('reads the five shapes, the decline before any string', () => {
    expect(describeAnswer(Q1, QUESTION_DECLINE_VALUE)).toBe(QUESTION_DECLINE_LABEL);
    expect(describeAnswer(Q1, 'meta')).toBe('Circa metà');
    expect(describeAnswer(Q1, 'ignota')).toBe('ignota');
    expect(describeAnswer(Q2, ['conti', 'btp'])).toBe('I conti correnti, I BTP a breve');
    expect(describeAnswer(Q1, { other: '  un fenicottero ' })).toBe('Altro: un fenicottero');
    expect(describeAnswer(Q1, { entity: 'acc-2' }, { 'acc-2': 'Conto ornitorinco' })).toBe('Conto ornitorinco');
    expect(describeAnswer(Q1, { entity: 'acc-2' })).toBe('acc-2');
  });

  it('is null for a blank «Altro…», a blank entity and an empty list: no answer yet', () => {
    expect(describeAnswer(Q1, { other: '   ' })).toBeNull();
    expect(describeAnswer(Q1, { entity: '' })).toBeNull();
    expect(describeAnswer(Q2, [])).toBeNull();
  });

  it('answerOf finds the entry or answers null', () => {
    expect(answerOf([{ questionId: 'reddito', value: 'tutto' }], 'reddito')).toBe('tutto');
    expect(answerOf([{ questionId: 'reddito', value: 'tutto' }], 'riserva')).toBeNull();
  });
});

describe('formatQuestionAnswersForPrompt', () => {
  it('prints one header per round, the questions with their why and answer, «non risposta» and «nessuna domanda»', () => {
    const text = formatQuestionAnswersForPrompt(
      [
        { note: 'Vedo un reddito concentrato.', questions: [Q1, Q2], answers: [{ questionId: 'reddito', value: QUESTION_DECLINE_VALUE }] },
        { note: 'Nulla da chiedere.', questions: [], answers: [] },
      ],
      'Tornata'
    );
    expect(text.split('\n')).toEqual([
      'Tornata 1 — nota del Consulente: «Vedo un reddito concentrato.»',
      `- Quanto dipendi dalla tua unica fonte di reddito? (perché: copre l'86% delle entrate) → ${QUESTION_DECLINE_LABEL}`,
      '- Cosa copre la riserva di emergenza? → non risposta',
      'Tornata 2 — nota del Consulente: «Nulla da chiedere.»',
      '- nessuna domanda',
    ]);
  });

  it('prints a blank «Altro…» as not answered', () => {
    const text = formatQuestionAnswersForPrompt([{ note: 'n', questions: [Q2], answers: [{ questionId: 'riserva', value: { other: '' } }] }], 'Tornata');
    expect(text).toContain('→ non risposta');
  });
});
