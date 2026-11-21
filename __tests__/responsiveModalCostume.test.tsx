/**
 * A modal opened inside the dashboard wears its costume (DESIGN.md → The Costume Rule, 2026-11-21):
 * `ResponsiveModal`'s content — the Drawer on a phone, the Dialog from 769px — is portalled out of the
 * shell's DOM, so it carries `data-costume-scope` itself when it is opened from inside `CostumeScope`,
 * and never outside it. Seen red with the spread dropped.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({ getUserPreferences: vi.fn(async () => ({})), setUserPreferences: vi.fn() }));

import { CostumeScope } from '@/contexts/CostumeScopeContext';
import { ResponsiveModal } from '@/components/ui/responsive-modal';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const modal = <ResponsiveModal open onClose={() => {}} title="Nuova spesa"><p>Corpo</p></ResponsiveModal>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  { label: 'the Drawer (phone)', matches: true },
  { label: 'the Dialog (from 769px)', matches: false },
])('ResponsiveModal — $label', ({ matches }) => {
  it('should carry the costume scope when opened inside it', () => {
    stubMatchMedia(matches);
    render(<CostumeScope>{modal}</CostumeScope>);
    expect(screen.getByRole('dialog').hasAttribute('data-costume-scope')).toBe(true);
  });

  it('should not carry it outside', () => {
    stubMatchMedia(matches);
    render(modal);
    expect(screen.getByRole('dialog').hasAttribute('data-costume-scope')).toBe(false);
  });
});
