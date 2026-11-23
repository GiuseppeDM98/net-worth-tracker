/**
 * The Assistente page as only a chat (2026-11-12; DESIGN.md § 5 «The Assistente page»): no period
 * axis and no «Registra» button — every message goes as `mode: 'auto'`, and the mode a turn is
 * shown in is its answer's, set by the stream's `route` event. The companion column's content is
 * a scene keyed by that mode — it slides forward into a registration, a cross-fade under reduced
 * motion — while the «Conversazione» tile stays still. Also the suggestions of an empty chat, the
 * two URL params, the «⋯» menu's focus return, «cambia» → «Rileggi», and the route a question
 * card's answer carries.
 *
 * The page's reads are mocked; the stream hook, the composition and the modals are real. The
 * fetch answers a faked SSE body that the test writes event by event, so a turn can be held open.
 * The scene's first frame is read at the INSERTION of its node — framer writes the `enter`
 * variant as inline style in that render, before any animation frame.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AssistantMessage, AssistantRouteReading, AssistantStreamEvent, AssistantThreadDetail } from '@/types/assistant';

const { searchParamsMock, threadsMock, openedThreadIds, overviewMock, threadDetails, authenticatedFetchMock } = vi.hoisted(() => ({
  openedThreadIds: [] as (string | undefined)[],
  searchParamsMock: { value: new URLSearchParams() },
  threadsMock: { value: [] as unknown[], loading: false },
  overviewMock: { value: { data: undefined, isError: true } as { data: unknown; isError: boolean } },
  threadDetails: { value: {} as Record<string, unknown> },
  authenticatedFetchMock: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/dashboard/assistant',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/hooks/useDashboardOverview', () => ({ useDashboardOverview: () => overviewMock.value }));
// One fact in memory: the companion's «Cosa sa di te» tile shows «Apri memoria».
vi.mock('@/lib/hooks/useAssistantMemory', () => ({
  useAssistantMemory: () => ({
    data: {
      userId: 'owner-1',
      items: [{ id: 'fact-1', category: 'preference', text: 'Preferisco risposte brevi', status: 'active', createdAt: new Date(), updatedAt: new Date() }],
      preferences: { responseStyle: 'balanced', includeMacroContext: false, memoryEnabled: true, includeDummySnapshots: false },
    },
    isLoading: false,
    error: null,
  }),
  useUpdateAssistantMemory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/useAssistantThreads', () => ({
  useAssistantThreads: () => ({ data: threadsMock.value, isLoading: threadsMock.loading, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  useAssistantThread: (threadId: string | undefined) => {
    openedThreadIds.push(threadId);
    return { data: threadId ? threadDetails.value[threadId] : undefined, isLoading: false, error: null };
  },
  useDeleteAssistantThread: () => ({ mutateAsync: vi.fn(), variables: undefined }),
}));
vi.mock('@/lib/hooks/useAssistantPeriodContext', () => ({ useAssistantPeriodContext: () => ({ data: undefined, isLoading: false }) }));
// The four reads of a registration: one account, two categories.
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
    data: [
      { id: 'acc-a', userId: 'owner-1', name: 'Conto A', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' },
      { id: 'acc-b', userId: 'owner-1', name: 'Conto B', type: 'cash', assetClass: 'cash', quantity: 500, currentPrice: 1, currency: 'EUR' },
    ],
    isLoading: false, isError: false,
  }),
}));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => ({ data: { defaultDebitCashAssetId: 'acc-a' }, isLoading: false, isError: false }) }));
vi.mock('@/lib/hooks/useCostCenters', () => ({ useCostCenters: () => ({ data: [], isLoading: false, isError: false }) }));
// The modals are real (their focus return is under test); their bodies have reads of their own.
vi.mock('@/components/assistant/AssistantMemoryPanel', () => ({ AssistantMemoryPanel: () => <p>Pannello memoria</p> }));
vi.mock('@/components/assistant/AssistantThreadList', () => ({ AssistantThreadList: () => <p>Lista conversazioni</p> }));
vi.mock('@/components/assistant/AssistantPreferencesFields', () => ({ AssistantPreferencesFields: () => <p>Stile di risposta</p> }));
vi.mock('@/components/assistant/AssistantSuggestionsBanner', () => ({ AssistantSuggestionsBanner: () => null }));

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

/** A faked SSE answer the test writes event by event: a turn stays open until `close`. */
function openStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (...events: AssistantStreamEvent[]) =>
      act(async () => {
        for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }),
    close: () =>
      act(async () => {
        controller.close();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }),
  };
}
type Stream = ReturnType<typeof openStream>;

