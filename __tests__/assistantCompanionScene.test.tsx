/**
 * The Assistente page at a change of mode (2026-11, DESIGN.md § 5 «The Assistente page»): the
 * companion column's content is a scene keyed by the mode — it slides in from the right into
 * Registra and back from the left, a cross-fade with no travel under reduced motion — while the
 * «Conversazione» tile is outside it and stays still. Also the way in and out of Registra as the
 * page wires it: the header action, the strip in place of the period axis, «Torna all'analisi».
 *
 * The page's reads are mocked (no thread, no memory, a period with no bundle); the stream hook
 * and the composition are real. The scene's first frame is read at the INSERTION of its node —
 * framer writes the `enter` variant as inline style in that render, before any animation frame.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { searchParamsMock, routerReplaceMock, threadsMock, openedThreadIds } = vi.hoisted(() => ({
  openedThreadIds: [] as (string | undefined)[],
  searchParamsMock: { value: new URLSearchParams() },
  routerReplaceMock: vi.fn(),
  threadsMock: { value: [] as unknown[] },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn() }),
  usePathname: () => '/dashboard/assistant',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/hooks/useDashboardOverview', () => ({ useDashboardOverview: () => ({ data: undefined, isError: false }) }));
vi.mock('@/lib/hooks/useAssistantMemory', () => ({
  useAssistantMemory: () => ({ data: undefined, isLoading: false, error: null }),
  useUpdateAssistantMemory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/useAssistantThreads', () => ({
  useAssistantThreads: () => ({ data: threadsMock.value, isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  useAssistantThread: (threadId: string | undefined) => {
    openedThreadIds.push(threadId);
    return { data: undefined, isLoading: false, error: null };
  },
  useDeleteAssistantThread: () => ({ mutateAsync: vi.fn(), variables: undefined }),
}));
vi.mock('@/lib/hooks/useAssistantPeriodContext', () => ({ useAssistantPeriodContext: () => ({ data: undefined, isLoading: false }) }));
// The four reads of Registra: one account, two categories.
vi.mock('@/lib/hooks/useExpenses', () => ({
  useExpenseCategories: () => ({
    data: [
      { id: 'cat-cibo', userId: 'owner-1', name: 'Cibo', type: 'variable', subCategories: [] },
      { id: 'cat-stipendio', userId: 'owner-1', name: 'Stipendio', type: 'income', subCategories: [] },
    ],
    isLoading: false, isError: false,
  }),
}));
vi.mock('@/lib/hooks/useAssets', () => ({
  useAssets: () => ({
    data: [{ id: 'acc-main', userId: 'owner-1', name: 'Conto principale', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' }],
    isLoading: false, isError: false,
  }),
}));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => ({ data: { defaultDebitCashAssetId: 'acc-main' }, isLoading: false, isError: false }) }));
vi.mock('@/lib/hooks/useCostCenters', () => ({ useCostCenters: () => ({ data: [], isLoading: false, isError: false }) }));
// Surfaces with reads of their own, none of them part of the scene.
vi.mock('@/components/assistant/AssistantModals', () => ({ AssistantModals: () => null }));
vi.mock('@/components/assistant/AssistantSuggestionsBanner', () => ({ AssistantSuggestionsBanner: () => null }));
vi.mock('@/components/assistant/AssistantPreferencesPopover', () => ({ AssistantPreferencesPopover: () => null }));

import { AssistantPageClient } from '@/components/assistant/AssistantPageClient';

/**
 * `window.matchMedia` for this file, installed BEFORE the first render (domSetup.ts): framer reads
 * the reduced-motion query once, at its first use, and afterwards only hears the query's `change`
 * event — so the stub keeps ONE list per query, with real listeners, and `setReducedMotion` flips
 * its answer and fires the event. A list rebuilt per call would leave framer on its first answer.
 */
