'use client';

/**
 * ONE question a model asks, as a card (DESIGN.md § 5 → The Question-Card Rule, 2026-11-08): the
 * sub-eyebrow «Il Consulente chiede · i di n» in the AI accent, the question, the figure that
 * prompted it (`why`), and a `ChoiceList` of its options with the two rows the app adds — «Altro…»
 * (every question with `allowOther`) and «Preferisco non dire», last — both `exclusive` in a
 * multiple question (decision 55). The card is what the model WROTE, so it wears the generated
 * surface (the 1px accent border, the glow on hover and while a radio inside has the keyboard
 * focus); never `bg-card`, never a button: the scene's footer owns the one primary of a round
 * (decision 38). Shared with the Assistente's in-chat questions, whose `otherSelect` turns the
 * «Altro…» row into a pick among the app's entities.
 *
 * The answer maps onto the list's value and back: the decline value is tested before any string
 * is read as an option (`describeAnswer` does the same), «Altro…» is `{ other }` — blank while the
 * user types, which keeps the row chosen — or `{ entity }` with `otherSelect`.
 */

import { useId } from 'react';
import { ChoiceList, type ChoiceListOption } from '@/components/ui/choice-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import {
  QUESTION_DECLINE_VALUE,
  QUESTION_OTHER_LABEL,
  QUESTION_OTHER_VALUE,
  withDeclineOption,
  type Question,
  type QuestionAnswerValue,
} from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';

export interface QuestionCardProps {
  question: Question;
  /** 1-based, for the eyebrow «Il Consulente chiede · {index} di {total}». */
  index: number;
  total: number;
  answer: QuestionAnswerValue | null;
  onAnswer: (value: QuestionAnswerValue) => void;
  /** Replaces the default eyebrow. */
  eyebrow?: string;
  /** «Preferisco non dire» as the last row; default true. */
  decline?: boolean;
  /** The «Altro…» row picks one of these instead of typing (the Assistente's entity questions). */
  otherSelect?: { label: string; items: readonly { id: string; name: string }[] };
}

const OTHER_SELECT_CLASS = 'mt-2 h-11 w-full desktop:h-9';

function isOther(answer: QuestionAnswerValue | null): answer is { other: string } | { entity: string } {
  return answer !== null && typeof answer === 'object' && !Array.isArray(answer);
}

/** The list's value for an answer: the reserved rows for the decline and «Altro…», the options as they are. */
function toListValue(answer: QuestionAnswerValue | null): string[] {
  if (answer === null) return [];
  if (answer === QUESTION_DECLINE_VALUE) return [QUESTION_DECLINE_VALUE];
  if (isOther(answer)) return [QUESTION_OTHER_VALUE];
  return Array.isArray(answer) ? answer : [answer];
}

export function QuestionCard({ question, index, total, answer, onAnswer, eyebrow, decline = true, otherSelect }: QuestionCardProps) {
  const name = `${useId()}-${question.id}`;
  const base = decline ? withDeclineOption(question).options : question.options;
  // «Altro…» goes before «Preferisco non dire», which stays last.
  const options: ChoiceListOption<string>[] = base.flatMap((option) => {
    if (option.value === QUESTION_DECLINE_VALUE) {
      return [...(question.allowOther ? [{ value: QUESTION_OTHER_VALUE, label: QUESTION_OTHER_LABEL, exclusive: true }] : []), { ...option, exclusive: true }];
    }
    return [option];
  });
  if (question.allowOther && !options.some((option) => option.value === QUESTION_OTHER_VALUE)) {
    options.push({ value: QUESTION_OTHER_VALUE, label: QUESTION_OTHER_LABEL, exclusive: true });
  }

  const otherBlank: QuestionAnswerValue = otherSelect ? { entity: '' } : { other: '' };
  /** A chosen row back to an answer value: the reserved rows first, then the option. */
  const fromRow = (value: string): QuestionAnswerValue => (value === QUESTION_DECLINE_VALUE ? QUESTION_DECLINE_VALUE : value === QUESTION_OTHER_VALUE ? otherBlank : value);
  const fromList = (values: string[]): QuestionAnswerValue => {
    if (values.includes(QUESTION_DECLINE_VALUE)) return QUESTION_DECLINE_VALUE;
    if (values.includes(QUESTION_OTHER_VALUE)) return otherBlank;
    return values;
  };

  const listValue = toListValue(answer);
  const otherChosen = listValue.includes(QUESTION_OTHER_VALUE);
  const otherText = answer !== null && isOther(answer) && 'other' in answer ? answer.other : '';
  const entityId = answer !== null && isOther(answer) && 'entity' in answer ? answer.entity : '';
  const other = otherSelect
    ? undefined
    : { value: QUESTION_OTHER_VALUE, label: `${QUESTION_OTHER_LABEL.replace('…', '')} — ${question.text}`, text: otherText, onTextChange: (text: string) => onAnswer({ other: text.slice(0, 500) }) };

  return (
    <div className={cn('rounded-xl border p-4 desktop:p-5', AI_GENERATED_SURFACE_CLASS)} data-question-card={question.id}>
      <p className={cn(TILE_SUB_EYEBROW_CLASS, AI_GENERATED_EYEBROW_CLASS)}>{eyebrow ?? `Il Consulente chiede · ${index} di ${total}`}</p>
      <p className="mt-2 text-[16px] font-medium leading-[1.4] text-foreground desktop:text-[20px]">{question.text}</p>
      {question.why && <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{question.why}</p>}
      <div className="mt-3">
        {question.kind === 'single' ? (
          <ChoiceList mode="single" name={name} label={question.text} options={options} value={listValue[0] ?? null} onChange={(value) => onAnswer(fromRow(value))} other={other} />
        ) : (
          <ChoiceList mode="multiple" name={name} label={question.text} options={options} value={listValue} onChange={(values) => onAnswer(fromList(values))} other={other} />
        )}
      </div>
      {otherSelect && otherChosen && (
        <Select value={entityId} onValueChange={(id) => onAnswer({ entity: id })}>
          <SelectTrigger aria-label={otherSelect.label} className={OTHER_SELECT_CLASS}>
            <SelectValue placeholder={otherSelect.label} />
          </SelectTrigger>
          <SelectContent>
            {otherSelect.items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
