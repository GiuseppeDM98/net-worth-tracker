/**
 * «Il colloquio» on the report (components/allocation/consulente/ConsulenteInterviewTile.tsx,
 * 2026-11-08; a page of the book since 2026-11-11, `InterviewBody` under the page's aside
 * `describeInterviewAside`, as the book draws it): nothing without rounds; the aside «1 tornata» / «N tornate ·
 * saltato»; one sub-eyebrow per round with the note, the questions and the answers in words,
 * «non risposta» for what was skipped; NOT a generated tile. Invented rounds.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InterviewBody, InterviewRoundRows } from '@/components/allocation/consulente/ConsulenteInterviewTile';
import { describeInterviewAside } from '@/lib/utils/allocationAdviceNarrative';
import { QUESTION_DECLINE_VALUE, type Question } from '@/lib/utils/questionSet';
import type { AllocationAdviceInterview, AllocationAdviceInterviewRound } from '@/types/allocationAdvice';

const Q1: Question = { id: 'reddito', kind: 'single', text: 'Quanto dipendi dal reddito?', why: "l'86% delle entrate", options: [{ value: 'tutto', label: 'Interamente' }, { value: 'meta', label: 'Circa metà' }], allowOther: true };
const Q2: Question = { id: 'riserva', kind: 'multiple', text: 'Cosa copre la riserva?', options: [{ value: 'conti', label: 'I conti' }, { value: 'btp', label: 'I BTP' }], allowOther: true };

const ROUND: AllocationAdviceInterviewRound = {
  note: 'Vedo un reddito concentrato.',
  satisfied: false,
  questions: [Q1, Q2],
  answers: [{ questionId: 'reddito', value: 'meta' }],
  model: 'opus-finto',
  askedAt: new Date('2026-11-08T12:00:00'),
};
const SECOND: AllocationAdviceInterviewRound = {
  ...ROUND,
  note: 'Resta la riserva.',
  questions: [Q2],
  answers: [{ questionId: 'riserva', value: { other: 'un fenicottero' } }],
  askedAt: new Date('2026-11-08T12:05:00'),
};

/** The page as the book draws it: the card named by its title, the aside, the body; nothing when there is no body. */
function ConsulenteInterviewTile({ interview }: { interview: AllocationAdviceInterview | null }) {
  const aside = describeInterviewAside(interview);
  if (aside === null) return null;
  return (
    <section aria-label="Il colloquio">
      <span>{aside}</span>
      <InterviewBody interview={interview} />
    </section>
  );
}

describe('InterviewBody', () => {
  it('draws nothing by itself without rounds', () => {
    const { container } = render(<InterviewBody interview={{ rounds: [], skipped: true }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing without an interview or with zero rounds, skipped or not', () => {
    const { container, rerender } = render(<ConsulenteInterviewTile interview={null} />);
    expect(container.innerHTML).toBe('');
    rerender(<ConsulenteInterviewTile interview={{ rounds: [], skipped: false }} />);
    expect(container.innerHTML).toBe('');
    rerender(<ConsulenteInterviewTile interview={{ rounds: [], skipped: true }} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows one round with its aside, the note, the questions and the answers in words, «non risposta» for the one skipped, and is not generated', () => {
    const { container } = render(<ConsulenteInterviewTile interview={{ rounds: [ROUND], skipped: false }} />);
    const tile = screen.getByRole('region', { name: 'Il colloquio' });
    expect(tile.hasAttribute('data-generated')).toBe(false);
    expect(screen.getByText('1 tornata')).not.toBeNull();
    expect(screen.getByText('Tornata 1')).not.toBeNull();
    expect(screen.getByText('Vedo un reddito concentrato.')).not.toBeNull();
    expect(screen.getByText('Quanto dipendi dal reddito?')).not.toBeNull();
    expect(screen.getByText('Circa metà')).not.toBeNull();
    expect(screen.getByText('Cosa copre la riserva?')).not.toBeNull();
    expect(screen.getByText('non risposta')).not.toBeNull();
    expect(container.querySelector('[data-generated]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('two rounds and a skip: «2 tornate · saltato», both notes, the typed «Altro…» in words, the decline as its label', () => {
    const interview: AllocationAdviceInterview = { rounds: [{ ...ROUND, answers: [{ questionId: 'reddito', value: QUESTION_DECLINE_VALUE }] }, SECOND], skipped: true };
    render(<ConsulenteInterviewTile interview={interview} />);
    expect(screen.getByText('2 tornate · saltato')).not.toBeNull();
    expect(screen.getByText('Tornata 1')).not.toBeNull();
    expect(screen.getByText('Tornata 2')).not.toBeNull();
    expect(screen.getByText('Resta la riserva.')).not.toBeNull();
    expect(screen.getByText('Altro: un fenicottero')).not.toBeNull();
    expect(screen.getByText('Preferisco non dire')).not.toBeNull();
    expect(screen.getAllByText('non risposta')).toHaveLength(1);
  });

  it('two rounds without a skip: the aside is «2 tornate» alone', () => {
    render(<ConsulenteInterviewTile interview={{ rounds: [ROUND, SECOND], skipped: false }} />);
    expect(screen.getByText('2 tornate')).not.toBeNull();
    expect(screen.queryByText(/saltato/)).toBeNull();
  });

  it('InterviewRoundRows says «nessuna domanda» for a round without questions and joins a list', () => {
    const { rerender } = render(<InterviewRoundRows questions={[]} answers={[]} />);
    expect(screen.getByText('nessuna domanda')).not.toBeNull();
    rerender(<InterviewRoundRows questions={[Q2]} answers={[{ questionId: 'riserva', value: ['conti', 'btp'] }]} />);
    expect(screen.getByText('I conti, I BTP')).not.toBeNull();
  });
});