/** Every fetch answers the next stream the test queued. */
const streams: Stream[] = [];
function queueStream(): Stream {
  const stream = openStream();
  streams.push(stream);
  return stream;
}
/** The stream requests alone: a question card's answer also saves its state on the message (another route). */
const streamCalls = () => authenticatedFetchMock.mock.calls.filter(([url]) => url === '/api/ai/assistant/stream');
const bodies = () => streamCalls().map(([, init]) => JSON.parse(init.body));

const reading = (intent: AssistantRouteReading['route']['intent'], period: AssistantRouteReading['route']['period']): AssistantRouteReading =>
  ({ route: { intent, period, webSearch: false, confidence: 0.9 }, source: 'router' });
const OCTOBER = reading('month_analysis', { kind: 'month', year: 2026, month: 10 });
const REGISTER = reading('register', { kind: 'none' });
const FREE = reading('chat', { kind: 'none' });

/** One whole answer: meta, its reading, a sentence, done — then the stream closes. */
async function answer(stream: Stream, r: AssistantRouteReading | null, text = 'Fatto.', messageId = 'msg-1') {
  await stream.push(
    { type: 'meta', threadId: 'thread-new', title: 'Nuova' },
    ...(r ? [{ type: 'route' as const, reading: r }] : []),
    { type: 'text', text },
    { type: 'done', threadId: 'thread-new', messageId, webSearchUsed: false },
  );
  await stream.close();
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <AssistantPageClient assistantConfigured />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerender: () => view.rerender(tree()) };
}

const composer = () => screen.getByLabelText("Scrivi un messaggio all'assistente") as HTMLTextAreaElement;
async function send(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(composer(), text);
  await user.keyboard('{Enter}');
}

const fence = (body: string) => `\`\`\`assistant-question\n${body}\n\`\`\``;
const QUESTION = [
  'Mi serve un dettaglio.',
  fence(JSON.stringify({ id: 'account:from', kind: 'single', text: 'Da quale conto?', options: [{ value: 'acc-a', label: 'Conto A' }, { value: 'acc-b', label: 'Conto B' }], allowOther: true })),
].join('\n\n');

function plantThread(id: string, messages: Omit<AssistantMessage, 'threadId' | 'userId' | 'createdAt'>[], mode: AssistantMessage['mode'] = 'chat') {
  const at = new Date('2026-11-10T10:00:00Z').getTime();
  const detail: AssistantThreadDetail = {
    thread: { id, userId: 'owner-1', title: 'Piantata', mode, createdAt: new Date(at), updatedAt: new Date(at), lastMessagePreview: '', messageCount: messages.length, pinnedMonth: null, pinnedYear: null },
    messages: messages.map((message, index) => ({ ...message, threadId: id, userId: 'owner-1', createdAt: new Date(at + index * 1000) })),
  } as AssistantThreadDetail;
  threadDetails.value[id] = detail;
  return detail;
}

let replaceStateSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  searchParamsMock.value = new URLSearchParams();
  threadsMock.value = [];
  threadsMock.loading = false;
  overviewMock.value = { data: undefined, isError: true };
  threadDetails.value = {};
  openedThreadIds.length = 0;
  streams.length = 0;
  authenticatedFetchMock.mockImplementation(async (url: string) =>
    url === '/api/ai/assistant/stream' ? (streams.shift() ?? openStream()).response : new Response('{}', { status: 200 }));
  replaceStateSpy = vi.spyOn(window.history, 'replaceState');
  setReducedMotion(false);
  HTMLElement.prototype.scrollIntoView ??= () => undefined;
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  setReducedMotion(false);
  replaceStateSpy.mockRestore();
});

