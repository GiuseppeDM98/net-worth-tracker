'use client';

/**
 * A choice as 44px rows — a radio or a checkbox, the label, a hint — never a dropdown for two or
 * three options (DESIGN.md → The Question-Card Rule). ONE module for the Consulente's path, the
 * Compravendita's screens and the interview to come (2026-11-07: the two `ChoiceRows`
 * copies merged here; the interview's question cards and the Assistente's cards read this contract).
 *
 * Single mode is the Radix `RadioGroup` (its own roving focus); multiple mode is a `role="group"`
 * of checkboxes made ONE Tab stop by `useRovingFocus` (AGENTS.md § Accessibility). An `exclusive`
 * option («Nessuna di queste») clears the others and is cleared by any other (decision 55). The
 * «Altro…» row opens a text field under its label while it is chosen — with no autofocus: Radix
 * selects a radio as the arrows reach it, and a focus jump would pull a keyboard reader out of
 * the group; the field is the next Tab stop.
 */

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';

export interface ChoiceListOption<T extends string> {
  value: T;
  label: string;
  /** The second line under the label. */
  hint?: string;
  /** Multiple mode: choosing it clears the others, choosing another clears it (decision 55). */
  exclusive?: boolean;
}

export const CHOICE_ROW_CLASS = 'flex items-start gap-3 px-4 py-3';

const GROUP_CLASS = 'divide-y divide-border rounded-xl border border-border';
const LABEL_CLASS = 'flex min-h-11 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 text-left desktop:min-h-0';
const TITLE_CLASS = 'text-[14px] font-medium text-foreground';
const HINT_CLASS = 'text-[13px] font-normal leading-[1.45] text-muted-foreground';
/** The «Altro…» field's height: the value of the Compravendita's FIELD_HEIGHT_CLASS, written here (a primitive imports nothing from components/assets/). */
const OTHER_FIELD_CLASS = 'mt-2 h-11 desktop:h-9';

export type ChoiceListProps<T extends string> = {
  name: string;
  /** The group's accessible name, required (the question's text inside a QuestionCard). */
  label: string;
  options: readonly ChoiceListOption<T>[];
  /** The «Altro…» row is the option whose value is `other.value`; its field shows while that row is chosen. */
  other?: { value: T; label: string; text: string; onTextChange: (text: string) => void };
} & (
  | { mode: 'single'; value: T | null; onChange: (value: T) => void }
  | { mode: 'multiple'; value: T[]; onChange: (value: T[]) => void }
);

/** The next array of a multiple list, in the options' order (decision 55). */
export function nextMultipleValue<T extends string>(options: readonly ChoiceListOption<T>[], current: readonly T[], toggled: T, checked: boolean): T[] {
  const option = options.find((candidate) => candidate.value === toggled);
  if (!checked) return options.filter((candidate) => current.includes(candidate.value) && candidate.value !== toggled).map((candidate) => candidate.value);
  if (option?.exclusive) return [toggled];
  return options.filter((candidate) => (current.includes(candidate.value) && !candidate.exclusive) || candidate.value === toggled).map((candidate) => candidate.value);
}

export function ChoiceList<T extends string>(props: ChoiceListProps<T>) {
  const { name, label, options, other } = props;
  // Called in both modes: a hook never sits behind a branch.
  const roving = useRovingFocus(options.length, 'vertical');
  const chosen = (value: T) => (props.mode === 'single' ? props.value === value : props.value.includes(value));

  const otherField = (option: ChoiceListOption<T>) =>
    other && option.value === other.value && chosen(option.value) ? (
      <Input className={OTHER_FIELD_CLASS} aria-label={other.label} value={other.text} onChange={(event) => other.onTextChange(event.target.value)} />
    ) : null;

  const rowLabel = (option: ChoiceListOption<T>, id: string) => (
    <Label htmlFor={id} className={LABEL_CLASS}>
      <span className={TITLE_CLASS}>{option.label}</span>
      {option.hint && <span className={HINT_CLASS}>{option.hint}</span>}
    </Label>
  );

  if (props.mode === 'single') {
    const { value, onChange } = props;
    return (
      <RadioGroup value={value ?? ''} onValueChange={(next) => onChange(next as T)} aria-label={label} className={GROUP_CLASS}>
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <div key={option.value} className={CHOICE_ROW_CLASS}>
              <RadioGroupItem value={option.value} id={id} className="mt-1" />
              <div className="flex min-w-0 flex-1 flex-col">
                {rowLabel(option, id)}
                {otherField(option)}
              </div>
            </div>
          );
        })}
      </RadioGroup>
    );
  }

  const { value, onChange } = props;
  return (
    <div role="group" aria-label={label} className={GROUP_CLASS} {...roving.containerProps}>
      {options.map((option, index) => {
        const id = `${name}-${option.value}`;
        return (
          <div key={option.value} className={CHOICE_ROW_CLASS}>
            <Checkbox
              id={id}
              className="mt-1"
              checked={value.includes(option.value)}
              onCheckedChange={(checked) => onChange(nextMultipleValue(options, value, option.value, checked === true))}
              {...roving.itemProps(index)}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              {rowLabel(option, id)}
              {otherField(option)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
