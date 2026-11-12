/**
 * «Chiedi una modifica» (components/allocation/consulente/ConsulenteRevisionTile.tsx): a request
 * typed enables «Rivedi il report»; a round with questions shows the cards and «Salta le domande»;
 * a round without questions sends the revision at once; «Salta le domande» sends `skipped: true`.
 * Written against the tile before the book split it (AI-07, 2026-11-11), then run on a host that
 * calls `useRevisionDraft` and renders `RevisionBody` and the two buttons, as the book does. The
 * route is a mocked `authenticatedFetch` answering SSE streams; invented figures.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import { initialAnswers } from '@/lib/utils/allocationAdviceDraft';
import { Button } from '@/components/ui/button';
import { describeRevisionAside, RevisionBody, useRevisionDraft } from '@/components/allocation/consulente/ConsulenteRevisionTile';
import { useConsulenteRevision } from '@/components/allocation/consulente/useConsulenteRevision';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch }));

const NOW = new Date('2026-11-08T12:00:00');

const DOCUMENT: AllocationAdviceDocument = {
  userId: 'u1',
  status: 'ready',
  answers: initialAnswers(null, null, []),
  stage: 'review',
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: NOW,
  strategy: null,
  instruments: null,
  report: { markdown: '## In una frase\nRegge.', proposal: null, model: 'opus-finto', finishedAt: NOW },
  error: null,
  applied: null,
  interview: null,
  revisions: [{ request: 'meno ornitorinchi', at: NOW }],
};

const QUESTION = { id: 'bond', kind: 'single', text: 'Quanti titoli singoli?', options: [{ value: 'pochi', label: 'Pochi' }, { value: 'molti', label: 'Molti' }], allowOther: true };
const round = (questions: unknown[]) => ({ note: 'Vedo una richiesta sui bond.', satisfied: false, questions, model: 'opus-finto', askedAt: '2026-11-08T12:00:00.000Z' });

/** A whole SSE response with these events. */
function sse(...events: object[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const bodies = () => authenticatedFetch.mock.calls.map(([, init]) => JSON.parse(init.body));

/** The book's «Chiedi una modifica» page in miniature: the draft, the aside, the body and the footer's two buttons. */
function TileSubject() {
  const revision = useConsulenteRevision('u1');
  const draft = useRevisionDraft('u1', DOCUMENT, revision);
  return (
    <div>
      <span>{describeRevisionAside(draft)}</span>
      <RevisionBody draft={draft} />
      {draft.showSkip && (
        <Button type="button" variant="outline" onClick={draft.skipQuestions} disabled={draft.revising}>
          Salta le domande
        </Button>
      )}
      <Button type="button" onClick={draft.primary.onClick} disabled={draft.primary.disabled}>
        {draft.primary.label}
      </Button>
    </div>
  );
}

function renderSubject() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TileSubject />
    </QueryClientProvider>
  );
}

const reviseButton = () => screen.getByRole('button', { name: 'Rivedi il report' });

afterEach(() => {
  authenticatedFetch.mockReset();
});

describe('«Chiedi una modifica»', () => {
  it('a typed request enables «Rivedi il report»; the requests so far are listed', async () => {
    const user = userEvent.setup();
    renderSubject();
    expect(screen.getByText('1 richiesta')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Le richieste fatte' }).textContent).toContain('meno ornitorinchi');
    expect((reviseButton() as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Cosa vuoi cambiare'), 'più fenicotteri');
    expect((reviseButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Salta le domande' })).toBeNull();
  });

  it('a round with questions shows the cards and «Salta le domande»; «Salta le domande» sends skipped: true', async () => {
    const user = userEvent.setup();
    authenticatedFetch.mockResolvedValueOnce(sse({ type: 'interview', round: round([QUESTION]) }));
    authenticatedFetch.mockResolvedValueOnce(sse({ type: 'done' }));
    renderSubject();
    await user.type(screen.getByLabelText('Cosa vuoi cambiare'), 'più fenicotteri');
    await user.click(reviseButton());
    await waitFor(() => expect(screen.getByText('Quanti titoli singoli?')).not.toBeNull());
    expect(bodies()[0]).toMatchObject({ stage: 'interview', revision: { requests: 'più fenicotteri' } });
    expect(document.querySelector('[data-revision-round]')).not.toBeNull();
    expect((screen.getByLabelText('Cosa vuoi cambiare') as HTMLTextAreaElement).readOnly).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Salta le domande' }));
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).toMatchObject({ stage: 'revise', request: 'più fenicotteri', interview: { skipped: true } });
    await waitFor(() => expect((screen.getByLabelText('Cosa vuoi cambiare') as HTMLTextAreaElement).value).toBe(''));
  });

  it('a round without questions sends the revision at once', async () => {
    const user = userEvent.setup();
    authenticatedFetch.mockResolvedValueOnce(sse({ type: 'interview', round: round([]) }));
    authenticatedFetch.mockResolvedValueOnce(sse({ type: 'done' }));
    renderSubject();
    await user.type(screen.getByLabelText('Cosa vuoi cambiare'), 'più fenicotteri');
    await user.click(reviseButton());
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalledTimes(2));
    expect(bodies()[1]).toMatchObject({ stage: 'revise', request: 'più fenicotteri', interview: { skipped: false } });
    expect(bodies()[1].interview.rounds).toHaveLength(1);
    expect(screen.queryByText('Quanti titoli singoli?')).toBeNull();
  });
});