describe('the Assistente page — only a chat', () => {
  it('has no period axis, no «Registra» and no «Torna all’analisi»; the scene starts on the free question', () => {
    const { container } = renderPage();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registra un movimento' })).toBeNull();
    expect(screen.queryByRole('button', { name: "Torna all'analisi" })).toBeNull();
    const scenes = container.querySelectorAll('[data-scene]');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].getAttribute('data-scene')).toBe('chat');
    expect(scenes[0].contains(composer())).toBe(false);
  });

  // P1. Seen RED with the scene settled on a constant, and with the placeholders born `'chat'`.
  it('slides the companion forward when a `route` event reads a registration, with the conversation’s node kept', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const composerBefore = composer();
    const seen = recordSceneInsertions(container);
    const first = queueStream();
    await send(user, 'ho speso 50 euro');
    await answer(first, REGISTER);

    await waitFor(() => expect(container.querySelector('[data-scene="register"]')).not.toBeNull());
    expect(seen.register.transform).toContain('translateX(24px)');
    expect(seen.register.opacity).toBe('0');
    expect(composer()).toBe(composerBefore);
    await waitFor(() => expect(within(container.querySelector('[data-scene="register"]') as HTMLElement).getByText(/Conto A/)).not.toBeNull());

    // A second send keeps the registration's scene until its own reading arrives.
    const second = queueStream();
    await send(user, 'e 20 di benzina');
    await second.push({ type: 'meta', threadId: 'thread-new', title: 'Nuova' });
    // The verdict follows the mode at once (no exit animation keeps an old one in the DOM).
    const verdict = () => screen.getByRole('region', { name: 'Verdetto sul contesto' }).textContent;
    expect(verdict()).toContain('Registra un movimento.');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect(container.querySelector('[data-scene="register"]')).not.toBeNull();
    expect(container.querySelector('[data-scene="chat"]')).toBeNull();
    await second.push({ type: 'route', reading: FREE });
    await waitFor(() => expect(container.querySelector('[data-scene="chat"]')).not.toBeNull());
    await second.close();
  });

  it('cross-fades with no travel under reduced motion', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    const { container } = renderPage();
    const seen = recordSceneInsertions(container);
    const stream = queueStream();
    await send(user, 'ho speso 50 euro');
    await answer(stream, REGISTER);
    await waitFor(() => expect(container.querySelector('[data-scene="register"]')).not.toBeNull());
    expect(seen.register.transform).toBe('');
    expect(seen.register.opacity).toBe('0');
  });
});