const mediaLists = new Map<string, { list: MediaQueryList; listeners: Set<() => void> }>();
let reducedMotion = false;
window.matchMedia = (query: string): MediaQueryList => {
  const known = mediaLists.get(query);
  if (known) return known.list;
  const listeners = new Set<() => void>();
  const list = {
    get matches() {
      return reducedMotion && query.includes('prefers-reduced-motion');
    },
    media: query, onchange: null,
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  mediaLists.set(query, { list, listeners });
  return list;
};
function setReducedMotion(reduced: boolean) {
  reducedMotion = reduced;
  mediaLists.forEach(({ listeners }) => listeners.forEach((listener) => listener()));
}

/** The inline style of every scene node at the moment it enters the document, by mode. */
function recordSceneInsertions(container: HTMLElement): Record<string, { transform: string; opacity: string }> {
  const seen: Record<string, { transform: string; opacity: string }> = {};
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const scene = node.matches('[data-scene]') ? node : node.querySelector<HTMLElement>('[data-scene]');
        const mode = scene?.getAttribute('data-scene');
        if (scene && mode && !(mode in seen)) seen[mode] = { transform: scene.style.transform, opacity: scene.style.opacity };
      });
    }
  });
  observer.observe(container, { childList: true, subtree: true });
  return seen;
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AssistantPageClient assistantConfigured />
    </QueryClientProvider>,
  );
}

/** «Registra» in the header — PageHeader draws its actions twice (the sticky bar and the page), one of them shown. */
const registerAction = () => screen.getAllByRole('button', { name: "Registra una spesa o un'entrata" })[0];

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsMock.value = new URLSearchParams();
  threadsMock.value = [];
  openedThreadIds.length = 0;
  setReducedMotion(false);
});
afterEach(() => {
  setReducedMotion(false);
});

describe('the Assistente page — the companion scene', () => {
  it('keys the companion’s content by the mode and leaves the «Conversazione» tile outside the scene', () => {
    const { container } = renderPage();
    const scenes = container.querySelectorAll('[data-scene]');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].getAttribute('data-scene')).toBe('month_analysis');
    // The first render does not move.
    expect((scenes[0] as HTMLElement).style.transform).not.toContain('translate');

    const conversation = screen.getByLabelText("Scrivi un messaggio all'assistente");
    expect(conversation.closest('[data-scene]')).toBeNull();
    expect(scenes[0].contains(conversation)).toBe(false);
    // The tile that holds the conversation is not in the scene either.
    const tile = screen.getByText('Conversazione').closest('section, article, div[class*="rounded"]') as HTMLElement;
    expect(tile.closest('[data-scene]')).toBeNull();
    expect(tile.hasAttribute('data-scene')).toBe(false);
  });

  it('slides the companion in from the right into Registra, with the conversation’s node kept', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const composerBefore = screen.getByLabelText("Scrivi un messaggio all'assistente");
    const seen = recordSceneInsertions(container);

    await user.click(registerAction());
    await waitFor(() => expect(container.querySelector('[data-scene="register"]')).not.toBeNull());

    // Forward: the `enter` variant of the scene, 24px from the right, transparent.
    expect(seen.register.transform).toContain('translateX(24px)');
    expect(seen.register.opacity).toBe('0');
    await waitFor(() => expect(container.querySelectorAll('[data-scene]')).toHaveLength(1));
    // The conversation did not remount: same textarea node, now focused.
    expect(screen.getByLabelText("Scrivi un messaggio all'assistente")).toBe(composerBefore);
    expect(document.activeElement).toBe(composerBefore);
  });

  it('slides back from the left on «Torna all’analisi»', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(registerAction());
    await waitFor(() => expect(container.querySelector('[data-scene="register"]')).not.toBeNull());
    await waitFor(() => expect(container.querySelectorAll('[data-scene]')).toHaveLength(1));

    const seen = recordSceneInsertions(container);
    await user.click(screen.getByRole('button', { name: "Torna all'analisi" }));
    await waitFor(() => expect(container.querySelector('[data-scene="month_analysis"]')).not.toBeNull());
    expect(seen.month_analysis.transform).toContain('translateX(-24px)');
  });

  it('cross-fades with no travel under reduced motion', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    const { container } = renderPage();
    const seen = recordSceneInsertions(container);

    await user.click(registerAction());
    await waitFor(() => expect(container.querySelector('[data-scene="register"]')).not.toBeNull());
    expect(seen.register.transform).toBe('');
    expect(seen.register.opacity).toBe('0');
  });
});

