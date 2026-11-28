/**
 * Impostazioni › Preferenze, tile «Email periodiche»: two periods only, «Mensile» and «Annuale», each
 * with its switch and its «Invia ora» naming the last CLOSED period — on 15 November the monthly is
 * October's, the yearly 2025's.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { FULL_PAGE_SETTINGS } from './fixtures/storedSettings';
import { sliceSettings } from '@/lib/utils/settingsDraft';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import { GeneraleTab } from '@/components/settings/tabs/GeneraleTab';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderTab() {
  const slices = sliceSettings(FULL_PAGE_SETTINGS, FULL_PAGE_SETTINGS.targets);
  render(
    <Tabs value="generale">
      <GeneraleTab
        slice={{ ...slices.generale, monthlyEmailEnabled: true, yearlyEmailEnabled: true }}
        onChange={vi.fn()}
        declarations={slices.declarations}
        ownerId="user-a"
        isDemo={false}
        expenseCategories={[]}
        categoriesState="ready"
        cashSubCategories={[]}
        onGoToAllocazione={vi.fn()}
      />
    </Tabs>,
  );
  // The tile is the one whose eyebrow reads «Email periodiche».
  const eyebrow = screen.getByText('Email periodiche');
  let tile: HTMLElement = eyebrow;
  while (tile.parentElement && !within(tile).queryByRole('switch', { name: 'Mensile' })) tile = tile.parentElement;
  return tile;
}

describe('GeneraleTab — Email periodiche', () => {
  it('has exactly two switches, «Mensile» and «Annuale»', () => {
    const tile = renderTab();
    const switches = within(tile).getAllByRole('switch');
    expect(switches.map((node) => node.getAttribute('id'))).toEqual(['monthlyEmailEnabled', 'yearlyEmailEnabled']);
    expect(within(tile).getByRole('switch', { name: 'Mensile' })).toBeTruthy();
    expect(within(tile).getByRole('switch', { name: 'Annuale' })).toBeTruthy();
  });

  it('names the last closed period on each «Invia ora»: October 2026 and 2025 on 15 November', () => {
    const tile = renderTab();
    expect(within(tile).getByRole('button', { name: 'Invia ora il riepilogo di ottobre 2026' })).toBeTruthy();
    expect(within(tile).getByRole('button', { name: 'Invia ora il riepilogo del 2025' })).toBeTruthy();
    expect(within(tile).getByText("Manda adesso il riepilogo dell'ultimo periodo chiuso, anche se è già partito.")).toBeTruthy();
  });
});
