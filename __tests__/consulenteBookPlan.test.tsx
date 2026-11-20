/**
 * The operating plan in the book (components/allocation/consulente/ConsulenteBookPages.tsx,
 * 2026-11-19): the page «Il piano operativo» drawn from the stored plan (`planPieces`) — the three
 * groups, the sales' figures, the taxes' total, the review, the departures and the app's
 * corrections — and the row on «Applica» that asks the plan (`applyPieces`' `planRow`), on a ready
 * and on an applied document. Invented instruments and round figures.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { OperatingPlan } from '@/lib/utils/operatingPlan';
import { initialAnswers } from '@/lib/utils/allocationAdviceDraft';
import { formatCurrency } from '@/lib/utils/formatters';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import { applyPieces, planPieces, type ApplyPiecesInput, type PlanRow } from '@/components/allocation/consulente/ConsulenteBookPages';

const NOW = new Date('2026-11-19T12:00:00');

const PLAN: OperatingPlan = {
  summary: 'Un anno di versamenti verso il sessanta e quaranta.',
  monthlyInflowEur: 500,
  months: 12,
  rows: [
    { ref: 'S1', action: 'buy', targetPercentage: 60, reason: 'Il nucleo del portafoglio.' },
    { ref: 'S2', action: 'hold', targetPercentage: 0, reason: 'È già sopra il suo peso.' },
    { ref: 'S3', action: 'sell', targetPercentage: 0, sellQuantity: 10, sellMonth: 3, reason: 'Lo sostituisce ETF airone.', estimatedProceedsEur: 600, estimatedTaxEur: 50 },
    { ref: 'N1', action: 'buy', targetPercentage: 40, reason: 'I bond che mancano.' },
    { ref: 'M1', action: 'sell', targetPercentage: 0, reason: 'La riserva basta.', estimatedProceedsEur: 3000, estimatedTaxEur: null, taxUnknownReason: 'rate' },
  ],
  instruments: [
    { ref: 'S1', kind: 'held', name: 'ETF ornitorinco', assetClass: 'equity', assetId: 'a1' },
    { ref: 'S2', kind: 'held', name: 'ETF fenicottero', assetClass: 'equity', assetId: 'a2' },
    { ref: 'S3', kind: 'held', name: 'ETF pellicano', assetClass: 'bonds', assetId: 'a3' },
    { ref: 'N1', kind: 'new', name: 'ETF airone', assetClass: 'bonds' },
    { ref: 'M1', kind: 'cashFund', name: 'Fondo lontra', assetClass: 'cash', assetId: 'a4' },
  ],
  reviewMonth: 6,
  reviewReason: 'A metà strada, per vedere i bond.',
  departures: ['La rata supera la mediana del risparmio di 50 euro.'],
  corrections: ['ETF ornitorinco: quota portata dal 70% al 60%, il limite dei tuoi Criteri del modello.'],
  usable: true,
};

describe('planPieces', () => {
  // 2026-11-19. Mutation that turned it red: the sell group rendered without the month.
  it('draws the three groups, the sales with quantity, month, proceeds and tax, the total, the review, the departures and the corrections', () => {
    const pieces = planPieces(PLAN);
    expect(pieces.aside).toBe(`12 mesi · ${formatCurrency(500)} al mese`);
    expect(pieces.reading).toEqual([{ text: 'Un anno di versamenti verso il sessanta e quaranta.' }]);
    render(<>{pieces.body}{pieces.footnote}</>);

    const buy = screen.getByRole('list', { name: 'Compra' });
    expect(within(buy).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'ETF ornitorinco60,00%Il nucleo del portafoglio.',
      'ETF airone40,00%I bond che mancano.',
    ]);
    expect(screen.getByRole('list', { name: 'Smetti di comprare' }).textContent).toBe('ETF fenicotteroÈ già sopra il suo peso.');
    const sell = within(screen.getByRole('list', { name: 'Vendi' })).getAllByRole('listitem');
    expect(sell[0].textContent).toContain(`ETF pellicano10 quote · 3º mese · circa ${formatCurrency(600)} · tasse stimate ${formatCurrency(50)}`);
    expect(sell[0].textContent).toContain('Lo sostituisce ETF airone.');
    expect(sell[1].textContent).toContain(`Fondo lontratutte le quote · 1º mese · circa ${formatCurrency(3000)} · tasse non stimabili: manca l'aliquota`);

    const text = document.body.textContent ?? '';
    expect(text).toContain(`Tasse stimate delle vendite: ${formatCurrency(50)}, senza 1 vendita non stimabile`);
    expect(text).toContain('Da riguardare al 6º mese: A metà strada, per vedere i bond.');
    expect(screen.getByRole('list', { name: 'Dove si discosta dal report' }).textContent).toBe('La rata supera la mediana del risparmio di 50 euro.');
    expect(screen.getByRole('list', { name: "Corretto dall'app" }).textContent).toContain('ETF ornitorinco: quota portata dal 70% al 60%');
    expect(text).toContain("Le rate esatte le calcola l'app quando crei il piano: dipendono dai prezzi di quel giorno.");
  });

  // The swap (owner, 2026-11-20). Mutation that turns it red: the sale drawn without what it buys.
  it('a swap: the sale names what its proceeds buy, the row bought only by it reads «con lo scambio»', () => {
    const plan: OperatingPlan = {
      ...PLAN,
      rows: [PLAN.rows[0], { ...PLAN.rows[2], reinvestInto: 'N1' }, { ...PLAN.rows[3], targetPercentage: 0 }],
    };
    render(<>{planPieces(plan).body}</>);
    const sell = within(screen.getByRole('list', { name: 'Vendi' })).getAllByRole('listitem');
    expect(sell[0].textContent).toContain('ETF pellicano10 quote · 3º mese · circa');
    expect(sell[0].textContent).toContain(' · con il ricavato compra ETF airone');
    const buy = within(screen.getByRole('list', { name: 'Compra' })).getAllByRole('listitem');
    expect(buy[1].textContent).toBe('ETF aironecon lo scambioI bond che mancano.');
  });

  it('leaves out an empty group, the total without an estimable sale, the review without a month', () => {
    const plan: OperatingPlan = {
      ...PLAN,
      rows: [PLAN.rows[0], { ...PLAN.rows[4] }],
      reviewMonth: undefined,
      departures: [],
      corrections: [],
    };
    render(<>{planPieces(plan).body}</>);
    expect(screen.queryByRole('list', { name: 'Smetti di comprare' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Dove si discosta dal report' })).toBeNull();
    expect(screen.queryByRole('list', { name: "Corretto dall'app" })).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Tasse stimate delle vendite');
    expect(text).not.toContain('Da riguardare');
  });
});

describe('«Applica» and the operating plan row', () => {
  const makeDocument = (status: 'ready' | 'applied'): AllocationAdviceDocument => ({
    userId: 'u1',
    status,
    answers: initialAnswers(null, null, []),
    stage: 'review',
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    strategy: null,
    instruments: null,
    report: null,
    error: null,
    applied: status === 'applied' ? { at: NOW, targetsWritten: true, rolesChanged: 0, goalsWritten: 0 } : null,
    interview: null,
  });
  const body = (status: 'ready' | 'applied', planRow: PlanRow | null, plan: Partial<Pick<ApplyPiecesInput, 'planTick' | 'planDone' | 'planFailure' | 'onCreatePlan' | 'creatingPlan'>> = {}) =>
    applyPieces({
      document: makeDocument(status),
      proposal: status === 'ready' ? ({ classes: [], goals: [], assetRoles: [], risks: [], summary: '', reviewByIso: '2027-11-19', reviewReason: '' } as never) : null,
      rows: [],
      roles: { changes: [], unmatched: [] },
      goalPlan: null,
      goalsCount: 0,
      applySummary: 'Scrive i target.',
      applyTargets: true,
      setApplyTargets: () => {},
      applyRoles: true,
      setApplyRoles: () => {},
      applyGoals: true,
      setApplyGoals: () => {},
      applyState: { phase: 'idle' },
      planRow,
      planTick: null,
      planDone: null,
      planFailure: null,
      onCreatePlan: null,
      creatingPlan: false,
      ...plan,
    }).body;
  const row = (state: PlanRow['state'], message: string | null = null, onWrite = vi.fn(), disabled = false): PlanRow => ({ state, message, onWrite, disabled });

  // 2026-11-19. Mutation that turned it red: the row hidden on `applied`.
  it('says each of the four states, on a ready and on an applied document with no note and no hand-off', async () => {
    for (const status of ['ready', 'applied'] as const) {
      const onWrite = vi.fn();
      const absent = render(<>{body(status, row('absent', null, onWrite))}</>);
      expect(absent.container.textContent).toContain("Il piano operativo non c'è ancora.");
      await userEvent.click(within(absent.container).getByRole('button', { name: 'Scrivi il piano operativo' }));
      expect(onWrite).toHaveBeenCalledTimes(1);
      absent.unmount();

      const running = render(<>{body(status, row('running'))}</>);
      expect(running.container.textContent).toContain('Scrivo il piano operativo…');
      expect(within(running.container).queryByRole('button', { name: 'Scrivi il piano operativo' })).toBeNull();
      running.unmount();

      const failed = render(<>{body(status, row('failed', 'Il Consulente non ha scritto un piano leggibile.'))}</>);
      expect(failed.container.textContent).toContain('Il Consulente non ha scritto un piano leggibile.');
      expect(within(failed.container).getByRole('button', { name: 'Scrivi il piano operativo' })).not.toBeNull();
      failed.unmount();

      const unusable = render(<>{body(status, row('unusable', 'Il piano non compra niente: non può diventare un piano di accumulo.'))}</>);
      expect(unusable.container.textContent).toContain('Il piano non compra niente: non può diventare un piano di accumulo.');
      unusable.unmount();
    }
  });

  it('no row with a plan; the button disabled in demo', () => {
    const applied = render(<>{body('applied', null)}</>);
    expect(applied.container.textContent).toBe('');
    applied.unmount();
    const demo = render(<>{body('ready', row('absent', null, vi.fn(), true))}</>);
    expect((within(demo.container).getByRole('button', { name: 'Scrivi il piano operativo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  // The plan of accumulation on an applied report (2026-11-20). Mutation that turns it red: the button shown with a planId.
  it('with the plan recorded: its sentence, the model line when given, «Apri Accumulo»; no button', () => {
    const done = render(<>{body('applied', null, { planDone: { sentence: 'Bozza sostituita e piano attivato.', modelNote: 'Il portafoglio modello non è stato aggiornato: rete assente. Aggiornalo da Accumulo.' }, planTick: <p>tick</p>, onCreatePlan: vi.fn() })}</>);
    expect(done.container.textContent).toContain('Bozza sostituita e piano attivato.');
    expect(done.container.textContent).toContain('Il portafoglio modello non è stato aggiornato: rete assente.');
    expect(within(done.container).getByRole('link', { name: 'Apri Accumulo' }).getAttribute('href')).toBe('/dashboard/allocation?tab=accumulo');
    expect(within(done.container).queryByRole('button', { name: 'Crea il piano di accumulo' })).toBeNull();
    expect(done.container.textContent).not.toContain('tick');
    done.unmount();
    const plain = render(<>{body('applied', null, { planDone: { sentence: 'Piano creato.', modelNote: null } })}</>);
    expect(plain.container.textContent).toContain('Piano creato.');
    expect(plain.container.textContent).not.toContain('portafoglio modello');
  });

  it('without it: the failure, the tick, «Crea il piano di accumulo» — disabled without a build and while creating', async () => {
    const onCreatePlan = vi.fn();
    const open = render(<>{body('applied', row('absent'), { planTick: <p>la spunta</p>, planFailure: 'Non sono riuscito ad attivare il piano: rete assente.', onCreatePlan })}</>);
    expect(open.container.textContent).toContain('Non sono riuscito ad attivare il piano: rete assente.');
    expect(open.container.textContent).toContain('la spunta');
    // The tick replaces the operating plan's row: never both.
    expect(open.container.textContent).not.toContain("Il piano operativo non c'è ancora.");
    await userEvent.click(within(open.container).getByRole('button', { name: 'Crea il piano di accumulo' }));
    expect(onCreatePlan).toHaveBeenCalledTimes(1);
    open.unmount();
    const creating = render(<>{body('applied', null, { planTick: <p>la spunta</p>, onCreatePlan, creatingPlan: true })}</>);
    expect((within(creating.container).getByRole('button', { name: 'Creo il piano…' }) as HTMLButtonElement).disabled).toBe(true);
    creating.unmount();
    const unbuilt = render(<>{body('applied', null, { planTick: <p>la spunta</p> })}</>);
    expect((within(unbuilt.container).getByRole('button', { name: 'Crea il piano di accumulo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('on a ready report the tick sits among the checkboxes, before the status line', () => {
    const ready = render(<>{body('ready', null, { planTick: <p data-testid="tick">la spunta</p> })}</>);
    expect(ready.getByTestId('tick')).not.toBeNull();
    expect(within(ready.container).queryByRole('button', { name: 'Crea il piano di accumulo' })).toBeNull();
  });
});