describe('the Assistente page — the suggestions of an empty chat', () => {
  // P2. Seen RED with a suggestion that calls `submit`, and with the `unknown` rows while loading.
  it('a suggestion fills the composer and focuses it, the caret at the end, and sends nothing', async () => {
    const user = userEvent.setup();
    renderPage();
    const list = screen.getByRole('list', { name: 'Domande suggerite' });
    await user.click(within(list).getByRole('button', { name: /^Oggi ho speso/ }));
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    expect(composer().value).toBe('Oggi ho speso ');
    expect(composer().selectionStart).toBe('Oggi ho speso '.length);
    expect(authenticatedFetchMock).not.toHaveBeenCalled();
  });

  it('shows four skeleton rows and no button while the account’s overview loads', () => {
    overviewMock.value = { data: undefined, isError: false };
    renderPage();
    expect(screen.queryByRole('list', { name: 'Domande suggerite' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Com'è andato|Oggi ho speso/ })).toBeNull();
  });

  // P3. Seen RED keeping the param, and with the effect run at mount.
  it('`?mode=registra` puts the register rows first, focuses the composer and drops the param once the threads answered', async () => {
    searchParamsMock.value = new URLSearchParams('mode=registra');
    threadsMock.loading = true;
    const view = renderPage();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(replaceStateSpy).not.toHaveBeenCalled();

    threadsMock.loading = false;
    view.rerender();
    const list = screen.getByRole('list', { name: 'Domande suggerite' });
    expect(within(list).getAllByRole('button').map((row) => row.textContent)).toEqual([
      'Oggi ho speso…', 'Ho ricevuto lo stipendio di…', 'Ho spostato…', "Com'è andato ",
    ].map((label) => expect.stringContaining(label)));
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(String(replaceStateSpy.mock.calls[0][2])).not.toContain('mode=');
  });
});

describe('the Assistente page — the conversation in the URL', () => {
  // P4. Seen RED never writing the param, and with `changeableMessageId` without `!isStreaming`.
  it('`?thread=` opens that thread; a new thread is written to the URL; «Nuova conversazione» removes it', async () => {
    plantThread('t1', [
      { id: 'u-1', role: 'user', content: 'ciao', mode: 'chat' },
      { id: 'a-1', role: 'assistant', content: 'Ciao.', mode: 'chat' },
    ]);
    searchParamsMock.value = new URLSearchParams('thread=t1');
    renderPage();
    expect(openedThreadIds[0]).toBe('t1');
    expect(screen.getByText('Ciao.')).not.toBeNull();
  });

  it('writes `?thread=` at a new thread’s `meta`, offers no «cambia» while the turn is open, and drops the param on «Nuova conversazione»', async () => {
    const user = userEvent.setup();
    renderPage();
    const stream = queueStream();
    await send(user, 'com’è andato ottobre?');
    await stream.push({ type: 'meta', threadId: 'thread-new', title: 'Ottobre' }, { type: 'route', reading: OCTOBER }, { type: 'text', text: 'Bene.' },
      { type: 'done', threadId: 'thread-new', messageId: 'msg-1', webSearchUsed: false });
    expect(replaceStateSpy.mock.calls.some((call: unknown[]) => String(call[2]).includes('thread=thread-new'))).toBe(true);
    // `done` arrived, the stream is still open: the line reads, «cambia» waits for the end.
    expect(screen.getByText('Ho letto: analisi di ottobre 2026')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambia come ho letto la domanda' })).toBeNull();
    await stream.close();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cambia come ho letto la domanda' })).not.toBeNull());

    replaceStateSpy.mockClear();
    await user.click(screen.getAllByRole('button', { name: 'Nuova conversazione' })[0]);
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(String(replaceStateSpy.mock.calls[0][2])).not.toContain('thread=');
  });
});

describe('the Assistente page — the tile’s aside and «cambia»', () => {
  // P5. Seen RED with the aside from a constant, and with «Rileggi» focusing the textarea.
  it('reads «Analisi di ottobre 2026» after that reading, and nothing on an empty chat', async () => {
    const user = userEvent.setup();
    renderPage();
    const tile = screen.getByRole('region', { name: 'Conversazione' });
    expect(within(tile).queryByText(/^Analisi di|^Registra ·|^Domanda/)).toBeNull();
    const stream = queueStream();
    await send(user, 'com’è andato ottobre?');
    await answer(stream, OCTOBER);
    await waitFor(() => expect(within(tile).getByText('Analisi di ottobre 2026')).not.toBeNull());
  });

  it('reads «Registra · senza periodo» on a planted registration with no reading, whose question is still a card', () => {
    plantThread('t-old', [
      { id: 'u-1', role: 'user', content: 'ho speso 50', mode: 'register' },
      { id: 'a-1', role: 'assistant', content: QUESTION, mode: 'register' },
    ], 'register');
    searchParamsMock.value = new URLSearchParams('thread=t-old');
    renderPage();
    const tile = screen.getByRole('region', { name: 'Conversazione' });
    expect(within(tile).getByText('Registra · senza periodo')).not.toBeNull();
    expect(within(tile).getByText('Da quale conto?')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambia come ho letto la domanda' })).toBeNull();
  });

  it('«cambia» → «Un movimento da registrare» → «Rileggi» sends the last prompt again with that route, the focus on «Interrompi risposta»', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = queueStream();
    await send(user, 'ho fatto benzina 40');
    await answer(first, FREE);
    await user.click(await screen.findByRole('button', { name: 'Cambia come ho letto la domanda' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Come devo leggerla?')).not.toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: /^Un movimento da registrare/ }));
    queueStream();
    await user.click(within(dialog).getByRole('button', { name: 'Rileggi' }));

    await waitFor(() => expect(streamCalls()).toHaveLength(2));
    expect(bodies()[1]).toMatchObject({ mode: 'auto', prompt: 'ho fatto benzina 40', route: { intent: 'register', period: { kind: 'none' }, webSearch: false } });
    expect(bodies()[1]).not.toHaveProperty('routeCarried');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Interrompi risposta' })));
    // The answer before stays: history is never rewritten.
    expect(screen.getByText('Fatto.')).not.toBeNull();
  });

  // The chooser's focus (2026-11-16, read against the code when the chat's spec was retired):
  // on open the checked radio of «Cosa mi chiedi» (the dialog's own autofocus, the first tabbable
  // in it); Esc and «Annulla» bring it back to the «cambia» that opened it, through the page's
  // `changeOpenerRef`. «cambia» is pressed with `fireEvent.click`, which focuses nothing — Safari's
  // click (CLAUDE.md § Known Issues): with `userEvent` the modal's own restore of the element
  // focused at open passes the test without the ref. Seen RED with `returnFocusTo` dropped from
  // `AssistantRouteChooser`: the focus went back to the composer, not to «cambia».
  it('«cambia» opens on the chosen reading, and Esc or «Annulla» returns the focus to «cambia»', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = queueStream();
    await send(user, 'ho fatto benzina 40');
    await answer(first, FREE);
    const change = await screen.findByRole('button', { name: 'Cambia come ho letto la domanda' });

    fireEvent.click(change);
    let dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('radio', { name: /^Una domanda/ })));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(change));

    fireEvent.click(change);
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(change));
    expect(streamCalls()).toHaveLength(1);
  });
});

describe('the Assistente page — the route an answer carries', () => {
  // Q2. Seen RED sending without `route`, and with `askingRoute` read from `routeReading` alone.
  async function answerQuestion(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('radio', { name: /^Conto B/ }));
    await user.click(screen.getByRole('button', { name: 'Rispondi' }));
    await waitFor(() => expect(streamCalls()).toHaveLength(1));
    return bodies()[0];
  }

  it('answers a question card with the asking message’s route and `routeCarried`', async () => {
    plantThread('t-q', [
      { id: 'u-1', role: 'user', content: 'ho speso 50', mode: 'register' },
      { id: 'a-1', role: 'assistant', content: QUESTION, mode: 'register', routeReading: REGISTER },
    ], 'register');
    searchParamsMock.value = new URLSearchParams('thread=t-q');
    const user = userEvent.setup();
    renderPage();
    expect(await answerQuestion(user)).toMatchObject({
      mode: 'auto', threadId: 't-q', routeCarried: true, route: { intent: 'register', period: { kind: 'none' }, webSearch: false },
    });
    expect(bodies()[0].route).not.toHaveProperty('confidence');
  });

  it('answers a card of a registration saved with no reading with the register route', async () => {
    plantThread('t-old', [
      { id: 'u-1', role: 'user', content: 'ho speso 50', mode: 'register' },
      { id: 'a-1', role: 'assistant', content: QUESTION, mode: 'register' },
    ], 'register');
    searchParamsMock.value = new URLSearchParams('thread=t-old');
    const user = userEvent.setup();
    renderPage();
    expect(await answerQuestion(user)).toMatchObject({ routeCarried: true, route: { intent: 'register', period: { kind: 'none' }, webSearch: false } });
  });

  it('sends a «Continua con» row with neither', async () => {
    plantThread('t-chat', [
      { id: 'u-1', role: 'user', content: 'ciao', mode: 'chat' },
      { id: 'a-1', role: 'assistant', content: 'Ciao.', mode: 'chat', routeReading: FREE },
    ]);
    searchParamsMock.value = new URLSearchParams('thread=t-chat');
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getByRole('list', { name: 'Continua con' })).getByRole('button', { name: /^Approfondisci/ }));
    await waitFor(() => expect(streamCalls()).toHaveLength(1));
    expect(bodies()[0]).not.toHaveProperty('route');
    expect(bodies()[0]).not.toHaveProperty('routeCarried');
  });
});

describe('the Assistente page — the «⋯» menu’s focus return', () => {
  // H2. Seen RED without `returnFocusTo`, and with `returnFocusTo={moreTriggerRef}` («Apri memoria» lost).
  it('Memoria from «⋯» returns the focus to «⋯»; from «Apri memoria» to «Apri memoria»', async () => {
    const user = userEvent.setup();
    renderPage();
    const more = screen.getAllByRole('button', { name: "Altre azioni dell'assistente" })[0];
    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: /^Memoria/ }));
    expect(await screen.findByText('Pannello memoria')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Pannello memoria')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));

    const openMemory = screen.getByRole('button', { name: /Apri memoria/ });
    await user.click(openMemory);
    expect(await screen.findByText('Pannello memoria')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Pannello memoria')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(openMemory));
  });

  it('Preferenze opens its own modal from «⋯»', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole('button', { name: "Altre azioni dell'assistente" })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Preferenze' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Come risponde l'Assistente")).not.toBeNull();
    expect(within(dialog).getByText('Stile di risposta')).not.toBeNull();
  });
});
