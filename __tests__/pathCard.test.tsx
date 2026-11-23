/**
 * `PathCard` / `PathDoneCard` (components/ui/path-card.tsx, 2026-11-20): the one card every guided path
 * outside the Consulente renders — Compravendita and the plan of accumulation. The eyebrow «Passo n di N ·
 * tema» is built here from a zero-based index; «Ricomincia» is armed like a movement's delete (the first
 * press asks again); a disabled primary never fires.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PathCard, PathDoneCard, type PathCardProps } from '@/components/ui/path-card';

function props(overrides: Partial<PathCardProps> = {}): PathCardProps {
  return {
    step: { index: 2, total: 8, theme: 'Durata' },
    question: 'Per quanti mesi?',
    help: 'La prima rata è a gennaio.',
    children: <p>corpo</p>,
    back: { onClick: vi.fn(), disabled: false },
    restart: { onConfirm: vi.fn(), disabled: false },
    status: null,
    primary: { label: 'Avanti', onClick: vi.fn(), disabled: false },
    ...overrides,
  };
}

describe('PathCard', () => {
  it('builds the eyebrow and names the section by it', () => {
    render(<PathCard {...props()} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Passo 3 di 8 · Durata');
    expect(screen.getByRole('region', { name: 'Passo 3 di 8: Durata' })).toBeTruthy();
    expect(screen.getByText('Per quanti mesi?')).toBeTruthy();
    expect(screen.getByText('corpo')).toBeTruthy();
  });

  // 2026-11-23: a scene card is a tile to the costume, its headline a heading, its figures the mono's.
  // Seen red with `data-tile` dropped from the card and with the eyebrow printed as bare JSX.
  it('is a tile, with a costume heading and the eyebrow’s and the question’s figures wrapped', () => {
    render(<PathCard {...props({ question: 'Per quanti mesi, 12 o 24?' })} />);
    const section = screen.getByRole('region', { name: 'Passo 3 di 8: Durata' });
    expect(section.hasAttribute('data-tile')).toBe(true);
    const figures = (node: Element | null) => [...(node?.querySelectorAll('.costume-figure') ?? [])].map((span) => span.textContent);
    expect(figures(section.querySelector('h2'))).toEqual(['3', '8']);
    const headline = section.querySelector('h2 + p');
    expect(headline?.textContent).toBe('Per quanti mesi, 12 o 24?');
    expect(headline?.classList.contains('costume-heading')).toBe(true);
    expect(figures(headline)).toEqual(['12', '24']);
  });

  it('paints the status line by its tone', () => {
    const { rerender } = render(<PathCard {...props({ status: { tone: 'warning', text: 'Scegli almeno un conto.' } })} />);
    expect(screen.getByRole('status').className).toContain('text-warning-foreground');
    rerender(<PathCard {...props({ status: { tone: 'failure', text: 'Non è stato salvato.' } })} />);
    expect(screen.getByRole('status').className).toContain('text-destructive');
    rerender(<PathCard {...props({ status: null })} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('arms «Ricomincia» on the first press and confirms on the second', () => {
    const onConfirm = vi.fn();
    render(<PathCard {...props({ restart: { onConfirm, disabled: false } })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ricomincia' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Premi di nuovo per ricominciare' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('a disabled primary does not call onClick; an enabled one does', () => {
    const onClick = vi.fn();
    const { rerender } = render(<PathCard {...props({ primary: { label: 'Conferma', onClick, disabled: true } })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(onClick).not.toHaveBeenCalled();
    rerender(<PathCard {...props({ primary: { label: 'Conferma', onClick, disabled: false } })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('«Indietro» follows its own disabled flag', () => {
    const onClick = vi.fn();
    render(<PathCard {...props({ back: { onClick, disabled: true } })} />);
    expect((screen.getByRole('button', { name: 'Indietro' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PathDoneCard', () => {
  it('reads «Fatto», names the section by ariaLabel and carries the buttons', () => {
    render(
      <PathDoneCard ariaLabel="Piano attivo" headline="Piano attivo: prima rata a gennaio, 500 €." help="Ogni mese lo trovi in Allocazione › Accumulo.">
        <button type="button">Apri Accumulo</button>
      </PathDoneCard>
    );
    const section = screen.getByRole('region', { name: 'Piano attivo' });
    expect(section.querySelector('h2')?.textContent).toBe('Fatto');
    expect(screen.getByRole('status').textContent).toBe('Piano attivo: prima rata a gennaio, 500 €.');
    expect(screen.getByRole('button', { name: 'Apri Accumulo' })).toBeTruthy();
    // 2026-11-23: a tile, its headline a costume heading.
    expect(section.hasAttribute('data-tile')).toBe(true);
    expect(screen.getByRole('status').classList.contains('costume-heading')).toBe(true);
    expect(screen.getByRole('status').querySelectorAll('.costume-figure').length).toBeGreaterThan(0);
  });
});
