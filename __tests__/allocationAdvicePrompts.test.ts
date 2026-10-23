/**
 * The Consulente's three prompts (lib/server/allocationAdvice/prompts.ts): the answers block,
 * a system byte-identical across users, the sleeves the instrument search is handed, the review
 * that is told when the candidates block is missing.
 */

import { describe, expect, it } from 'vitest';
import { buildInstrumentsPrompt, buildReviewPrompt, buildRevisionPrompt, buildStrategyPrompt, formatAnswersForPrompt, formatPriorPlanForPrompt } from '@/lib/server/allocationAdvice/prompts';
import type { AllocationAdviceAnswers, AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';

const ANSWERS: AllocationAdviceAnswers = {
  age: 35,
  horizonYears: 20,
  lossTolerance: 'alta',
  exchange: 'Borsa Italiana (Milano, XMIL)',
  broker: 'Broker X',
  distributionPolicy: 'accumulazione',
  goals: [
    { goalId: 'g1', name: 'Casa', targetAmount: 50000, targetDateIso: '2031-06-01', priority: 'alta', keep: true, note: 'metà a testa' },
    { goalId: 'g2', name: 'Vecchio', targetAmount: null, targetDateIso: null, priority: 'bassa', keep: false, note: '' },
    { goalId: null, name: 'Auto', targetAmount: 20000, targetDateIso: null, priority: 'media', keep: true, note: '' },
  ],
  goalsReflectReality: false,
  newGoalsNote: 'manca un fondo per i figli',
  homeRole: 'excluded',
  pensionRole: 'frozen',
  privateEquityRole: 'excluded',
  keepAssets: ['ETF Mondo'],
  avoid: 'niente leva',
  esg: true,
  notes: '',
};

const PROPOSAL: AllocationAdviceProposal = {
  summary: 'S.',
  classes: [
    { assetClass: 'equity', targetPercentage: 60, rationale: '', subTargets: [{ name: 'All World', targetPercentage: 100, instrument: 'ETF Mondo' }] },
    { assetClass: 'bonds', targetPercentage: 40, rationale: '', subTargets: [] },
  ],
  assetRoles: [],
  goals: [],
  reviewByIso: '2028-10-20',
  reviewReason: '',
  risks: [],
};

describe('formatAnswersForPrompt', () => {
  it('writes every answer as a line, the goals with their fate and the user\'s words quoted', () => {
    // The no-break space Intl puts before «€», collapsed so the assertions read plainly.
    const text = formatAnswersForPrompt(ANSWERS).replace(/ /g, ' ');
    expect(text).toContain('Età: 35 anni | orizzonte di investimento: 20 anni');
    expect(text).toContain('Tolleranza alle perdite: alta');
    expect(text).toContain('Borsa di riferimento: Borsa Italiana (Milano, XMIL) | broker: Broker X');
    expect(text).toContain('- Casa: esistente (id g1) | da tenere | target 50.000 € | scadenza 2031-06-01 | priorità alta | nota: «metà a testa»');
    expect(text).toContain('- Vecchio: esistente (id g2) | DA ELIMINARE: non rispecchia più la realtà');
    expect(text).toContain('- Auto: NUOVO | da tenere | target 20.000 €');
    expect(text).toContain("L'utente dice che gli obiettivi NON rispecchiano del tutto la realtà.");
    expect(text).toContain('Cosa manca, nelle sue parole: «manca un fondo per i figli»');
    expect(text).toContain('Strumenti da tenere comunque: ETF Mondo');
    expect(text).toContain('Preferenza ESG: sì');
  });
});

describe('the plan in force («il piano in vigore e il perché», 2026-10-20)', () => {
  const plan = {
    reportMarkdown: '# Report\nMeno cripto, più bond.',
    revisions: ['solo bond singoli'],
    finishedAt: new Date('2026-10-20T10:00:00.000Z'),
    appliedAt: new Date('2026-10-21T10:00:00.000Z'),
    reviewByIso: '2028-01-15',
    reviewReason: 'un anno pieno di cashflow',
  };

  it('goes after the data, with its dates, its review and its requests, and leaves the system untouched', () => {
    const withPlan = buildStrategyPrompt(ANSWERS, 'DATI', plan);
    const without = buildStrategyPrompt(ANSWERS, 'DATI');
    expect(withPlan.system).toBe(without.system);
    expect(withPlan.system).toContain('**Rispetto al piano precedente**');
    expect(withPlan.userContent).toContain('DATI\n\n--- IL PIANO IN VIGORE E IL PERCHÉ (il report del percorso precedente, del 2026-10-20; applicato alle impostazioni il 2026-10-21; da rivedere entro il 2028-01-15: un anno pieno di cashflow) ---\n# Report\nMeno cripto, più bond.');
    expect(withPlan.userContent).toContain('Richieste di modifica fatte allora sul report, in ordine: 1. solo bond singoli');
    expect(without.userContent).not.toContain('IL PIANO IN VIGORE');
  });

  it('says when the plan was never applied and had no requests', () => {
    const block = formatPriorPlanForPrompt({ ...plan, appliedAt: null, revisions: [], reviewByIso: null, reviewReason: null });
    expect(block).toContain('(il report del percorso precedente, del 2026-10-20; mai applicato alle impostazioni) ---');
    expect(block).toContain('Nessuna richiesta di modifica fu fatta su quel report.');
  });
});

describe('the revision prompt («Chiedi una modifica», 2026-10-20)', () => {
  it('carries the previous report and every request in order, and asks for the whole report again', () => {
    const prompt = buildRevisionPrompt(ANSWERS, 'STRATEGIA', 'STRUMENTI', null, 'REPORT PRECEDENTE', ['meno cripto', 'solo bond singoli']);
    expect(prompt.userContent).toContain('--- IL REPORT PRECEDENTE (da rivedere) ---\nREPORT PRECEDENTE');
    expect(prompt.userContent).toContain('1. meno cripto\n2. solo bond singoli');
    expect(prompt.userContent).toContain('non ha prodotto un blocco strutturato valido');
    expect(prompt.system).toContain('# La revisione su richiesta');
    expect(prompt.system).toContain('«La tua richiesta»');
    // The review's contract stays whole underneath: the same seven sections and the block.
    expect(prompt.system).toContain('7. **Rischi e revisione**');
    expect(prompt.system).toBe(buildRevisionPrompt({ ...ANSWERS, age: 60 }, 'X', 'Y', { sleeves: [] }, 'Z', ['a']).system);
  });
});

describe('the three prompts', () => {
  it('keeps the strategy system byte-identical across users and puts the data in the user turn', () => {
    const a = buildStrategyPrompt(ANSWERS, 'DATI A');
    const b = buildStrategyPrompt({ ...ANSWERS, age: 60, broker: 'Altro' }, 'DATI B');
    expect(a.system).toBe(b.system);
    // A structured answer since 2026-10-23: the fields are described, no fenced block is asked for.
    expect(a.system).toContain('UN oggetto JSON con due campi, `markdown` e `proposal`');
    expect(a.system).not.toContain('```allocation-proposal');
    expect(a.system).toContain('"assetClass": chiave di classe');
    expect(a.userContent).toContain('DATI A');
    expect(a.userContent).toContain('--- RISPOSTE DEL PERCORSO ---');
  });

  it('hands the instrument search every sleeve with its share, the exchange and the policy', () => {
    const prompt = buildInstrumentsPrompt(ANSWERS, PROPOSAL, 'STRUMENTI');
    expect(prompt.userContent).toContain('equity (Azioni) › All World: 100% della classe | strumento indicato dalla strategia: ETF Mondo');
    expect(prompt.userContent).toContain('bonds (Obbligazioni): nessun sotto-target, cerca 1-3 strumenti per l\'intera classe con sotto-target "Obbligazioni"');
    expect(prompt.userContent).toContain('Borsa di riferimento: Borsa Italiana (Milano, XMIL) (broker Broker X). Politica dei proventi: ad accumulazione (reinveste i proventi). ESG: preferiti.');
    expect(prompt.userContent).toContain('Da evitare: niente leva');
    expect(prompt.system).toContain('```instrument-candidates');
  });

  it('tells the review when the candidates block is missing, and not otherwise', () => {
    const without = buildReviewPrompt(ANSWERS, 'STRATEGIA', 'STRUMENTI', null);
    expect(without.userContent).toContain('il secondo agente non ha prodotto un blocco strutturato valido');
    const withBlock = buildReviewPrompt(ANSWERS, 'STRATEGIA', 'STRUMENTI', { sleeves: [] });
    expect(withBlock.userContent).not.toContain('non ha prodotto un blocco strutturato valido');
    expect(withBlock.userContent).toContain('--- STRATEGIA PROPOSTA (primo agente) ---\nSTRATEGIA');
    expect(withBlock.system).toContain('il report finale');
  });
});