describe('the Assistente page — in and out of Registra', () => {
  it('swaps the period axis for the strip, shows what the browser knows, and offers no analysis row', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('tablist', { name: 'Periodo di analisi' })).not.toBeNull();

    await user.click(registerAction());

    expect(screen.queryByRole('tablist', { name: 'Periodo di analisi' })).toBeNull();
    expect(screen.getByText("Registra · l'Assistente conosce categorie, conti e le ultime righe")).not.toBeNull();
    // The verdict is computed, never the skeleton: the two categories and the one account read.
    const verdict = screen.getByRole('region', { name: 'Verdetto sul contesto' });
    expect(verdict.textContent).toContain("Registra una spesa o un'entrata.");
    expect(verdict.textContent?.replace(/ /g, ' ')).toContain('Conosco 2 categorie e 1 conto');
    expect(verdict.querySelector('[data-generated]')).toBeNull();
    await waitFor(() => expect(screen.getByText("Cosa conosce l'Assistente")).not.toBeNull());
    const scene = document.querySelector('[data-scene="register"]') as HTMLElement;
    expect(scene.textContent).toContain('Conto principale');
    expect(scene.querySelector('[data-generated]')).toBeNull();
    expect(screen.getByPlaceholderText('Scrivi cosa hai speso o incassato…')).not.toBeNull();
    expect(screen.queryByText('Domande suggerite')).toBeNull();
  });

  it('«Torna all’analisi» gives the axis back, on the month, and cleans the URL it was opened with', async () => {
    searchParamsMock.value = new URLSearchParams('mode=registra');
    const user = userEvent.setup();
    renderPage();
    // `?mode=registra` does what the action does, once the thread list has answered.
    await waitFor(() => expect(screen.getByRole('button', { name: "Torna all'analisi" })).not.toBeNull());

    await user.click(screen.getByRole('button', { name: "Torna all'analisi" }));
    const axis = screen.getByRole('tablist', { name: 'Periodo di analisi' });
    expect(axis.querySelector('[aria-selected="true"]')?.textContent).toBe('Mese');
    expect(routerReplaceMock).toHaveBeenCalledWith('/dashboard/assistant');
    expect(screen.queryByRole('button', { name: "Torna all'analisi" })).toBeNull();
  });

  it('does not touch the URL when Registra was entered from the header', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(registerAction());
    await user.click(screen.getByRole('button', { name: "Torna all'analisi" }));
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});

describe('the Assistente page — the day’s register thread', () => {
  const todayThread = () => ({
    id: 'thread-today', userId: 'owner-1', title: 'Registrazioni · oggi', mode: 'register', createdAt: new Date(), updatedAt: new Date(),
    lastMessagePreview: '', messageCount: 2, pinnedMonth: null, pinnedYear: null,
  });

  it('opens the day’s thread even when the list comes to hold it AFTER Registra was entered', async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(registerAction());
    expect(openedThreadIds.at(-1)).toBeUndefined();
    // The list answers late (or is refetched): the day's thread is the open one, with no new gesture.
    threadsMock.value = [todayThread()];
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AssistantPageClient assistantConfigured />
      </QueryClientProvider>,
    );
    expect(openedThreadIds.at(-1)).toBe('thread-today');
  });

  it('never opens it outside Registra', () => {
    threadsMock.value = [todayThread()];
    renderPage();
    expect(openedThreadIds.every((id) => id === undefined)).toBe(true);
  });
});
