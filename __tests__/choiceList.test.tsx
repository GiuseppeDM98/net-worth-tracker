/**
 * `ChoiceList` (components/ui/choice-list.tsx, 2026-11-07): the single mode as a radiogroup, the
 * multiple mode as ONE Tab stop of checkboxes with the exclusive row (2026-11-01), the «Altro…»
 * field under its row with no focus jump. Invented options.
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChoiceList, nextMultipleValue, type ChoiceListOption } from '@/components/ui/choice-list';

type Value = 'a' | 'b' | 'other' | 'x';

const OPTIONS: readonly ChoiceListOption<Value>[] = [
  { value: 'a', label: 'Uno', hint: 'Il primo.' },
  { value: 'b', label: 'Due' },
  { value: 'other', label: 'Altro…' },
  { value: 'x', label: 'Preferisco non dire', exclusive: true },
];

const OTHER = { value: 'other' as const, label: 'Quale', text: 'ciao', onTextChange: () => {} };

describe('ChoiceList, single', () => {
  it('is a radiogroup named by its label, one radio per option, none checked on null', () => {
    const { container } = render(<ChoiceList mode="single" name="prova" label="Prova" options={OPTIONS} value={null} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Prova' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios.every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(container.querySelector('#prova-a')).not.toBeNull();
    expect(container.querySelector('#prova-x')).not.toBeNull();
  });

  it('reports the chosen value and shows the hint under the label', async () => {
    const onChange = vi.fn();
    render(<ChoiceList mode="single" name="prova" label="Prova" options={OPTIONS} value="a" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /^Uno/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Il primo.')).not.toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Due' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows the «Altro…» field only while that row is chosen, and types into it', async () => {
    const onTextChange = vi.fn();
    const { rerender } = render(<ChoiceList mode="single" name="prova" label="Prova" options={OPTIONS} value="a" onChange={() => {}} other={{ ...OTHER, onTextChange }} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    rerender(<ChoiceList mode="single" name="prova" label="Prova" options={OPTIONS} value="other" onChange={() => {}} other={{ ...OTHER, onTextChange }} />);
    const field = screen.getByRole('textbox', { name: 'Quale' });
    expect((field as HTMLInputElement).value).toBe('ciao');
    await userEvent.type(field, 'x');
    expect(onTextChange).toHaveBeenCalledWith('ciaox');
  });

  it('does not move the focus into the field when «Altro…» is chosen', async () => {
    function Host() {
      const [value, setValue] = useState<Value | null>('a');
      const [text, setText] = useState('');
      return <ChoiceList mode="single" name="prova" label="Prova" options={OPTIONS} value={value} onChange={setValue} other={{ value: 'other', label: 'Quale', text, onTextChange: setText }} />;
    }
    render(<Host />);
    await userEvent.click(screen.getByRole('radio', { name: 'Altro…' }));
    const field = screen.getByRole('textbox', { name: 'Quale' });
    expect(document.activeElement).not.toBe(field);
  });
});

describe('ChoiceList, multiple', () => {
  it('is a group of checkboxes that builds the next array in the options’ order', async () => {
    const onChange = vi.fn();
    render(<ChoiceList mode="multiple" name="prova" label="Prova" options={OPTIONS} value={['a']} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Prova' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(4);
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Due' }));
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('turns an exclusive row on alone, and off by any other (2026-11-01)', () => {
    expect(nextMultipleValue(OPTIONS, ['a', 'b'], 'x', true)).toEqual(['x']);
    expect(nextMultipleValue(OPTIONS, ['x'], 'a', true)).toEqual(['a']);
    expect(nextMultipleValue(OPTIONS, ['b', 'a'], 'a', false)).toEqual(['b']);
    expect(nextMultipleValue(OPTIONS, ['b'], 'a', true)).toEqual(['a', 'b']);
  });

  it('is ONE Tab stop: Tab enters on the first box, the arrow moves, Tab leaves', async () => {
    render(<ChoiceList mode="multiple" name="prova" label="Prova" options={OPTIONS} value={[]} onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Prova' });
    const boxes = within(group).getAllByRole('checkbox');
    await userEvent.tab();
    expect(document.activeElement).toBe(boxes[0]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(boxes[1]);
    await userEvent.tab();
    expect(group.contains(document.activeElement)).toBe(false);
  });

  it('shows the «Altro…» field while its row is among the values', () => {
    render(<ChoiceList mode="multiple" name="prova" label="Prova" options={OPTIONS} value={['a', 'other']} onChange={() => {}} other={OTHER} />);
    expect((screen.getByRole('textbox', { name: 'Quale' }) as HTMLInputElement).value).toBe('ciao');
  });
});
