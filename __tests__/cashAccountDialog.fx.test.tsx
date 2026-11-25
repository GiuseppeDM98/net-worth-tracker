/**
 * CashAccountDialog on an account in a foreign currency (2026-11-23): the app counts its balance as
 * euro and never settles a trade on it, so the detail says so and asks for the balance in euro. A
 * euro account reads no warning. Invented names and figures. Seen red (2026-11-25) with the warning
 * shown for every account.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

import { CashAccountDialog } from '@/components/assets/CashAccountDialog';

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const account = (currency: string) =>
  ({
    id: `cash-${currency}`, userId: 'owner-1', name: 'Conto Ornitorinco', type: 'cash', assetClass: 'cash', currency,
    quantity: 1000, currentPrice: 1, createdAt: new Date('2026-11-10T12:00:00Z'), updatedAt: new Date('2026-11-10T12:00:00Z'),
  }) as unknown as Asset;

function renderFor(currency: string) {
  render(
    <CashAccountDialog asset={account(currency)} open onClose={() => {}} onEdit={() => {}} onDelete={() => {}} isDemo={false} />,
  );
}

describe('CashAccountDialog — a foreign account', () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  it('warns that a dollar account is counted as euro and cannot settle trades', () => {
    renderFor('USD');
    expect(screen.getByText(/Conto in USD: l'app lo conta come se fossero euro e non può regolare operazioni/)).toBeTruthy();
  });

  it('says nothing on a euro account', () => {
    renderFor('EUR');
    expect(screen.queryByText(/come se fossero euro/)).toBeNull();
  });
});
