/**
 * ONE question schema for every surface where a model asks the user something with options
 * (the interview precedes the strategy, 2026-11-01; shared with the Assistente's in-chat
 * questions): a question is `id`, `kind` (one answer or several), `text`, an optional `why`
 * (what in the data prompted it), 2–4 options and `allowOther`. The app adds two rows of its
 * own to every card — «Altro…» and «Preferisco non dire» — whose values are RESERVED: a model
 * that writes them as an option loses that option (`parseQuestionsLenient`).
 *
 * Pure and client-safe: the parser, the describer of an answer and the prompt formatter are the
 * single source of their rules for the server (the round's parser, the prompts), the scene, the
 * report's «Il colloquio» page and the chat's message.
 *
 * The API keeps only part of a zod schema in a structured output (the types, the required keys,
 * `additionalProperties: false`): every count, length and enum below is enforced HERE, by
 * `parseQuestionsLenient`, not by the wire.
 */

import { z } from 'zod';

export const QUESTION_MAX_PER_ROUND = 4;
export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 4;
/** The app's own rows, never the model's: an option using either value is removed by the parser. */
export const QUESTION_DECLINE_VALUE = '__decline__';
export const QUESTION_DECLINE_LABEL = 'Preferisco non dire';
export const QUESTION_OTHER_VALUE = '__other__';
export const QUESTION_OTHER_LABEL = 'Altro…';

