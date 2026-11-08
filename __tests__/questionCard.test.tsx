/**
 * `QuestionCard` (components/ui/question-card.tsx, 2026-11-08, DESIGN.md § 5 → The Question-Card
 * Rule): the sub-eyebrow «Il Consulente chiede · i di n», the question and its why, a ChoiceList
 * with «Altro…» and «Preferisco non dire» appended in that order — exclusive in a multiple
 * question (decision 55) — the answer mapped to the list and back, the «Altro…» text as `{ other }`,
 * the `otherSelect` pick as `{ entity }`, the generated surface, and no button inside.
 * Invented questions.
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionCard } from '@/components/ui/question-card';
import { AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { QUESTION_DECLINE_VALUE, type Question, type QuestionAnswerValue } from '@/lib/utils/questionSet';

const SINGLE: Question = {
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

const MULTIPLE: Question = {
  id: 'riserva',
  kind: 'multiple',
  text: 'Cosa copre la riserva di emergenza?',
  options: [
    { value: 'conti', label: 'I conti correnti' },
    { value: 'btp', label: 'I BTP a breve' },
  ],
  allowOther: true,
};

/** The card under a parent that holds the answer, as the scene does. */
function Host({ question, initial = null, onAnswer, otherSelect }: { question: Question; initial?: QuestionAnswerValue | null; onAnswer?: (value: QuestionAnswerValue) => void; otherSelect?: { label: string; items: readonly { id: string; name: string }[] } }) {
  const [answer, setAnswer] = useState<QuestionAnswerValue | null>(initial);
  return (
    <QuestionCard
      question={question}
      index={1}
      total={2}
      answer={answer}
      onAnswer={(value) => {
        setAnswer(value);
        onAnswer?.(value);
      }}
      otherSelect={otherSelect}
    />
  );
}

describe('QuestionCard', () => {
  it('shows the eyebrow, the question, the why, the options with «Altro…» then «Preferisco non dire» last, wears the generated surface and holds no button', () => {
    const { container } = render(<Host question={SINGLE} />);
    expect(screen.getByText('Il Consulente chiede · 1 di 2')).not.toBeNull();
    expect(screen.getByText(SINGLE.text)).not.toBeNull();
    expect(screen.getByText("copre l'86% delle entrate")).not.toBeNull();
    const group = screen.getByRole('radiogroup', { name: SINGLE.text });
    const labels = within(group).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label') ?? radio.textContent);
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByText('Altro…')).not.toBeNull();
    expect(screen.getByText('Preferisco non dire')).not.toBeNull();
    const texts = Array.from(group.querySelectorAll('label')).map((label) => label.textContent ?? '');
    expect(texts.findIndex((t) => t.includes('Altro…'))).toBeGreaterThan(texts.findIndex((t) => t.includes('Circa metà')));
    expect(texts.findIndex((t) => t.includes('Preferisco non dire'))).toBe(texts.length - 1);
    expect(labels.length).toBe(4);
    const card = container.querySelector('[data-question-card="reddito"]')!;
    for (const token of AI_GENERATED_SURFACE_CLASS.split(' ')) expect(card.classList.contains(token), token).toBe(true);
    expect(card.className).not.toContain('bg-card');
    // No action button: the radios are Radix buttons, the one primary of a round is the scene's.
    expect(container.querySelectorAll('button:not([role="radio"]):not([role="checkbox"])')).toHaveLength(0);
  });

  it('a custom eyebrow replaces the default; decline false drops the last row; a question without allowOther has no «Altro…»', () => {
    render(<QuestionCard question={{ ...SINGLE, allowOther: false }} index={2} total={3} answer={null} onAnswer={() => {}} eyebrow="L'Assistente chiede" decline={false} />);
    expect(screen.getByText("L'Assistente chiede")).not.toBeNull();
    expect(screen.queryByText('Il Consulente chiede · 2 di 3')).toBeNull();
    expect(screen.queryByText('Altro…')).toBeNull();
    expect(screen.queryByText('Preferisco non dire')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('single: an option answers its value, the decline row the decline value, «Altro…» a blank other that keeps the row chosen while typing', async () => {
    const onAnswer = vi.fn();
    render(<Host question={SINGLE} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Circa metà' }));
    expect(onAnswer).toHaveBeenLastCalledWith('meta');
    expect(screen.getByRole('radio', { name: 'Circa metà' }).getAttribute('aria-checked')).toBe('true');

    await userEvent.click(screen.getByRole('radio', { name: 'Preferisco non dire' }));
    expect(onAnswer).toHaveBeenLastCalledWith(QUESTION_DECLINE_VALUE);
    expect(screen.getByRole('radio', { name: 'Preferisco non dire' }).getAttribute('aria-checked')).toBe('true');

    await userEvent.click(screen.getByRole('radio', { name: 'Altro…' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ other: '' });
    const field = screen.getByRole('textbox', { name: `Altro — ${SINGLE.text}` });
    await userEvent.type(field, 'un fenicottero');
    expect(onAnswer).toHaveBeenLastCalledWith({ other: 'un fenicottero' });
    expect(screen.getByRole('radio', { name: 'Altro…' }).getAttribute('aria-checked')).toBe('true');
  });

  it('multiple: options add up as a list, «Altro…» and the decline are exclusive and clear the list', async () => {
    const onAnswer = vi.fn();
    render(<Host question={MULTIPLE} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'I conti correnti' }));
    expect(onAnswer).toHaveBeenLastCalledWith(['conti']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'I BTP a breve' }));
    expect(onAnswer).toHaveBeenLastCalledWith(['conti', 'btp']);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Preferisco non dire' }));
    expect(onAnswer).toHaveBeenLastCalledWith(QUESTION_DECLINE_VALUE);
    expect(screen.getByRole('checkbox', { name: 'I conti correnti' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'Preferisco non dire' }).getAttribute('aria-checked')).toBe('true');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Altro…' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ other: '' });
    expect(screen.getByRole('checkbox', { name: 'Preferisco non dire' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'Altro…' }).getAttribute('aria-checked')).toBe('true');

    // An option after «Altro…» leaves the exclusive row.
    await userEvent.click(screen.getByRole('checkbox', { name: 'I BTP a breve' }));
    expect(onAnswer).toHaveBeenLastCalledWith(['btp']);
  });

  it('renders an existing answer: a typed other keeps «Altro…» checked with its text, a decline its row', () => {
    const { rerender } = render(<QuestionCard question={SINGLE} index={1} total={1} answer={{ other: 'ornitorinco' }} onAnswer={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Altro…' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ornitorinco');
    rerender(<QuestionCard question={MULTIPLE} index={1} total={1} answer={QUESTION_DECLINE_VALUE} onAnswer={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Preferisco non dire' }).getAttribute('aria-checked')).toBe('true');
    rerender(<QuestionCard question={MULTIPLE} index={1} total={1} answer={['btp']} onAnswer={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'I BTP a breve' }).getAttribute('aria-checked')).toBe('true');
  });

  it('with otherSelect the «Altro…» row shows a pick labelled by it, answers { entity } and types nothing', async () => {
    const onAnswer = vi.fn();
    render(<Host question={SINGLE} onAnswer={onAnswer} otherSelect={{ label: 'Quale conto', items: [{ id: 'acc-1', name: 'Conto fenicottero' }, { id: 'acc-2', name: 'Conto ornitorinco' }] }} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Altro…' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ entity: '' });
    expect(screen.queryByRole('textbox')).toBeNull();
    const trigger = screen.getByRole('combobox', { name: 'Quale conto' });
    expect(trigger).not.toBeNull();
  });
});
