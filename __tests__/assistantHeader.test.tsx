/**
 * The Assistente's header as a chat (2026-11-12): two buttons — «⋯» and «Nuova conversazione» —
 * per header copy (PageHeader draws its actions twice). «⋯» opens a menu of three items that each
 * open a modal; no «Registra un movimento» (the composer takes a registration).
 *
 * Seen RED with «Nuova conversazione» `disabled={isDemo}` (it started a thread mid-stream).
 */
import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AssistantHeader, newThreadLabel } from '@/components/assistant/AssistantHeader';

// `PageHeader` draws the costume's emblem, which reads the colour theme: its context imports Firebase Auth.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

function renderHeader(overrides: Partial<Parameters<typeof AssistantHeader>[0]> = {}) {
  const props = {
    onNewThread: vi.fn(),
    onOpenThreads: vi.fn(),
    onOpenMemory: vi.fn(),
    onOpenPreferences: vi.fn(),
    moreTriggerRef: createRef<HTMLButtonElement>(),
  };
  const { container } = render(
    <AssistantHeader
      isDemo={false}
      isStreaming={false}
      threadsCount={12}
      activeMemoryCount={3}
      description="12 conversazioni · 3 fatti in memoria"
      {...props}
      {...overrides}
    />
  );
  return { ...props, ...overrides, container };
}

/** Opens the menu of one «⋯» copy with the keyboard (Radix opens on Enter). */
function openMenu(index = 0) {
  const trigger = screen.getAllByRole('button', { name: "Altre azioni dell'assistente" })[index];
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return { trigger, menu: screen.getByRole('menu') };
}

describe('AssistantHeader — two buttons', () => {
  it('draws «⋯» and «Nuova conversazione» in each copy, and no «Registra un movimento»', () => {
    renderHeader();
    const more = screen.getAllByRole('button', { name: "Altre azioni dell'assistente" });
    const next = screen.getAllByRole('button', { name: 'Nuova conversazione' });
    expect(more.length).toBeGreaterThan(0);
    expect(next).toHaveLength(more.length);
    expect(screen.getAllByRole('button')).toHaveLength(more.length * 2);
    expect(screen.queryByRole('button', { name: 'Registra un movimento' })).toBeNull();
  });

  it('the title promises a sentence and an answer', () => {
    renderHeader();
    expect(screen.getAllByText('Una frase, una risposta').length).toBeGreaterThan(0);
  });
});

describe('AssistantHeader — the «⋯» menu', () => {
  it('holds three items with their counts, each opening its modal', () => {
    const { onOpenThreads, onOpenMemory, onOpenPreferences } = renderHeader({ hasMoreThreads: true });
    let { menu } = openMenu();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Conversazioni (più di 12)',
      'Memoria (3)',
      'Preferenze',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Memoria (3)' }));
    expect(onOpenMemory).toHaveBeenCalledTimes(1);
    ({ menu } = openMenu());
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Conversazioni/ }));
    expect(onOpenThreads).toHaveBeenCalledTimes(1);
    ({ menu } = openMenu());
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Preferenze' }));
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it('reads the bare names with no count', () => {
    renderHeader({ threadsCount: 0, activeMemoryCount: 0 });
    const { menu } = openMenu();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Conversazioni', 'Memoria', 'Preferenze']);
  });

  it('turns off Conversazioni and Preferenze in the demo, never Memoria', () => {
    renderHeader({ isDemo: true });
    const { menu } = openMenu();
    const [threads, memory, preferences] = within(menu).getAllByRole('menuitem');
    expect(threads.textContent).toBe('Conversazioni — non disponibili in modalità demo');
    expect(threads.getAttribute('aria-disabled')).toBe('true');
    expect(memory.hasAttribute('aria-disabled')).toBe(false);
    expect(preferences.getAttribute('aria-disabled')).toBe('true');
  });

  it('records the copy of «⋯» that opened the menu, for the modal to return to', () => {
    const { moreTriggerRef } = renderHeader();
    const copies = screen.getAllByRole('button', { name: "Altre azioni dell'assistente" });
    fireEvent.focus(copies[copies.length - 1]);
    expect(moreTriggerRef.current).toBe(copies[copies.length - 1]);
    fireEvent.pointerDown(copies[0]);
    expect(moreTriggerRef.current).toBe(copies[0]);
  });
});

describe('AssistantHeader — «Nuova conversazione»', () => {
  it('starts a new thread', () => {
    const { onNewThread } = renderHeader();
    const buttons = screen.getAllByRole('button', { name: 'Nuova conversazione' });
    for (const button of buttons) expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(buttons[0]);
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it('is off while an answer streams, and in the demo with its reason', () => {
    renderHeader({ isStreaming: true });
    for (const button of screen.getAllByRole('button', { name: 'Nuova conversazione' })) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(newThreadLabel(true)).toBe('Nuova conversazione — non disponibile in modalità demo');
    expect(newThreadLabel(false)).toBe('Nuova conversazione');
  });
});
