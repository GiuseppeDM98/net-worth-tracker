/**
 * `AssistantComposer` — the message capped at 4000 characters with a counter from 3800 (2026-11):
 * the textarea's `maxlength`, the counter tied to it by `aria-describedby` and no live region,
 * the send button accented (it calls the model), the page's ref on the textarea.
 */

import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';

function Host({ initial = '', onSubmit = () => {}, inputRef }: { initial?: string; onSubmit?: () => void; inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const [draft, setDraft] = useState(initial);
  return (
    <AssistantComposer draft={draft} onChange={setDraft} onSubmit={onSubmit} onStop={() => {}} isStreaming={false} canSubmit={draft.trim().length > 0} inputRef={inputRef} />
  );
}

const textarea = () => screen.getByRole('textbox', { name: "Scrivi un messaggio all'assistente" }) as HTMLTextAreaElement;

describe('AssistantComposer', () => {
  it('caps the textarea at 4000 characters and shows no counter on a short message', () => {
    render(<Host initial="ho speso 5 euro" />);
    expect(textarea().getAttribute('maxlength')).toBe('4000');
    expect(textarea().hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByText(/caratteri$/)).toBeNull();
  });

  it('is silent at 3799 characters and counts from 3800, tied to the textarea, with no live region', () => {
    const { container } = render(<Host />);
    fireEvent.change(textarea(), { target: { value: 'a'.repeat(3799) } });
    expect(screen.queryByText(/caratteri$/)).toBeNull();

    fireEvent.change(textarea(), { target: { value: 'a'.repeat(3800) } });
    const counter = screen.getByText('3.800 / 4.000 caratteri');
    expect(textarea().getAttribute('aria-describedby')).toBe(counter.id);
    expect(container.querySelector('[aria-live]')).toBeNull();

    fireEvent.change(textarea(), { target: { value: 'a'.repeat(3812) } });
    expect(screen.getByText('3.812 / 4.000 caratteri')).not.toBeNull();
  });

  it('accents the send button and sends on Enter, not on Shift+Enter', () => {
    const onSubmit = vi.fn();
    render(<Host initial="ho speso 5 euro" onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Invia messaggio' }).className).toContain(AI_CONTROL_ACCENT_CLASS);
    fireEvent.keyDown(textarea(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('hands the page its textarea, so the page can move the focus there', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Host inputRef={ref} />);
    expect(ref.current).toBe(textarea());
    ref.current?.focus();
    expect(document.activeElement).toBe(textarea());
  });
});
