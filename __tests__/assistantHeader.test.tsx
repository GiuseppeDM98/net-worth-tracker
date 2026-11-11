/**
 * The Assistente's header: «Nuova conversazione» is off in Registra, whose thread is the day's — a
 * new one would reopen the same, and on the owner's tour the button seemed to do nothing (2026-11-11).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantHeader, newThreadLabel } from '@/components/assistant/AssistantHeader';

function renderHeader(overrides: Partial<Parameters<typeof AssistantHeader>[0]> = {}) {
  const onNewThread = vi.fn();
  render(
    <AssistantHeader
      isDemo={false}
      isStreaming={false}
      threadsCount={3}
      activeMemoryCount={0}
      description="3 conversazioni · memoria vuota"
      memory={undefined}
      loadingMemory={false}
      isPreferencesPending={false}
      onPreferencesChange={vi.fn()}
      onNewThread={onNewThread}
      onOpenThreads={vi.fn()}
      onOpenMemory={vi.fn()}
      onEnterRegister={vi.fn()}
      {...overrides}
    />
  );
  return { onNewThread };
}

describe('AssistantHeader — «Nuova conversazione»', () => {
  it('starts a new thread outside Registra', () => {
    const { onNewThread } = renderHeader();
    // PageHeader draws its actions twice (the bar and the compact row): every copy is checked.
    const buttons = screen.getAllByRole('button', { name: 'Nuova conversazione' });
    for (const button of buttons) expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(buttons[0]);
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it('is off in Registra and says why', () => {
    const { onNewThread } = renderHeader({ isRegister: true });
    const buttons = screen.getAllByRole('button', { name: 'Nuova conversazione — Registra tiene un thread al giorno' });
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(onNewThread).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Nuova conversazione' })).toBeNull();
  });

  it('names the demo before Registra', () => {
    expect(newThreadLabel(true, true)).toBe('Nuova conversazione — non disponibile in modalità demo');
    expect(newThreadLabel(false, false)).toBe('Nuova conversazione');
  });
});
