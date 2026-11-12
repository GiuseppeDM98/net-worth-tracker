/**
 * The Consulente's report as a book (components/allocation/consulente/ConsulenteBook.tsx,
 * 2026-11-08): one page on the scene card, turned from the footer, jumped to from «Indice»; the
 * address written with `replaceState` from the gesture; the scroll to the card's top; the page
 * remembered by id across a document change; the accent per page; the figures moved onto their
 * pages; the print sheet without buttons and accents. Invented figures (ETF ornitorinco, Fondo
 * fenicottero).
 *
 * The host holds the page id as ConsulenteClient does. jsdom has no CSS: the print sheet is in the
 * DOM and repeats every title, so each query is scoped to the card (`within(card())`). Every
 * assertion after a turn waits (`waitFor`): that is how the slide's exit and the focus settle here.
 */

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import { initialAnswers } from '@/lib/utils/allocationAdviceDraft';
import { buildConsulenteVerdict, buildProposalRows } from '@/lib/utils/allocationAdviceNarrative';
import type { BookPageId } from '@/lib/utils/allocationAdviceBook';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import { ConsulenteBook } from '@/components/allocation/consulente/ConsulenteBook';
import { useConsulenteRevision } from '@/components/allocation/consulente/useConsulenteRevision';
import type { ApplyState } from '@/components/allocation/consulente/ConsulenteBookPages';

/** The width: compact (below 1440) or not; one list per query, as framer and useMediaQuery listen to it. */
let compact = true;
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: query.includes('1440') ? compact : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

const NOW = new Date('2026-11-08T12:00:00');

const PROPOSAL: AllocationAdviceProposal = {
  summary: 'Settanta e trenta, meno cripto.',
  classes: [
    { assetClass: 'equity', targetPercentage: 70, rationale: '', subTargets: [{ name: 'Mondo', targetPercentage: 100, instrument: 'ETF ornitorinco' }] },
    { assetClass: 'bonds', targetPercentage: 30, rationale: '', subTargets: [] },
  ],
  assetRoles: [],
  goals: [{ name: 'La casa al lago', priority: 'media', targetAmount: 2000, assignments: [], rationale: '' }],
  reviewByIso: '2027-11-08',
  reviewReason: 'Un anno, per vedere i bond.',
  risks: ['Un calo del 30% delle azioni.', 'I tassi che salgono.'],
};

const SEVEN = [
  '## In una frase',
  'La proposta regge.',
  "## L'allocazione proposta",
  'Settanta e trenta.',
  '## Gli strumenti',
  'ETF ornitorinco.',
  '## Gli obiettivi',
  'La casa al lago.',
  '## Casa, fondi pensione e illiquidi',
  'Il Fondo fenicottero resta fuori.',
  '## Cosa fare adesso',
  'Compra a rate.',
  '## Rischi e revisione',
  'Rivedi fra un anno.',
].join('\n');

function makeDocument(overrides: Partial<AllocationAdviceDocument> = {}): AllocationAdviceDocument {
  return {
    userId: 'u1',
    status: 'ready',
    answers: initialAnswers(null, null, []),
    stage: 'review',
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    strategy: { markdown: '## La situazione\nA.', proposal: PROPOSAL, model: 'opus-finto', finishedAt: NOW },
    instruments: {
      markdown: 'Strumenti finti.',
      candidates: { sleeves: [{ assetClass: 'equity', subTarget: 'Mondo', candidates: [{ name: 'ETF ornitorinco', exchange: 'XMIL', note: '', alreadyHeld: true }] }] },
      model: 'sonnet-finto',
      webSearchUsed: true,
      finishedAt: NOW,
    },
    report: { markdown: SEVEN, proposal: PROPOSAL, model: 'opus-finto', finishedAt: NOW },
    error: null,
    applied: null,
    interview: { rounds: [{ note: 'Vedo un reddito concentrato.', satisfied: true, questions: [], answers: [], model: 'opus-finto', askedAt: NOW }], skipped: false },
    revisions: [{ request: 'meno ornitorinchi', at: NOW }],
    ...overrides,
  };
}