export const questionOptionSchema = z.object({ value: z.string().min(1).max(40), label: z.string().min(1).max(80) });
export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['single', 'multiple']),
  text: z.string().min(1).max(240),
  /** What in the data prompted it; the card prints it under the question. Required on the Consulente's wire. */
  why: z.string().min(1).max(240).optional(),
  options: z.array(questionOptionSchema).min(QUESTION_OPTIONS_MIN).max(QUESTION_OPTIONS_MAX),
  allowOther: z.boolean(),
});
export const questionSetSchema = z.array(questionSchema).max(QUESTION_MAX_PER_ROUND);
export const questionAnswerSchema = z.object({
  questionId: z.string().min(1).max(40),
  value: z.union([
    z.string().min(1).max(40), // an option's value, or QUESTION_DECLINE_VALUE
    z.array(z.string().min(1).max(40)).min(1).max(QUESTION_OPTIONS_MAX),
    z.object({ other: z.string().max(500) }), // «Altro…» as typed: blank while the user types
    z.object({ entity: z.string().max(128) }), // an id picked from `otherSelect` (the chat's entity questions)
  ]),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionAnswerValue = string | string[] | { other: string } | { entity: string } | typeof QUESTION_DECLINE_VALUE;
export type QuestionAnswer = { questionId: string; value: QuestionAnswerValue };

const RESERVED_VALUES = new Set<string>([QUESTION_DECLINE_VALUE, QUESTION_OTHER_VALUE]);

function issuesOf(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

/** The options of a raw question without the ones the app reserves and without a repeated value (the first stays). */
function withoutReservedOptions(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const options = (item as { options?: unknown }).options;
  if (!Array.isArray(options)) return item;
  const seen = new Set<string>();
  const kept = options.filter((option) => {
    const value = (option as { value?: unknown } | null)?.value;
    if (typeof value !== 'string') return true; // left to the schema, which refuses it
    if (RESERVED_VALUES.has(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  return { ...(item as object), options: kept };
}

/**
 * Reads a list of questions LENIENTLY, in order: a reserved or repeated option is removed first,
 * then the question is validated; one that fails, or repeats an earlier kept `id`, is refused;
 * once `QUESTION_MAX_PER_ROUND` are kept every further one is refused. `refused` names each one
 * (`domanda {index} ({id}): {reason}`) for the log. Not a list → nothing kept, one refusal.
 */
export function parseQuestionsLenient(input: unknown): { questions: Question[]; refused: string[] } {
  if (!Array.isArray(input)) return { questions: [], refused: ['not a list'] };
  const questions: Question[] = [];
  const refused: string[] = [];
  const ids = new Set<string>();
  input.forEach((item, index) => {
    const rawId = (item as { id?: unknown } | null)?.id;
    const label = `domanda ${index} (${typeof rawId === 'string' ? rawId : '?'})`;
    if (questions.length >= QUESTION_MAX_PER_ROUND) {
      refused.push(`${label}: oltre le ${QUESTION_MAX_PER_ROUND} domande`);
      return;
    }
    const parsed = questionSchema.safeParse(withoutReservedOptions(item));
    if (!parsed.success) {
      refused.push(`${label}: ${issuesOf(parsed.error)}`);
      return;
    }
    if (ids.has(parsed.data.id)) {
      refused.push(`${label}: id già usato nella tornata`);
      return;
    }
    ids.add(parsed.data.id);
    questions.push(parsed.data);
  });
  return { questions, refused };
}

/** The answer given to a question, or null when there is none. */
export function answerOf(answers: readonly QuestionAnswer[], questionId: string): QuestionAnswerValue | null {
  return answers.find((answer) => answer.questionId === questionId)?.value ?? null;
}

/**
 * The question with «Preferisco non dire» as its LAST option, for display only: its result may
 * hold `QUESTION_OPTIONS_MAX + 1` options and is never validated again. Idempotent.
 */
export function withDeclineOption(question: Question): Question {
  if (question.options.some((option) => option.value === QUESTION_DECLINE_VALUE)) return question;
  return { ...question, options: [...question.options, { value: QUESTION_DECLINE_VALUE, label: QUESTION_DECLINE_LABEL }] };
}

/**
 * THE describer of an answer, for the prompt, the tile and the chat's message. The decline is
 * tested FIRST (its literal is absorbed by `string` in the type); a string is its option's label
 * (the raw value when the option is unknown); a list is the labels joined by «, »; «Altro…» is
 * «Altro: {text}»; an entity is its label from `labels`, else its id. A blank «Altro…» or entity
 * pick is NULL — no answer yet — and every caller treats null as unanswered.
 */
export function describeAnswer(question: Question, answer: QuestionAnswerValue, labels?: Record<string, string>): string | null {
  if (answer === QUESTION_DECLINE_VALUE) return QUESTION_DECLINE_LABEL;
  const labelOf = (value: string) => question.options.find((option) => option.value === value)?.label ?? value;
  if (typeof answer === 'string') return labelOf(answer);
  if (Array.isArray(answer)) return answer.length === 0 ? null : answer.map(labelOf).join(', ');
  if ('other' in answer) {
    const text = answer.other.trim();
    return text === '' ? null : `Altro: ${text}`;
  }
  if (answer.entity === '') return null;
  return labels?.[answer.entity] ?? answer.entity;
}

/**
 * The rounds as a prompt reads them: per round `{header} {i+1} — nota del Consulente: «{note}»`,
 * then one line per question `- {text} (perché: {why}) → {answer}` — «non risposta» when there is
 * none — or `- nessuna domanda`.
 */
export function formatQuestionAnswersForPrompt(
  rounds: ReadonlyArray<{ note: string; questions: Question[]; answers: QuestionAnswer[] }>,
  header: string
): string {
  const lines: string[] = [];
  rounds.forEach((round, index) => {
    lines.push(`${header} ${index + 1} — nota del Consulente: «${round.note}»`);
    if (round.questions.length === 0) {
      lines.push('- nessuna domanda');
      return;
    }
    for (const question of round.questions) {
      const answer = answerOf(round.answers, question.id);
      const described = answer === null ? null : describeAnswer(question, answer);
      lines.push(`- ${question.text}${question.why ? ` (perché: ${question.why})` : ''} → ${described ?? 'non risposta'}`);
    }
  });
  return lines.join('\n');
}

// ── The Assistente's in-chat questions (2026-11) ──

/** The fenced language of a question in an Assistente message: ONE question object per block. */
export const ASSISTANT_QUESTION_LANGUAGE = 'assistant-question';
/** The question blocks one message may carry: a block past the second renders as nothing (the prompt says so too). */
export const ASSISTANT_QUESTION_MAX_PER_MESSAGE = 2;
/** At most three options on a question about an account, a centre, a member or a loan; «Altro…» lists the rest. */
const ENTITY_QUESTION_OPTIONS_MAX = 3;

export type EntityQuestionKind = 'account' | 'center' | 'member' | 'loan' | 'category';
const ENTITY_KINDS = new Set<string>(['account', 'center', 'member', 'loan', 'category']);

/**
 * The entity a question is about, read from its `id`'s segment before the first «:» («account:from»
 * → account); null for any other question. Its options' values are the entities' ids.
 */
export function isEntityQuestion(question: Pick<Question, 'id'>): EntityQuestionKind | null {
  const head = question.id.split(':')[0];
  return question.id.includes(':') && ENTITY_KINDS.has(head) ? (head as EntityQuestionKind) : null;
}

/**
 * Why an entity question may not render (the plain code block takes its place); `[]` for one that
 * may, and for every other question. One answer only, «Altro…» always there (it is how the user
 * reaches an entity the model did not list), and at most three options except on a category.
 */
export function entityQuestionProblems(question: Question): string[] {
  const kind = isEntityQuestion(question);
  if (kind === null) return [];
  const problems: string[] = [];
  if (question.kind === 'multiple') problems.push("domanda su un'entità: una sola scelta");
  if (!question.allowOther) problems.push('domanda su un\'entità: "allowOther" deve essere true');
  if (kind !== 'category' && question.options.length > ENTITY_QUESTION_OPTIONS_MAX) problems.push(`domanda su un'entità: al più ${ENTITY_QUESTION_OPTIONS_MAX} opzioni`);
  return problems;
}

/** Whether the block of this rank among the message's question blocks renders: the first two only. */
export function keepQuestionBlock(ordinal: number): boolean {
  return ordinal < ASSISTANT_QUESTION_MAX_PER_MESSAGE;
}

/**
 * One answer as a line of the user's reply: «{text} → {label} [id]» for an entity (picked among
 * the options or from the Select), «{text} → Altro: …», «{text} → a, b», «{text} → preferisco non
 * dire». The id travels in square brackets so the model copies it, not the label. Null when the
 * answer is not given yet.
 */
export function formatQuestionAnswerAsMessage(question: Question, answer: QuestionAnswerValue, labels: Record<string, string>): string | null {
  // The decline FIRST: its literal is a string, and would read as an unknown option's value.
  if (answer === QUESTION_DECLINE_VALUE) return `${question.text} → preferisco non dire`;
  if (typeof answer === 'object' && !Array.isArray(answer) && 'entity' in answer) {
    if (answer.entity === '') return null;
    return `${question.text} → ${labels[answer.entity] ?? answer.entity} [${answer.entity}]`;
  }
  if (typeof answer === 'string' && isEntityQuestion(question) !== null) {
    const option = question.options.find((candidate) => candidate.value === answer);
    return `${question.text} → ${option?.label ?? answer} [${answer}]`;
  }
  const described = describeAnswer(question, answer, labels);
  return described === null ? null : `${question.text} → ${described}`;
}

/** The whole reply: one line per question, in order; null while any of them is unanswered. */
export function formatQuestionAnswersAsMessage(
  entries: ReadonlyArray<{ question: Question; answer: QuestionAnswerValue; labels: Record<string, string> }>
): string | null {
  const lines = entries.map(({ question, answer, labels }) => formatQuestionAnswerAsMessage(question, answer, labels));
  return lines.length === 0 || lines.some((line) => line === null) ? null : lines.join('\n');
}
