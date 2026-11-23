/**
 * A modal opened inside the dashboard wears its costume (DESIGN.md → The Costume Rule, 2026-11-21):
 * `ResponsiveModal`'s content — the Drawer on a phone, the Dialog from 769px — is portalled out of the
 * shell's DOM, so it carries `data-costume-scope` itself when it is opened from inside `CostumeScope`,
 * and never outside it. Seen red with the spread dropped.
 *
 * The modal as a costumed tile (2026-11-23): the content carries `data-costume-frame` (the tile's cap or marks,
 * its own Float shadow), the title `costume-title`, and every figure of the eyebrow and of a string title sits
 * in a `.costume-figure` span, so a digit stays Geist Mono under a heading face (DESIGN.md → The Mono Mandate).
 * A node title is the caller's: the AI analysis wraps its verdict itself. Seen red with `{title}` rendered
 * bare, with the eyebrow printed bare, with the frame attribute dropped from `dialog.tsx` and from `drawer.tsx`,
 * and with `AIAnalysisDialog` printing `verdict.headline` bare.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({ getUserPreferences: vi.fn(async () => ({})), setUserPreferences: vi.fn() }));
// The AI analysis starts its stream on open: a request that never answers, so nothing is spent and nothing settles.
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn(() => new Promise(() => {})) }));

import { CostumeScope } from '@/contexts/CostumeScopeContext';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { AIAnalysisDialog } from '@/components/performance/AIAnalysisDialog';
import type { PerformanceMetrics } from '@/types/performance';

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

/** The open modal's title, whichever primitive drew it. */
function titleOf(): HTMLElement {
  const title = document.querySelector<HTMLElement>('[data-slot="dialog-title"], [data-slot="drawer-title"]');
  expect(title, 'the modal title').not.toBeNull();
  return title!;
}

const figuresOf = (node: Element) => [...node.querySelectorAll('.costume-figure')].map((span) => span.textContent);

// Invented, round figures: only the title is read.
const METRICS = {
  startDate: new Date('2025-01-15T12:00:00'),
  endDate: new Date('2025-12-15T12:00:00'),
  roi: 5,
  cagr: 5,
  moneyWeightedReturn: 5,
  timeWeightedReturn: 5,
  volatility: 10,
  sharpeRatio: 1,
  maxDrawdown: -10,
  numberOfMonths: 12,
  netCashFlow: 1000,
  endNetWorth: 100000,
} as unknown as PerformanceMetrics;

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

  it('should carry the costume frame on its content', () => {
    stubMatchMedia(matches);
    render(modal);
    expect(screen.getByRole('dialog').hasAttribute('data-costume-frame')).toBe(true);
  });

  it('should wrap the figures of the eyebrow and of a string title, and hook the title', () => {
    stubMatchMedia(matches);
    render(
      <ResponsiveModal open onClose={() => {}} eyebrow="Nuova voce · Passo 1 di 2" title="Elimina 50 movimenti">
        <p>Corpo</p>
      </ResponsiveModal>,
    );
    const eyebrow = screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === 'Nuova voce · Passo 1 di 2');
    expect(figuresOf(eyebrow)).toEqual(['1', '2']);
    const title = titleOf();
    expect(title.textContent).toBe('Elimina 50 movimenti');
    expect(title.classList.contains('costume-title')).toBe(true);
    expect(figuresOf(title)).toEqual(['50']);
  });

  it('should render a node title as the caller passed it', () => {
    stubMatchMedia(matches);
    render(
      <ResponsiveModal open onClose={() => {}} title={<em>Elimina 50 movimenti</em>}>
        <p>Corpo</p>
      </ResponsiveModal>,
    );
    const title = titleOf();
    expect(title.classList.contains('costume-title')).toBe(true);
    expect(title.innerHTML).toBe('<em>Elimina 50 movimenti</em>');
  });

  it('should keep the figures of the AI analysis’s verdict title in the mono', () => {
    stubMatchMedia(matches);
    render(
      <AIAnalysisDialog
        open
        onOpenChange={() => {}}
        metrics={METRICS}
        verdict={{ headline: "Il portafoglio rende il 5% l'anno.", tone: 'positive', sentence: [] }}
        timePeriod="1Y"
        userId="u1"
      />,
    );
    const title = titleOf();
    // The headline without its full stop, then the tone dot.
    expect(title.textContent).toBe("Il portafoglio rende il 5% l'anno.");
    expect(figuresOf(title)).toEqual(['5%']);
  });
});
