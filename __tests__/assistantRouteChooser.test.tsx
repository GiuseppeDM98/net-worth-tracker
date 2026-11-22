/**
 * `AssistantRouteChooser` — what «cambia» opens (2026-11-12): the reading as a draft, three
 * questions, «Rileggi» with the chosen route. The modal is a stub that prints its parts (its own
 * suite is `responsive-modal`'s); the clock is 2026-11-16, so the month options start at 2022-12.
 *
 * Seen RED: «Oggi» kept for an analysis; the month options without the draft's month.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';

// A portalled primitive reads the costume scope from ColorThemeContext, whose module imports AuthContext → Firebase.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({ getUserPreferences: vi.fn(async () => ({})), setUserPreferences: vi.fn() }));

vi.mock('@/components/ui/responsive-modal', () => ({
  ResponsiveModal: ({ open, eyebrow, title, reading, children, footer }: Record<string, React.ReactNode> & { open: boolean }) =>
    open ? (
      <div role="dialog">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <p>{typeof reading === 'string' ? reading : null}</p>
        {children}
        <div>{footer}</div>
      </div>
    ) : null,
}));

import { AssistantRouteChooser } from '@/components/assistant/AssistantRouteChooser';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import type { AssistantRouteOverride, AssistantRouteReading } from '@/types/assistant';

const TODAY = { year: 2026, month: 11 };
const reading = (route: AssistantRouteOverride): AssistantRouteReading => ({ route: { ...route, confidence: 0.9 }, source: 'router' });
const OCTOBER_QUESTION = reading({ intent: 'chat', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false });

function setup(r: AssistantRouteReading = OCTOBER_QUESTION) {
  const onReread = vi.fn();
  const onClose = vi.fn();
  render(<AssistantRouteChooser open reading={r} today={TODAY} onReread={onReread} onClose={onClose} returnFocusTo={createRef()} />);
  return { onReread, onClose };
}

const group = (name: string) => screen.queryByRole('radiogroup', { name });
const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00+01:00'));
});
afterAll(() => {
  vi.useRealTimers();
});

describe('AssistantRouteChooser', () => {
  it('opens on the reading: a question on a month, no web', () => {
    setup();
    expect(screen.getByText('Assistente · Lettura')).not.toBeNull();
    expect(screen.getByText('Come devo leggerla?')).not.toBeNull();
    expect(radio('Una domanda').getAttribute('aria-checked')).toBe('true');
    expect(radio('Un mese').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Mese di riferimento' }).textContent).toContain('Ottobre 2026');
    expect(screen.getByRole('switch', { name: 'Cerca anche sul web' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: 'Rileggi' }).className).toContain(AI_CONTROL_ACCENT_CLASS);
  });

  it('a registration hides the period and the web, and «Rileggi» sends the register route', () => {
    const { onReread } = setup();
    fireEvent.click(radio('Un movimento da registrare'));
    expect(group('Su quale periodo')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Cerca anche sul web' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rileggi' }));
    expect(onReread).toHaveBeenCalledWith({ intent: 'register', period: { kind: 'none' }, webSearch: false });
  });

  it('an analysis has no «Oggi», and moves a draft on «Oggi» to «Un mese»', () => {
    const { onReread } = setup(reading({ intent: 'chat', period: { kind: 'none' }, webSearch: true }));
    expect(within(group('Su quale periodo')!).getByRole('radio', { name: /^Oggi/ })).not.toBeNull();
    fireEvent.click(radio("Un'analisi"));
    expect(within(group('Su quale periodo')!).queryByRole('radio', { name: /^Oggi/ })).toBeNull();
    expect(radio('Un mese').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Rileggi' }));
    expect(onReread).toHaveBeenCalledWith({ intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: true });
  });

  it('shows a month older than the options in the picker, and a year older than the years', () => {
    setup(reading({ intent: 'month_analysis', period: { kind: 'month', year: 2020, month: 3 }, webSearch: false }));
    expect(screen.getByRole('combobox', { name: 'Mese di riferimento' }).textContent).toContain('Marzo 2020');
    fireEvent.click(radio('Un anno'));
    // The year of the draft stays this year: 2026 is among the options.
    expect(screen.getByRole('combobox', { name: 'Anno di riferimento' }).textContent).toContain('2026');
  });

  it('«Annulla» closes without re-reading', () => {
    const { onReread, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onClose).toHaveBeenCalled();
    expect(onReread).not.toHaveBeenCalled();
  });
});
