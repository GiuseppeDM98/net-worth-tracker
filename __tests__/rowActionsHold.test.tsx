/**
 * The hold on a list's write actions while the copy on screen is being reread (2026-11-26,
 * components/ui/row-actions-hold.tsx): a reload paints the lists restored from the persisted cache and
 * rereads them behind; a dialog opened on a row of that copy saves old values over newer ones, and
 * FIRE › Obiettivi rewrites its whole document from the list in memory. So every control that writes
 * from a row waits for the reread — never on `isFetching` alone: a refetch of a list read in THIS
 * load (the invalidation after a save) holds nothing.
 *
 * The first block is the rule; the second holds the wiring of the controls a test can mount without
 * the page (the others are held in `strumentiTile.test.tsx`, `questoMeseTile.test.tsx` and in the
 * browser, `e2e/cashflow.reread-hold.spec.ts`). Invented names and figures. Seen red on 2026-11-26:
 * the rule reading `isFetching` alone (the third case, and Movimenti's), `useRowActionsHeld` answering
 * `false` (every control here and in the two other files), and one `held` taken off a control at a
 * time — the cash account's «Modifica», the sale's «Conferma», `AssetRow`'s «Modifica».
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import type { HallOfFameNote } from '@/types/hall-of-fame';
import type { AssignmentsView } from '@/lib/utils/goalsSummary';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

import { RowActionsHold, useRowActionsHeld } from '@/components/ui/row-actions-hold';
import { CashAccountDialog } from '@/components/assets/CashAccountDialog';
import { HallOfFameNoteViewDialog } from '@/components/hall-of-fame/HallOfFameNoteViewDialog';
import { TraiettoriaTile } from '@/components/goals/tiles/TraiettoriaTile';
import { AssegnazioniTile } from '@/components/goals/tiles/AssegnazioniTile';

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const RESTORED_AND_REREAD = { isFetching: true, isLoading: false, dataUpdatedAt: performance.timeOrigin - 60_000 };
const REREAD_LANDED = { isFetching: false, isLoading: false, dataUpdatedAt: Date.now() };
const REFETCH_AFTER_A_SAVE = { isFetching: true, isLoading: false, dataUpdatedAt: Date.now() };
const FIRST_READ = { isFetching: true, isLoading: true, dataUpdatedAt: 0 };

function Probe() {
  return <button type="button" disabled={useRowActionsHeld()}>Modifica</button>;
}
const probe = () => screen.getByRole('button', { name: 'Modifica' }) as HTMLButtonElement;

describe('RowActionsHold — the rule', () => {
  it('holds while a list read before this load is being reread', () => {
    render(<RowActionsHold queries={[REREAD_LANDED, RESTORED_AND_REREAD]}><Probe /></RowActionsHold>);
    expect(probe().disabled).toBe(true);
  });

  it('gives the actions back once the reread has landed', () => {
    render(<RowActionsHold queries={[REREAD_LANDED]}><Probe /></RowActionsHold>);
    expect(probe().disabled).toBe(false);
  });

  it('holds nothing while a list read in this load is refetched after a save', () => {
    render(<RowActionsHold queries={[REFETCH_AFTER_A_SAVE]}><Probe /></RowActionsHold>);
    expect(probe().disabled).toBe(false);
  });

  it('holds nothing on a first read (there is no row to act on) nor on a query not there yet', () => {
    render(<RowActionsHold queries={[FIRST_READ, null, undefined]}><Probe /></RowActionsHold>);
    expect(probe().disabled).toBe(false);
  });

  it('holds nothing outside a provider', () => {
    render(<Probe />);
    expect(probe().disabled).toBe(false);
  });

  it('a hold above stays under a provider that holds nothing, and a reading taken by the area holds too', () => {
    const { unmount } = render(
      <RowActionsHold queries={[RESTORED_AND_REREAD]}>
        <RowActionsHold queries={[REREAD_LANDED]}><Probe /></RowActionsHold>
      </RowActionsHold>,
    );
    expect(probe().disabled).toBe(true);
    unmount();
    render(<RowActionsHold held><Probe /></RowActionsHold>);
    expect(probe().disabled).toBe(true);
  });
});

const ACCOUNT = {
  id: 'cash-1', userId: 'owner-1', name: 'Conto Ornitorinco', type: 'cash', assetClass: 'cash', currency: 'EUR',
  quantity: 1000, currentPrice: 1, createdAt: new Date('2026-11-10T12:00:00Z'), updatedAt: new Date('2026-11-10T12:00:00Z'),
} as unknown as Asset;
const NOTE: HallOfFameNote = {
  id: 'note-1', text: 'Il mese del trasloco.', sections: [], year: 2026, month: 3,
  createdAt: new Date('2026-03-31T12:00:00Z'), updatedAt: new Date('2026-03-31T12:00:00Z'),
};
const VIEW: AssignmentsView = {
  groups: [
    { goalId: 'goal-1', name: 'Casa al lago', color: '#888', total: 4000, rows: [{ assetId: 'a-1', name: 'Fondo Fenicottero', ticker: null, percentage: 40, units: null, unitLabel: 'quote', value: 4000 }] },
  ],
  quotaCount: 1, instrumentCount: 1, assignedTotal: 4000, free: [], freeTotal: 0, freeShare: 0, freeInstrumentCount: 0, totalInstrumentCount: 1, overAssigned: [],
};

/** Each control that writes from a row, mounted alone: what it draws and the buttons the hold must reach. */
const CONTROLS: { name: string; element: React.ReactElement; buttons: (string | RegExp)[] }[] = [
  {
    name: 'Patrimonio › the cash account’s detail',
    element: <CashAccountDialog asset={ACCOUNT} open onClose={() => {}} onEdit={() => {}} onDelete={() => {}} isDemo={false} />,
    buttons: ['Modifica', 'Elimina Conto Ornitorinco'],
  },
  {
    name: 'Hall of Fame › a note, read',
    element: <HallOfFameNoteViewDialog open onOpenChange={() => {}} note={NOTE} onEditClick={() => {}} />,
    buttons: ['Modifica'],
  },
  {
    name: 'FIRE › Obiettivi › Traiettoria',
    element: <TraiettoriaTile reading={[{ text: 'In rotta.' }]} name="Casa al lago" hero={null} chips={[]} notes={null} chart={null} footer={[{ text: 'Scadenza 2032.' }]} onEdit={() => {}} onDelete={() => {}} isDemo={false} />,
    buttons: ['Modifica', /^Elimina/],
  },
  {
    name: 'FIRE › Obiettivi › Assegnazioni',
    element: <AssegnazioniTile reading={[{ text: 'Una quota.' }]} aside="1 quota" view={VIEW} onAdd={() => {}} onRemove={() => {}} footer={{ narrative: [{ text: 'Tutto assegnato.' }], tone: 'neutral' }} isDemo={false} />,
    buttons: [/^Aggiungi uno strumento a Casa al lago/, /^Rimuovi Fondo Fenicottero/],
  },
];

describe.each(CONTROLS)('RowActionsHold — $name', ({ element, buttons }) => {
  beforeEach(() => {
    stubMatchMedia();
  });

  const found = () => buttons.flatMap((name) => screen.getAllByRole('button', { name }) as HTMLButtonElement[]);

  it('waits while the copy on screen is being reread', () => {
    render(<RowActionsHold held>{element}</RowActionsHold>);
    expect(found().length).toBeGreaterThanOrEqual(buttons.length);
    for (const button of found()) expect(button.disabled).toBe(true);
  });

  it('acts once it has landed', () => {
    render(<RowActionsHold queries={[REREAD_LANDED]}>{element}</RowActionsHold>);
    for (const button of found()) expect(button.disabled).toBe(false);
  });
});