const ROLES = { changes: [{ assetId: 'a1', assetName: 'Fondo fenicottero', from: 'tradable' as const, to: 'excluded' as const, reason: 'Un fondo pensione.' }], unmatched: [] };

function Host({ document, initialPage = null, onPage }: { document: AllocationAdviceDocument; initialPage?: string | null; onPage?: (id: BookPageId) => void }) {
  const [pageId, setPageId] = useState<string | null>(initialPage);
  const revision = useConsulenteRevision('u1');
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  const rows = proposal ? buildProposalRows(proposal, { equity: 60, bonds: 40 }) : [];
  const applyState: ApplyState = { phase: 'idle' };
  return (
    <ConsulenteBook
      ownerId="u1"
      document={document}
      verdict={buildConsulenteVerdict(document, '2026-11-08')}
      proposal={proposal}
      rows={rows}
      roles={ROLES}
      goalPlan={null}
      revision={revision}
      apply={{ document, proposal, rows, roles: ROLES, goalPlan: null, goalsCount: 0, applySummary: 'Scrive i target.', applyTargets: true, setApplyTargets: () => {}, applyRoles: true, setApplyRoles: () => {}, applyGoals: true, setApplyGoals: () => {}, applyState }}
      canApply
      onApply={() => {}}
      pageId={pageId}
      onPageChange={(id) => {
        setPageId(id);
        onPage?.(id);
      }}
      onRedo={() => {}}
    />
  );
}

function renderBook(document = makeDocument(), initialPage: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Host document={document} initialPage={initialPage} />
    </QueryClientProvider>
  );
  const rerenderWith = (next: AllocationAdviceDocument) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <Host document={next} initialPage={initialPage} />
      </QueryClientProvider>
    );
  return { ...view, rerenderWith };
}

/** The card: the one `section` named «Pagina n di N · …» (the print sheet's sections have no name). */
const card = () => screen.getByRole('region', { name: /^Pagina \d+ di \d+/ });
const button = (name: string | RegExp) => within(card()).getByRole('button', { name });
/**
 * The turn has settled on `id`: one scene, and it is the new page's. The card's name changes at
 * once, while the page that leaves is still exiting — and jsdom ignores `inert`, so a click before
 * this would land on the leaving page's buttons.
 */
const landed = (id: string) =>
  waitFor(() => {
    const scenes = card().querySelectorAll('[data-scene]');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].getAttribute('data-scene')).toBe(id);
  });

let replaceSpy: ReturnType<typeof vi.spyOn>;
let pushSpy: ReturnType<typeof vi.spyOn>;
let scrollSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  compact = true;
  window.history.replaceState(null, '', '/dashboard/allocation/consulente');
  replaceSpy = vi.spyOn(window.history, 'replaceState');
  pushSpy = vi.spyOn(window.history, 'pushState');
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy as unknown as Element['scrollIntoView'];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the book: one page at a time', () => {
  it('turns forward and back, the headline takes the focus, one scene once settled, one h2 per page', async () => {
    const user = userEvent.setup();
    renderBook();
    expect(card().getAttribute('aria-label')).toBe('Pagina 1 di 10 · In una frase');
    expect(within(card()).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect((button('Indietro') as HTMLButtonElement).disabled).toBe(true);

    await user.click(button('Avanti'));
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe("Pagina 2 di 10 · L'allocazione proposta"));
    await landed('allocazione');
    expect(card().querySelector('[data-scene]')?.getAttribute('data-turn')).toBe('forward');
    await waitFor(() => expect(document.activeElement?.textContent).toBe("L'allocazione proposta"));

    await user.click(button('Avanti'));
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe('Pagina 3 di 10 · Gli strumenti'));
    await landed('strumenti');
    expect(within(card()).getAllByRole('heading', { level: 2 })).toHaveLength(1);

    await user.click(button('Indietro'));
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe("Pagina 2 di 10 · L'allocazione proposta"));
    await waitFor(() => expect(card().querySelector('[data-scene]')?.getAttribute('data-turn')).toBe('back'));
  });

  it('writes the address with replaceState once per turn, never pushState', async () => {
    const user = userEvent.setup();
    renderBook();
    await user.click(button('Avanti'));
    await waitFor(() => expect(card().getAttribute('aria-label')).toMatch(/^Pagina 2/));
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(String(replaceSpy.mock.calls[0][2])).toContain('pagina=allocazione');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('scrolls the card into view only when its top is above the scroll box', async () => {
    const user = userEvent.setup();
    renderBook();
    const rect = (top: number) => ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(card(), 'getBoundingClientRect').mockReturnValue(rect(120));
    await user.click(button('Avanti'));
    await landed('allocazione');
    expect(scrollSpy).not.toHaveBeenCalled();

    vi.spyOn(card(), 'getBoundingClientRect').mockReturnValue(rect(-300));
    await user.click(button('Avanti'));
    await waitFor(() => expect(card().getAttribute('aria-label')).toMatch(/^Pagina 3/));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.calls[0][0]).toMatchObject({ block: 'start' });
  });

  it('opens on the page the address names, and an unknown one is the cover', () => {
    renderBook(makeDocument(), 'strumenti');
    expect(card().getAttribute('aria-label')).toBe('Pagina 3 di 10 · Gli strumenti');
  });

  it('an unknown page id is the cover', () => {
    renderBook(makeDocument(), 'nessuna');
    expect(card().getAttribute('aria-label')).toBe('Pagina 1 di 10 · In una frase');
  });
});

