/**
 * `ObiettiviTile` — «Criteri del modello» (Allocazione › Accumulo). Pinned (collaudo, 2026-11-17): an account that
 * never saved its criteria reads them off AND can open the dialog to switch them on — the dialog starts from the
 * default criteria. With the button off there was no way in: «Ricalcola» waits for the criteria, the criteria
 * waited for themselves.
 *
 * REGRESSION GUARD, seen red (2026-11-17): the button disabled on `!idealAllocation`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: () => 0 }));

import { ObiettiviTile } from '@/components/allocation/tiles/ObiettiviTile';
import { OBJECTIVES_ACTION_EDIT, OBJECTIVES_OFF_READING } from '@/lib/utils/weightOptimizerNarrative';

describe('ObiettiviTile — criteria never saved', () => {
  it('reads them off and opens the dialog', () => {
    const { container } = render(<ObiettiviTile idealAllocation={null} targetLeverageRatio={1} onEdit={() => {}} />);
    expect(container.textContent).toContain(OBJECTIVES_OFF_READING);
    expect((screen.getByRole('button', { name: OBJECTIVES_ACTION_EDIT }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('stays off while the page says so (no targets)', () => {
    render(<ObiettiviTile idealAllocation={null} targetLeverageRatio={1} onEdit={() => {}} disabled />);
    expect((screen.getByRole('button', { name: OBJECTIVES_ACTION_EDIT }) as HTMLButtonElement).disabled).toBe(true);
  });
});