describe('the pager and «Indice»', () => {
  it('«Indice» lists the pages, the current one marked; a row turns and closes; the current row only closes', async () => {
    const user = userEvent.setup();
    renderBook(makeDocument(), 'strumenti');
    await user.click(button('Indice'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Vai a una pagina')).not.toBeNull();
    const rows = within(dialog).getAllByRole('button').filter((row) => / · /.test(row.textContent ?? ''));
    expect(rows).toHaveLength(10);
    expect(rows.filter((row) => row.getAttribute('aria-current') === 'page').map((row) => row.textContent)).toEqual(['3 · Gli strumenti']);

    await user.click(rows[2]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(replaceSpy).not.toHaveBeenCalled();

    await user.click(button('Indice'));
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: '7 · Rischi e revisione' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe('Pagina 7 di 10 · Rischi e revisione'));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Rischi e revisione'));
  });

  it('no «Avanti» on the last page; on «Chiedi una modifica» «Avanti» is an outline button', () => {
    const { unmount } = renderBook(makeDocument(), 'applica');
    expect(within(card()).queryByRole('button', { name: 'Avanti' })).toBeNull();
    expect(button('Applica alle impostazioni')).not.toBeNull();
    unmount();
    renderBook(makeDocument(), 'modifica');
    expect(button('Avanti').className).toContain('bg-background');
    expect(button('Rivedi il report').className).toContain('var(--ai-glow)');
  });

  it('a failed document: no «Applica alle impostazioni» on the last page, only «Rifai il percorso»', () => {
    renderBook(makeDocument({ status: 'failed', error: 'Il servizio AI non ha risposto.' }), 'applica');
    expect(within(card()).queryByRole('button', { name: 'Applica alle impostazioni' })).toBeNull();
    expect(button('Rifai il percorso')).not.toBeNull();
  });

  it('from desktop the rail is the index: its labels are buttons, «Gli strumenti» turns there', async () => {
    compact = false;
    const user = userEvent.setup();
    renderBook();
    const rail = screen.getByRole('list', { name: 'Le pagine' });
    await user.click(within(rail).getByRole('button', { name: 'Gli strumenti' }));
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe('Pagina 3 di 10 · Gli strumenti'));
  });
});

describe('the pages keep their figures and their author', () => {
  it('the accent follows the author: one [data-generated] at most, none on the three pages that ask or quote', () => {
    const expected: Record<string, boolean> = { copertina: true, allocazione: true, strumenti: true, obiettivi: true, ruoli: true, passi: true, rischi: true, colloquio: false, modifica: false, applica: false };
    for (const [id, generated] of Object.entries(expected)) {
      const { unmount, container } = renderBook(makeDocument(), id);
      expect(card().hasAttribute('data-generated')).toBe(generated);
      expect(container.querySelectorAll('[data-generated]').length).toBe(generated ? 1 : 0);
      unmount();
    }
  });

  it('the cover without model text is a plain card (the degenerate book), the text page is accented', () => {
    const { unmount } = renderBook(makeDocument({ report: { markdown: 'Solo testo.', proposal: PROPOSAL, model: 'opus-finto', finishedAt: NOW } }));
    expect(card().hasAttribute('data-generated')).toBe(false);
    unmount();
    renderBook(makeDocument({ report: { markdown: 'Solo testo.', proposal: PROPOSAL, model: 'opus-finto', finishedAt: NOW } }), 'report');
    expect(card().getAttribute('aria-label')).toBe('Pagina 2 di 10 · Il report');
    expect(card().hasAttribute('data-generated')).toBe(true);
    expect(within(card()).getByText(/opus-finto ·/)).not.toBeNull();
  });

  it('the proposal page keeps its base footnote; the review date, its reason and the risks are on «Rischi e revisione»; the model sits on the cover', () => {
    const { unmount } = renderBook(makeDocument(), 'allocazione');
    expect(within(card()).getByText('Percentuali sulla base della pagina Allocazione (negoziabile e non negoziabile, al netto dei debiti).')).not.toBeNull();
    expect(card().textContent).not.toContain('Rivedi entro');
    expect(card().textContent).not.toContain('opus-finto');
    unmount();

    const risks = renderBook(makeDocument(), 'rischi');
    expect(within(card()).getByText('Un anno, per vedere i bond.')).not.toBeNull();
    expect(within(card()).getByText('rivedi entro il 08/11/2027')).not.toBeNull();
    expect(within(within(card()).getByRole('list', { name: 'Rischi' })).getAllByRole('listitem')).toHaveLength(2);
    risks.unmount();

    renderBook();
    expect(within(card()).getByText(/opus-finto ·/)).not.toBeNull();
  });

  it('the page is remembered by id: a document that lost «Cosa fare adesso» keeps the reader on «Chiedi una modifica»; on «passi» it falls to the cover', async () => {
    const lost = makeDocument({ report: { markdown: SEVEN.replace('## Cosa fare adesso\nCompra a rate.\n', ''), proposal: PROPOSAL, model: 'opus-finto', finishedAt: NOW }, updatedAt: new Date('2026-11-08T13:00:00') });
    const first = renderBook(makeDocument(), 'modifica');
    expect(card().getAttribute('aria-label')).toBe('Pagina 9 di 10 · Chiedi una modifica');
    first.rerenderWith(lost);
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe('Pagina 8 di 9 · Chiedi una modifica'));
    first.unmount();

    const second = renderBook(makeDocument(), 'passi');
    expect(card().getAttribute('aria-label')).toBe('Pagina 6 di 10 · Cosa fare adesso');
    second.rerenderWith(lost);
    await waitFor(() => expect(card().getAttribute('aria-label')).toBe('Pagina 1 di 9 · In una frase'));
  });

  it('the revision’s draft survives a turn', async () => {
    const user = userEvent.setup();
    renderBook(makeDocument(), 'modifica');
    await user.type(within(card()).getByLabelText('Cosa vuoi cambiare'), 'più fenicotteri');
    await user.click(button('Indietro'));
    await landed('colloquio');
    await user.click(button('Avanti'));
    await landed('modifica');
    expect((within(card()).getByLabelText('Cosa vuoi cambiare') as HTMLTextAreaElement).value).toBe('più fenicotteri');
  });

  it('the print sheet holds every page but the two that act, with no button, no accent, no textarea', () => {
    const { container } = renderBook();
    const sheet = container.querySelector('[data-book-print]') as HTMLElement;
    const titles = Array.from(sheet.querySelectorAll('h2')).map((heading) => heading.textContent);
    expect(titles).toContain('Gli strumenti');
    expect(titles).not.toContain('Chiedi una modifica');
    expect(titles).not.toContain('Applica');
    expect(sheet.querySelector('button')).toBeNull();
    expect(sheet.querySelector('[data-generated]')).toBeNull();
    expect(sheet.querySelector('textarea')).toBeNull();
  });
});
