/**
 * The Consulente's three prompts (lib/server/allocationAdvice/prompts.ts): the answers block,
 * a system byte-identical across users, the sleeves the instrument search is handed, the review
 * that is told when the candidates block is missing.
 */

import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_CONTRACT,
  PLAN_CONTRACT,
  buildInstrumentsPrompt,
  buildInterviewPrompt,
  buildPlanPrompt,
  formatOperatingPlanFacts,
  buildReviewPrompt,
  buildRevisionPrompt,
  buildStrategyPrompt,
  formatAccumulationPlanForPrompt,
  formatAnswersForPrompt,
  formatInterviewForPrompt,
  formatPreviousPathsForPrompt,
  formatPriorPlanForPrompt,
} from '@/lib/server/allocationAdvice/prompts';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { AllocationAdviceAnswers, AllocationAdviceInterview, AllocationAdviceInterviewRound, AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import { QUESTION_DECLINE_VALUE } from '@/lib/utils/questionSet';
import type { OperatingPlanFacts } from '@/lib/utils/operatingPlan';

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
    const withPlan = buildStrategyPrompt(ANSWERS, 'DATI', { priorPlan: plan });
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

describe('the CASHFLOW 12 MESI block in the strategy (2026-11)', () => {
  const plan = {
    reportMarkdown: '# Report', revisions: [], finishedAt: new Date('2026-10-20T10:00:00.000Z'),
    appliedAt: null, reviewByIso: null, reviewReason: null,
  };
  const BLOCK = '--- CASHFLOW 12 MESI (x) ---\nX';

  it('goes after the data, under the note every surface carries (owner, 2026-11-07), and before the plan in force', () => {
    const note = "Il blocco CASHFLOW 12 MESI qui sotto è il cashflow di tutta la storia registrata fino a oggi, qualunque sia il periodo in esame: le cifre di un periodo vengono dai blocchi del periodo; usalo per l'andamento recente, la capacità di risparmio e la sua stabilità, gli impegni ricorrenti e i conti.";
    const prompt = buildStrategyPrompt(ANSWERS, 'DATI', { priorPlan: plan, cashflowBlock: BLOCK });
    expect(prompt.userContent).toContain(`DATI\n\n${note}\n--- CASHFLOW 12 MESI (x) ---\nX\n\n--- IL PIANO IN VIGORE`);
    const noPlan = buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: BLOCK });
    expect(noPlan.userContent).toContain(`DATI\n\n${note}\n--- CASHFLOW 12 MESI (x) ---\nX\nProponi l'allocazione`);
  });

  it('names the block among the exhaustive ones only when it is there, and points income, spending and savings at it', () => {
    const withBlock = buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: BLOCK });
    const without = buildStrategyPrompt(ANSWERS, 'DATI');
    expect(withBlock.userContent).toContain('PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi. Il blocco CASHFLOW del periodo copre solo l\'anno in corso: per entrate, spesa e risparmio usa il blocco CASHFLOW 12 MESI.');
    expect(without.userContent).not.toContain('CASHFLOW 12 MESI');
    expect(without.userContent).toContain('PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI e PIANO DI ACCUMULO sono esaustivi.');
  });

  it('keeps system byte-identical with and without the block, and across users', () => {
    const a = buildStrategyPrompt(ANSWERS, 'DATI A', { cashflowBlock: BLOCK });
    const b = buildStrategyPrompt({ ...ANSWERS, age: 60 }, 'DATI B');
    expect(a.system).toBe(b.system);
    expect(a.system).not.toContain('sono esaustivi');
    expect(a.system).not.toContain(BLOCK);
  });

  // Choice u (2026-11-12): the «mai comprato» rows arrive in the data; the system names them once, a constant.
  it('names the «mai comprato» rows in a constant system, equal with and without such a row', () => {
    const withRow = buildStrategyPrompt(ANSWERS, 'STRUMENTI\nETF Nuovo: Azioni | negoziabile | 0 quote, mai comprato | valore 0 €');
    const without = buildStrategyPrompt(ANSWERS, 'STRUMENTI\nETF Mondo: Azioni | negoziabile | 100 quote | valore 12.000 €');
    expect(withRow.system).toBe(without.system);
    expect(withRow.system).toContain('una riga «0 quote, mai comprato» è uno strumento già creato e mai acquistato: non è posseduto e non pesa nell\'allocazione, ma un sotto-target che gli corrisponde lo nomina in "instrument" con quel nome;');
  });

  it('carries the situation over the cashflow and the line that sizes the goals and the reserve on the block (owner, 2026-11-01)', () => {
    const { system } = buildStrategyPrompt(ANSWERS, 'DATI');
    expect(system).toContain('1. **La situazione** — cosa vedi nel portafoglio di oggi e nel cashflow (entrate e loro concentrazione, spesa, capacità di risparmio) rispetto a orizzonte, tolleranza e obiettivi (2-4 frasi).');
    expect(system).toContain('I "monthlyContribution" degli obiettivi stanno dentro la mediana del risparmio mensile del blocco CASHFLOW 12 MESI (se la superano, dillo e perché); la riserva di liquidità si misura sulla spesa mensile mediana e sui conti liquidi del blocco.');
    // Right after the «Vincoli» element.
    expect(system).toMatch(/Vincoli: [^\n]*\nI "monthlyContribution" degli obiettivi/);
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

  // The Yahoo symbols (2026-11-19): in the block's shape, after the ticker, and asked in the contract.
  it('asks the instrument search for up to three Yahoo symbols, the user\'s exchange first', () => {
    const { system } = buildInstrumentsPrompt(ANSWERS, PROPOSAL, 'STRUMENTI');
    expect(system).toContain('"ticker"?: string, "yahooSymbols"?: [ string ] (da 1 a 3 simboli con cui Yahoo Finance quota lo strumento: il primo sulla borsa indicata dall\'utente, poi altri listini in euro, es. "SWDA.MI", "EUNL.DE", "IWDA.AS"), "exchange": string');
    expect(system).toContain('Non inventare ISIN o ticker: un dato che non riesci a verificare lo ometti e lo dici in "caveat". Per ogni strumento che l\'utente non possiede scrivi in "yahooSymbols" i simboli di Yahoo Finance che hai verificato con la ricerca: il primo sulla borsa indicata, poi fino a due altri listini in euro dello stesso strumento (stesso ISIN) — l\'app userà il primo che ha un prezzo recente. Per un titolo di Stato basta l\'ISIN.');
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

// ── The interview (2026-11-08) ──────────────────────────────────────────────────────────
const ROUND: AllocationAdviceInterviewRound = {
  note: 'Vedo un reddito concentrato.',
  satisfied: false,
  questions: [
    { id: 'reddito', kind: 'single', text: 'Quanto dipendi dal reddito?', why: "copre l'86% delle entrate", options: [{ value: 'tutto', label: 'Interamente' }, { value: 'meta', label: 'Metà' }], allowOther: true },
    { id: 'riserva', kind: 'multiple', text: 'Cosa copre la riserva?', why: '2 mesi di spesa', options: [{ value: 'conti', label: 'Conti' }, { value: 'btp', label: 'BTP' }], allowOther: true },
  ],
  answers: [{ questionId: 'reddito', value: QUESTION_DECLINE_VALUE }],
  model: 'opus-finto',
  askedAt: new Date('2026-11-08T12:00:00'),
};
const ONE: AllocationAdviceInterview = { rounds: [ROUND], skipped: false };
const TWO: AllocationAdviceInterview = { rounds: [ROUND, { ...ROUND, note: 'Resta la riserva.', answers: [{ questionId: 'riserva', value: { other: 'fenicottero' } }] }], skipped: false };
const PRIOR = { reportMarkdown: '# Report\nIl piano di prima.', revisions: [], finishedAt: new Date('2026-10-20T12:00:00'), appliedAt: null, reviewByIso: null, reviewReason: null };
const CASHFLOW = '--- CASHFLOW 12 MESI (x) ---\nX';

describe('formatInterviewForPrompt (the IL COLLOQUIO block, 2026-11-08)', () => {
  it('prints nothing for null or an interview with no round that was not skipped', () => {
    expect(formatInterviewForPrompt(null)).toBe('');
    expect(formatInterviewForPrompt({ rounds: [], skipped: false })).toBe('');
  });

  it('prints the one sentence for a skip with zero rounds, and the header with the count otherwise', () => {
    expect(formatInterviewForPrompt({ rounds: [], skipped: true })).toBe("L'utente ha saltato il colloquio.");
    const one = formatInterviewForPrompt(ONE);
    expect(one.startsWith('--- IL COLLOQUIO (1 tornata) ---\n')).toBe(true);
    expect(one).toContain("Risposte al colloquio: «Preferisco non dire» è una scelta dell'utente, da rispettare senza dedurne nulla; «non risposta» vuol dire che ha saltato il colloquio prima di rispondere.");
    expect(one).toContain('Tornata 1 — nota del Consulente: «Vedo un reddito concentrato.»');
    expect(one).toContain("- Quanto dipendi dal reddito? (perché: copre l'86% delle entrate) → Preferisco non dire");
    expect(one).toContain('- Cosa copre la riserva? (perché: 2 mesi di spesa) → non risposta');
    expect(one).not.toContain("L'utente ha saltato");
    const two = formatInterviewForPrompt({ ...TWO, skipped: true });
    expect(two).toContain('--- IL COLLOQUIO (2 tornate) ---');
    expect(two).toContain('→ Altro: fenicottero');
    expect(two.endsWith("L'utente ha saltato il colloquio dopo 2 tornate.")).toBe(true);
    expect(formatInterviewForPrompt({ ...ONE, skipped: true })).toContain("L'utente ha saltato il colloquio dopo 1 tornata.");
  });
});

describe('the strategy, the review and the revision read the interview, system unchanged (2026-11-08)', () => {
  it('the strategy prints the block right after the answers, closed by the line on «La situazione», only with a round', () => {
    const without = buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: CASHFLOW });
    const withInterview = buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: CASHFLOW, interview: TWO });
    expect(withInterview.system).toBe(without.system);
    const text = withInterview.userContent;
    expect(text.indexOf('--- RISPOSTE DEL PERCORSO ---')).toBeLessThan(text.indexOf('--- IL COLLOQUIO (2 tornate) ---'));
    expect(text.indexOf('--- IL COLLOQUIO (2 tornate) ---')).toBeLessThan(text.indexOf('sono esaustivi'));
    expect(text).toContain('Tieni conto di queste risposte nella sezione «La situazione».');
    expect(buildStrategyPrompt(ANSWERS, 'DATI', { interview: ONE }).userContent).toContain('--- IL COLLOQUIO (1 tornata) ---');
    const skipped = buildStrategyPrompt(ANSWERS, 'DATI', { interview: { rounds: [], skipped: true } }).userContent;
    expect(skipped).toContain("L'utente ha saltato il colloquio.");
    expect(skipped).not.toContain('--- IL COLLOQUIO');
    expect(skipped).not.toContain('Tieni conto di queste risposte');
    expect(without.userContent).not.toContain('colloquio');
    expect(buildStrategyPrompt(ANSWERS, 'DATI', { interview: null }).userContent).toBe(buildStrategyPrompt(ANSWERS, 'DATI').userContent);
  });

  it('the review prints the block after the answers without the closing line', () => {
    const without = buildReviewPrompt(ANSWERS, 'STRATEGIA', 'STRUMENTI', null);
    const withInterview = buildReviewPrompt(ANSWERS, 'STRATEGIA', 'STRUMENTI', null, { interview: ONE });
    expect(withInterview.system).toBe(without.system);
    const text = withInterview.userContent;
    expect(text.indexOf('--- RISPOSTE DEL PERCORSO ---')).toBeLessThan(text.indexOf('--- IL COLLOQUIO (1 tornata) ---'));
    expect(text.indexOf('--- IL COLLOQUIO (1 tornata) ---')).toBeLessThan(text.indexOf('--- STRATEGIA PROPOSTA'));
    expect(text).not.toContain('Tieni conto di queste risposte');
    expect(without.userContent).not.toContain('colloquio');
  });

  it("the revision prints ITS round after the requests, framed by its two lines, only with a round (2026-11-01)", () => {
    const requests = ['meno cripto', 'solo bond singoli'];
    const without = buildRevisionPrompt(ANSWERS, 'S', 'I', null, 'REPORT', requests);
    const withRound = buildRevisionPrompt(ANSWERS, 'S', 'I', null, 'REPORT', requests, { interview: ONE });
    expect(withRound.system).toBe(without.system);
    const text = withRound.userContent;
    const opening = "Prima di questa revisione il Consulente ha fatto una tornata di domande sull'ultima richiesta:";
    expect(text.indexOf('2. solo bond singoli')).toBeLessThan(text.indexOf(opening));
    expect(text.indexOf(opening)).toBeLessThan(text.indexOf('--- IL COLLOQUIO (1 tornata) ---'));
    expect(text.indexOf('--- IL COLLOQUIO (1 tornata) ---')).toBeLessThan(text.indexOf("Applica l'ultima richiesta alla luce di queste risposte."));
    expect(text.indexOf("Applica l'ultima richiesta alla luce di queste risposte.")).toBeLessThan(text.indexOf("Riscrivi il report intero applicando l'ultima richiesta"));
    expect(without.userContent).not.toContain('Prima di questa revisione');
    expect(buildRevisionPrompt(ANSWERS, 'S', 'I', null, 'REPORT', requests, { interview: { rounds: [], skipped: true } }).userContent).not.toContain('Prima di questa revisione');
  });
});

describe('buildInterviewPrompt (the round\'s user turn and system, 2026-11-08)', () => {
  const base = { cashflowBlock: CASHFLOW, priorPlan: null, previousRounds: [], roundNumber: 1 };

  it('keeps system byte-identical across users, rounds, previous rounds, the plan in force and the revision; the contract is the critical friend', () => {
    const a = buildInterviewPrompt(ANSWERS, 'DATI A', base);
    const b = buildInterviewPrompt({ ...ANSWERS, age: 60, broker: 'Altro' }, 'DATI B', { ...base, roundNumber: 3, previousRounds: TWO.rounds, priorPlan: PRIOR });
    const c = buildInterviewPrompt(ANSWERS, 'DATI', { ...base, revision: { requests: '1. meno cripto', report: 'REPORT' } });
    expect(a.system).toBe(b.system);
    expect(a.system).toBe(c.system);
    expect(a.system.endsWith(INTERVIEW_CONTRACT)).toBe(true);
    expect(a.system).toContain('# Ruolo');
    expect(a.system).toContain('In questa fase non proponi né consigli: chiedi.');
    expect(a.system).toContain('chiedi SOLO ciò che i dati o le risposte rendono dubbio e che cambierebbe la strategia');
    expect(a.system).toContain("una rata di prestito accanto a «niente da evitare»");
    expect(a.system).toContain('Non chiedere ciò che le risposte dicono già. Non dare consigli, non proporre allocazioni, non giudicare il mercato.');
    expect(a.system).toContain('UN oggetto JSON con tre campi, in quest\'ordine: `note`, `satisfied`, `questions`');
    expect(a.system).toContain('da 0 a 4 domande; quelle oltre la quarta vengono scartate');
    expect(a.system).toContain("Non mettere fra le opzioni «Altro» né «Preferisco non dire»: l'app li aggiunge a ogni domanda.");
    expect(a.system).toContain('Le tornate sono al massimo tre e il numero della tornata è scritto alla fine dei dati.');
    expect(a.system).not.toContain('tornata 1');
    expect(a.system).not.toContain('DATI A');
  });

  it('puts the answers, the data intro, the data, the cashflow block under its note and the round number in the user turn, in order', () => {
    const { userContent } = buildInterviewPrompt(ANSWERS, 'DATI', base);
    const at = (needle: string) => {
      const index = userContent.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at('--- RISPOSTE DEL PERCORSO ---')).toBeLessThan(at('PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi'));
    expect(at('sono esaustivi')).toBeLessThan(at('\nDATI\n'));
    expect(at('\nDATI\n')).toBeLessThan(at(CASHFLOW));
    expect(at(CASHFLOW)).toBeLessThan(at('Questa è la tornata 1 di 3.'));
    expect(userContent).not.toContain("È l'ultima");
    expect(userContent).not.toContain('LE TORNATE PRECEDENTI');
    expect(userContent).not.toContain('IL PIANO IN VIGORE');
    expect(userContent.endsWith('Leggi risposte e dati e scrivi la tornata come descritto nel contratto.')).toBe(true);
    // The same data intro the strategy prints: the two never drift.
    const intro = buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: CASHFLOW }).userContent.split('\n').find((line) => line.startsWith('Di seguito i dati'));
    expect(userContent).toContain(intro);
  });

  it('prints the previous rounds, the plan in force and the third round\'s warning', () => {
    const { userContent } = buildInterviewPrompt(ANSWERS, 'DATI', { ...base, roundNumber: 3, previousRounds: TWO.rounds, priorPlan: PRIOR });
    expect(userContent).toContain('--- IL PIANO IN VIGORE E IL PERCHÉ');
    expect(userContent).toContain('--- LE TORNATE PRECEDENTI ---\nTornata 1 — nota del Consulente: «Vedo un reddito concentrato.»');
    expect(userContent).toContain('Tornata 2 — nota del Consulente: «Resta la riserva.»');
    expect(userContent).toContain('→ Altro: fenicottero');
    expect(userContent).toContain("Questa è la tornata 3 di 3. È l'ultima: non ci sarà una quarta tornata.");
    expect(userContent.indexOf('IL PIANO IN VIGORE')).toBeLessThan(userContent.indexOf('LE TORNATE PRECEDENTI'));
  });

  it('in revision mode prints the report and the requests, the one-round sentence, and no round number', () => {
    const { userContent } = buildInterviewPrompt(ANSWERS, 'DATI', { ...base, revision: { requests: '1. meno cripto\n2. niente ornitorinchi', report: 'IL REPORT FINTO' } });
    expect(userContent).toContain('--- IL REPORT DA RIVEDERE ---\nIL REPORT FINTO');
    expect(userContent).toContain("--- LE RICHIESTE DELL'UTENTE, in ordine (l'ultima è quella nuova) ---\n1. meno cripto\n2. niente ornitorinchi");
    expect(userContent).toContain("Questa tornata riguarda SOLO l'ultima richiesta di modifica: chiedi cosa intende, cosa accetta di cedere e cosa non va toccato, se i dati o il report lo rendono dubbio. È l'unica tornata: non ce ne sarà un'altra.");
    expect(userContent).not.toContain('Questa è la tornata');
    expect(userContent.endsWith('Leggi risposte e dati e scrivi la tornata come descritto nel contratto.')).toBe(true);
  });
});

// ── The bonds by horizon (owner, 2026-11-08, after the interview's phase F on the mirror) ──────────────────────
describe('the OBBLIGAZIONI block in the four contracts', () => {
  it('the interview asks what the bond part is for, the strategy ties each bond sub-target to a horizon, the search verifies and writes a duration, the review reports it', () => {
    expect(INTERVIEW_CONTRACT).toContain('Le obbligazioni: se il blocco OBBLIGAZIONI elenca titoli o ETF, o la classe dovrà avere peso nel piano, chiedi a cosa servono');
    expect(buildStrategyPrompt(ANSWERS, 'DATI').system).toContain('Nella classe Obbligazioni ogni sotto-target dice nel testo quale orizzonte copre (es. 1-3 anni, 3-7 anni) e quale obiettivo serve');
    const instruments = buildInstrumentsPrompt(ANSWERS, PROPOSAL, 'STRUMENTI').system;
    expect(instruments).toContain('verifica anche la duration effettiva (o la scadenza media) di ogni ETF e scrivila in "duration" (anni)');
    expect(instruments).toContain('"duration"?: number (anni: la duration effettiva di un ETF obbligazionario, verificata)');
    expect(buildReviewPrompt(ANSWERS, 'STRATEGIA', 'STRUMENTI', null).system).toContain("per gli obbligazionari la duration e l'orizzonte (l'obiettivo) che coprono");
  });

  // Yahoo's duration proved wrong on real ETFs (owner, 2026-11-20): only the search writes a duration in figures.
  // Mutation that turns it red: the strategy's rule put back to «le duration degli ETF».
  it('only the instrument search writes a duration in figures: the interview and the strategy never do', () => {
    const strategy = buildStrategyPrompt(ANSWERS, 'DATI').system;
    expect(strategy).toContain("non scrivere la duration di un ETF in numeri: la verifica il secondo agente con la ricerca web");
    expect(strategy).not.toContain('le duration degli ETF');
    expect(INTERVIEW_CONTRACT).toContain("mai una duration in numeri: il blocco non ne riporta");
    expect(INTERVIEW_CONTRACT).not.toContain('le duration che il blocco riporta');
    expect(buildInstrumentsPrompt(ANSWERS, PROPOSAL, 'STRUMENTI').system).not.toContain('duration di Yahoo');
  });

  // A goal with a date and an amount wants a known sum on that date (owner, 2026-11-20): a government bond held to
  // maturity, an ETF only when the user chose it. Mutation that turns it red: any of the three rules left out.
  it('a goal with a date and an amount: the interview offers a bond to maturity, the strategy proposes it, the search finds one by that year', () => {
    expect(INTERVIEW_CONTRACT).toContain("fra le opzioni c'è un titolo singolo che scade vicino a quella data, tenuto a scadenza");
    const strategy = buildStrategyPrompt(ANSWERS, 'DATI').system;
    expect(strategy).toContain("proponi per lui un titolo di Stato tenuto a scadenza (un BTP, o un BTP€i se la cifra va protetta dall'inflazione) che scade entro l'anno dell'obiettivo");
    expect(strategy).toContain("lo proponi solo se l'utente nel colloquio ha scelto gli ETF per quell'obiettivo, e allora dici in una riga cosa perde");
    expect(buildInstrumentsPrompt(ANSWERS, PROPOSAL, 'STRUMENTI').system).toContain("che scadono entro l'anno nominato dal testo della strategia, mai dopo, il più vicino a quell'anno per primo");
  });

  it('the data intro names OBBLIGAZIONI among the exhaustive blocks, with and without the cashflow block', () => {
    expect(buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: '--- CASHFLOW 12 MESI (x) ---\nX' }).userContent).toContain('MUTUI, FAMIGLIA, OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi');
    expect(buildStrategyPrompt(ANSWERS, 'DATI').userContent).toContain('FAMIGLIA, OBBLIGAZIONI e PIANO DI ACCUMULO sono esaustivi.');
  });
});

// ── The previous paths (owner, 2026-11-08, after the interview's phase F on the mirror) ──────────────────────────
describe('formatPreviousPathsForPrompt', () => {
  const at = (iso: string) => new Date(`${iso}T10:00:00.000Z`);
  const pathDoc = (overrides: Partial<AllocationAdviceDocument> = {}): AllocationAdviceDocument => ({
    userId: 'u1',
    status: 'applied',
    answers: ANSWERS,
    stage: 'review',
    createdAt: at('2025-10-20'),
    updatedAt: at('2025-10-22'),
    startedAt: at('2025-10-20'),
    strategy: null,
    instruments: null,
    report: { markdown: '# Report', proposal: PROPOSAL, model: 'o', finishedAt: at('2025-10-20') },
    error: null,
    applied: { at: at('2025-10-21'), targetsWritten: true, rolesChanged: 0, goalsWritten: 1 },
    revisions: [{ request: 'meno cripto', at: at('2025-10-22') }],
    interview: ONE,
    revisionInterview: null,
    ...overrides,
  });
  const collapse = (text: string) => text.replace(/\u00a0/g, ' ');

  it('is empty with no path and a read archive; says so when the archive could not be read', () => {
    expect(formatPreviousPathsForPrompt(null)).toBe('');
    expect(formatPreviousPathsForPrompt({ paths: [], archiveRead: true })).toBe('');
    expect(formatPreviousPathsForPrompt({ paths: [], archiveRead: false })).toBe("--- I PERCORSI PRECEDENTI ---\nL'archivio dei percorsi non è stato letto in questa corsa: non so se ce ne sono.");
  });

  it('prints each path with its dates, the answers of then, the user\'s words, the interview, the requests and the proposal, most recent first', () => {
    const older = pathDoc({ createdAt: at('2024-10-20'), applied: null, revisions: [], interview: { rounds: [], skipped: true }, report: { markdown: '# R', proposal: { ...PROPOSAL, summary: 'Prima.' }, model: 'o', finishedAt: at('2024-10-20') } });
    const text = collapse(formatPreviousPathsForPrompt({ paths: [pathDoc(), older], archiveRead: true }));
    expect(text).toContain('--- I PERCORSI PRECEDENTI (2 percorsi, dal più recente; il report del primo è il piano in vigore) ---');
    expect(text).not.toContain("non è stato letto");
    expect(text).toContain('## Percorso del 2025-10-20 (report del 2025-10-20; applicato il 2025-10-21; revisione consigliata entro il 2028-10-20)');
    expect(text).toContain('Risposte di allora: età 35 anni | orizzonte 20 anni | tolleranza alta: reggerebbe un −40% senza vendere e comprerebbe ancora | proventi ad accumulazione (reinveste i proventi) | ESG sì | da tenere: ETF Mondo | da evitare: niente leva');
    expect(text).toContain('Obiettivi di allora (3): Casa (target 50.000 €, scadenza 2031-06-01, priorità alta) — «metà a testa» · Vecchio (da eliminare, senza importo, senza scadenza, priorità bassa) · Auto (target 20.000 €, senza scadenza, priorità media)');
    expect(text).toContain('Nelle sue parole: gli obiettivi NON rispecchiavano del tutto la realtà | cosa mancava: «manca un fondo per i figli»');
    expect(text).toContain('Colloquio di allora (1 tornata):\nTornata 1 — nota del Consulente: «Vedo un reddito concentrato.»');
    expect(text).toContain('Modifiche chieste allora sul report: 1. meno cripto');
    expect(text).toContain('Proposta di allora: S. — Azioni 60% · Obbligazioni 40%');
    // The older one: never applied, the interview skipped, no request.
    expect(text).toContain('\n\n## Percorso del 2024-10-20 (report del 2024-10-20; mai applicato; revisione consigliata entro il 2028-10-20)');
    expect(text).toContain('Colloquio di allora: saltato.');
    expect(text).toContain('Proposta di allora: Prima. — ');
    expect(text.indexOf('## Percorso del 2025-10-20')).toBeLessThan(text.indexOf('## Percorso del 2024-10-20'));
    expect(text).not.toContain('Modifiche chieste allora sul report: 1. meno cripto\n\n## Percorso del 2024');
  });

  // The goals a path proposed are part of what it did: «Applica» created them (owner, 2026-11-20, NOVE-25's phase F:
  // the Consulente read its own new goal as the user's novelty). Mutation that turns it red: the line left out.
  it('names the new goals the path proposed, created by «Applica» when it was applied', () => {
    const goals = [
      { goalId: 'g1', name: 'Casa', priority: 'alta' as const, assignments: [], rationale: '' },
      { name: 'Lavori', targetAmount: 10000, targetDateIso: '2027-06-01', priority: 'media' as const, assignments: [], rationale: '' },
    ];
    const applied = collapse(formatPreviousPathsForPrompt({ paths: [pathDoc({ report: { markdown: '# R', proposal: { ...PROPOSAL, goals }, model: 'o', finishedAt: at('2025-10-20') } })], archiveRead: true }));
    expect(applied).toContain('Obiettivi nuovi proposti allora, creati da «Applica»: Lavori (target 10.000 €, scadenza 2027-06-01, priorità media)');
    expect(applied).not.toContain('proposti allora, creati da «Applica»: Casa');
    const never = collapse(formatPreviousPathsForPrompt({ paths: [pathDoc({ applied: null, report: { markdown: '# R', proposal: { ...PROPOSAL, goals }, model: 'o', finishedAt: at('2025-10-20') } })], archiveRead: true }));
    expect(never).toContain('Obiettivi nuovi proposti allora, mai creati: Lavori (');
    expect(collapse(formatPreviousPathsForPrompt({ paths: [pathDoc()], archiveRead: true }))).not.toContain('Obiettivi nuovi proposti allora');
  });

  it('a path without a report says which stage it stopped at; an unread archive leaves the live one alone', () => {
    const text = formatPreviousPathsForPrompt({ paths: [pathDoc({ status: 'failed', stage: 'strategy', report: null, applied: null, revisions: [] })], archiveRead: false });
    expect(text).toContain('(1 percorso, dal più recente; il report del primo è il piano in vigore) ---\nL\'archivio dei percorsi non è stato letto in questa corsa: qui c\'è solo l\'ultimo.');
    expect(text).toContain('## Percorso del 2025-10-20 (nessun report; mai applicato)');
    expect(text).toContain('Proposta di allora: nessuna (percorso fallito alla fase strategy)');
  });

  it('rides in the interview after the plan in force and before the previous rounds, and in the strategy before the closing instruction; system unchanged', () => {
    const previous = { paths: [pathDoc()], archiveRead: true };
    const base = { cashflowBlock: '--- CASHFLOW 12 MESI (x) ---\nX', priorPlan: PRIOR, previousRounds: TWO.rounds, roundNumber: 3 };
    const interview = buildInterviewPrompt(ANSWERS, 'DATI', { ...base, previousPaths: previous });
    const plan = interview.userContent.indexOf('--- IL PIANO IN VIGORE');
    const paths = interview.userContent.indexOf('--- I PERCORSI PRECEDENTI');
    const rounds = interview.userContent.indexOf('--- LE TORNATE PRECEDENTI ---');
    expect(plan).toBeGreaterThanOrEqual(0);
    expect(paths).toBeGreaterThan(plan);
    expect(rounds).toBeGreaterThan(paths);
    expect(interview.system).toBe(buildInterviewPrompt(ANSWERS, 'DATI', base).system);
    expect(buildInterviewPrompt(ANSWERS, 'DATI', base).userContent).not.toContain('I PERCORSI PRECEDENTI');

    const strategy = buildStrategyPrompt(ANSWERS, 'DATI', { priorPlan: PRIOR, previousPaths: previous });
    expect(strategy.userContent).toMatch(/--- IL PIANO IN VIGORE[\s\S]*--- I PERCORSI PRECEDENTI[\s\S]*Proposta di allora: S\. — Azioni 60% · Obbligazioni 40%\n\nProponi l'allocazione ottimale/);
    expect(strategy.system).toBe(buildStrategyPrompt(ANSWERS, 'DATI').system);
    expect(buildStrategyPrompt(ANSWERS, 'DATI', { priorPlan: PRIOR }).userContent).not.toContain('I PERCORSI PRECEDENTI');
  });

  it('the interview and the strategy contracts carry the reading rule: a change since then is a question, an emotion in the words is said with its sentence, never judged', () => {
    expect(INTERVIEW_CONTRACT).toContain("- Se ci sono PERCORSI PRECEDENTI, confronta le risposte di oggi con quelle di allora — tolleranza, orizzonte, obiettivi, strumenti da tenere: un cambiamento che i dati non spiegano è una domanda, e nel `why` citi la risposta di allora e quella di oggi. Se nelle parole dell'utente, di allora o di oggi, leggi paura, fretta o euforia, dillo nella `note` con la frase che te lo fa pensare, senza giudicare, e chiedi se è il momento giusto per cambiare piano.");
    expect(buildStrategyPrompt(ANSWERS, 'DATI').system).toContain("Se ci sono PERCORSI PRECEDENTI, «La situazione» dice cosa è cambiato rispetto ad allora — tolleranza, orizzonte, obiettivi, strumenti da tenere — e se il cambiamento nasce dai fatti (reddito, patrimonio, famiglia, obiettivi) o dalle parole dell'utente: se nelle sue parole, di allora o di oggi, leggi paura, fretta o euforia, nominale citando la frase che te lo fa pensare, senza giudicare; un piano che cambia direzione per emozione lo dice e propone il passo più piccolo che la rispetta.");
  });
});

// ── The PIANO DI ACCUMULO block and the path in words (owner, 2026-11-12) ──────────────────────
describe('the PIANO DI ACCUMULO block', () => {
  const nbsp = (text: string) => text.replace(/ /g, ' ');
  const RUNNING = {
    monthIndex: 3, months: 12, instalmentEur: 500, startMonth: '2026-09', endMonth: '2027-08',
    firstBuy: { month: '2026-11' as const, index: 3, amountEur: 500 },
    buys: [{ assetId: 'a', name: 'ETF ornitorinco', sharePct: 70, amountEur: 3500 }, { assetId: 'b', name: 'ETF fenicottero', sharePct: 30, amountEur: 1500 }],
    holds: [] as Array<{ assetId: string; name: string }>,
    sells: [{ assetId: 'c', name: 'Fondo vecchio', quantity: null, monthIndex: null, status: 'planned' as const }],
  };

  // Mutation: the not-started branch dropped → «mese 0 di 12».
  it('tells the three states apart: not read, no active plan, an active plan before its start and while it runs', () => {
    expect(formatAccumulationPlanForPrompt({ read: false })).toBe("--- PIANO DI ACCUMULO ---\nIl piano di accumulo non è stato letto in questa corsa: non so se ce n'è uno.");
    expect(formatAccumulationPlanForPrompt({ read: true, plan: null })).toBe('--- PIANO DI ACCUMULO ---\nNessun piano di accumulo attivo.');
    const notStarted = nbsp(formatAccumulationPlanForPrompt({ read: true, plan: { ...RUNNING, monthIndex: 0, startMonth: '2027-01', endMonth: '2027-12', firstBuy: { month: '2027-01', index: 1, amountEur: 500 }, sells: [] } }));
    expect(notStarted).toContain('Piano attivo, non ancora partito: parte a 2027-01, 12 mesi fino a 2027-12, prima rata 500 €.');
    expect(notStarted).not.toContain('mese 0 di');
    expect(notStarted).toContain('Vende: niente.');
    const running = nbsp(formatAccumulationPlanForPrompt({ read: true, plan: RUNNING }));
    expect(running).toBe([
      '--- PIANO DI ACCUMULO ---',
      'Piano attivo: mese 3 di 12, rata del mese 500 €, ultimo mese 2027-08.',
      'Compra, in parti dei soldi del piano: ETF ornitorinco 70% (3500 €) · ETF fenicottero 30% (1500 €).',
      'Vende: Fondo vecchio, tutte le quote, al mese 1 (da fare).',
    ].join('\n'));
    const sale = nbsp(formatAccumulationPlanForPrompt({ read: true, plan: { ...RUNNING, sells: [{ ...RUNNING.sells[0], quantity: 10, monthIndex: 2, status: 'executed' as const }] } }));
    expect(sale).toContain('Vende: Fondo vecchio, 10 quote, al mese 2 (fatta).');
    // The swap (owner, 2026-11-20): the sale names what its proceeds buy. Mutation that turns it red: the clause dropped.
    const swap = nbsp(formatAccumulationPlanForPrompt({ read: true, plan: { ...RUNNING, sells: [{ ...RUNNING.sells[0], reinvestName: 'BTP civetta' }] } }));
    expect(swap).toContain('Vende: Fondo vecchio, tutte le quote, al mese 1 (da fare), e con il ricavato compra BTP civetta nello stesso mese.');
  });

  // The plan «Applica» creates refills the reserve first and keeps the held positions at their weight (owner,
  // 2026-11-20): the Consulente read «prima rata di 0 €» and the holds as buys. Mutations that turn it red: the
  // refill clause dropped; the holds printed among the buys.
  it('a plan that refills first names the months of reserve and the first instalment; the holds are not buys', () => {
    const refill = {
      ...RUNNING, monthIndex: 1, months: 36, instalmentEur: 0, startMonth: '2026-12', endMonth: '2029-11',
      firstBuy: { month: '2027-11' as const, index: 12, amountEur: 800 },
      holds: [{ assetId: 'c', name: 'ETC civetta' }, { assetId: 'd', name: 'ETF tasso' }], sells: [],
    };
    expect(nbsp(formatAccumulationPlanForPrompt({ read: true, plan: refill }))).toBe([
      '--- PIANO DI ACCUMULO ---',
      'Piano attivo: mese 1 di 36, ultimo mese 2029-11; questo mese e i successivi fino a 2027-10 ricostituiscono solo la riserva (11 mesi senza acquisti), prima rata 800 € a 2027-11.',
      'Compra, in parti dei soldi del piano: ETF ornitorinco 70% (3500 €) · ETF fenicottero 30% (1500 €).',
      'Tiene al loro peso, senza comprarli: ETC civetta · ETF tasso.',
      'Vende: niente.',
    ].join('\n'));
    const before = nbsp(formatAccumulationPlanForPrompt({ read: true, plan: { ...refill, monthIndex: 0 } }));
    expect(before).toContain('Piano attivo, non ancora partito: parte a 2026-12, 36 mesi fino a 2029-11; i mesi fino a 2027-10 ricostituiscono solo la riserva (11 mesi senza acquisti), prima rata 800 € a 2027-11.');
    const none = nbsp(formatAccumulationPlanForPrompt({ read: true, plan: { ...refill, firstBuy: null } }));
    expect(none).toContain('Piano attivo: mese 1 di 36, ultimo mese 2029-11; non resta nessuna rata da comprare.');
  });

  it('names the block among the exhaustive ones in both data intros', () => {
    expect(buildStrategyPrompt(ANSWERS, 'DATI').userContent).toContain('OBBLIGAZIONI e PIANO DI ACCUMULO sono esaustivi.');
    expect(buildInterviewPrompt(ANSWERS, 'DATI', { cashflowBlock: 'X', priorPlan: null, previousRounds: [], roundNumber: 1 }).userContent)
      .toContain('OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi.');
  });

  it('rides in the review and the revision right before their last line, only when given', () => {
    const block = '--- PIANO DI ACCUMULO ---\nNessun piano di accumulo attivo.';
    const review = buildReviewPrompt(ANSWERS, 'S', 'I', null, { accumulationPlan: block });
    expect(review.userContent.endsWith(`${block}\n\nScrivi il report finale come descritto.`)).toBe(true);
    expect(buildReviewPrompt(ANSWERS, 'S', 'I', null).userContent).not.toContain('PIANO DI ACCUMULO');
    const revision = buildRevisionPrompt(ANSWERS, 'S', 'I', null, 'R', ['meno cripto'], { accumulationPlan: block });
    expect(revision.userContent.endsWith(`${block}\n\nRiscrivi il report intero applicando l'ultima richiesta, come descritto.`)).toBe(true);
  });

  // Mutation: the plan line put in `system`.
  it('keeps system byte-identical across users and with or without the block (strategy, review, revision)', () => {
    const block = formatAccumulationPlanForPrompt({ read: true, plan: RUNNING });
    const other = { ...ANSWERS, age: 60 };
    expect(buildStrategyPrompt(ANSWERS, `DATI\n\n${block}`).system).toBe(buildStrategyPrompt(other, 'DATI').system);
    const review = buildReviewPrompt(ANSWERS, 'S', 'I', null, { accumulationPlan: block });
    expect(review.system).toBe(buildReviewPrompt(other, 'S2', 'I2', null).system);
    expect(review.system).not.toContain('ETF ornitorinco');
    const revision = buildRevisionPrompt(ANSWERS, 'S', 'I', null, 'R', ['x'], { accumulationPlan: block });
    expect(revision.system).toBe(buildRevisionPrompt(other, 'S2', 'I2', null, 'R2', ['y']).system);
  });

  it('the strategy\'s section 5 and the review\'s section 6 carry the path in words, from the cashflow, with no table', () => {
    const strategy = buildStrategyPrompt(ANSWERS, 'DATI').system;
    expect(strategy).toContain("5. **Cosa cambia rispetto a oggi** — le differenze principali con i target attuali e con le classi attuali, in punti percentuali; poi come arrivarci: accumulando con il risparmio mensile (un piano di accumulo che compra le classi sotto target) o vendendo, e in quanto tempo all'incirca, con la rata mensile come ordine di grandezza (una cifra tonda), dalla mediana del risparmio mensile del blocco CASHFLOW 12 MESI (senza quel blocco non stimare né il tempo né la rata); se il blocco PIANO DI ACCUMULO descrive un piano attivo, se va già in quella direzione o va rivisto. Nessuna tabella di rate o di quote per strumento: le cifre esatte le scrive il piano operativo, dopo il report.");
    expect(strategy).toContain('poi come arrivarci');
    expect(strategy).toContain('con la rata mensile come ordine di grandezza');
    const review = buildReviewPrompt(ANSWERS, 'S', 'I', null).system;
    expect(review).toContain("6. **Cosa fare adesso** — i passi concreti, in ordine, con i costi fiscali di un eventuale cambio di strumento; poi la strada che la strategia indica per arrivare ai target — accumulare con il risparmio mensile o vendere, il tempo indicativo e la rata come la strategia li stima, senza ricalcolarli — e, se il blocco PIANO DI ACCUMULO descrive un piano attivo, se va verso i nuovi target o va rivisto. Le cifre del piano — versamento, mesi, quote, vendite — le scrive il passo successivo, nella pagina «Il piano operativo»: qui ragiona a parole, niente tabelle di rate né quote per strumento.");
    expect(review).toContain('senza ricalcolarli');
    expect(review).not.toContain("Il piano esatto lo calcola l'app");
  });

  // Mutation: an eighth section added.
  it('the review keeps seven sections', () => {
    const review = buildReviewPrompt(ANSWERS, 'S', 'I', null).system;
    expect(review).toContain('7. **Rischi e revisione**');
    expect(review).not.toContain('8. **');
  });
});

// ── The «Piano» stage (2026-11-19): the facts block, the contract, the user turn ─────────────
describe('formatOperatingPlanFacts and buildPlanPrompt', () => {
  const facts = (): OperatingPlanFacts => ({
    instruments: [
      { ref: 'S1', kind: 'held', name: 'ETF Mondo', assetClass: 'equity', subCategory: 'Mondo', assetId: 'asset-mondo-1' },
      { ref: 'S2', kind: 'held', name: 'ETF Emergenti', assetClass: 'equity', subCategory: 'Emergenti', assetId: 'asset-emergenti-2' },
      { ref: 'S3', kind: 'held', name: 'ETF Oro', assetClass: 'commodity', assetId: 'asset-oro-3' },
      {
        ref: 'N1', kind: 'new', name: 'ETF Obbligazioni Euro 1-3', assetClass: 'bonds', subCategory: 'Euro 1-3 anni',
        prefill: { name: 'ETF Obbligazioni Euro 1-3', ticker: '', isin: 'IE00AAAAAAA1', type: 'etf', assetClass: 'bonds', subCategory: 'Euro 1-3 anni' },
        symbols: [],
      },
      { ref: 'M1', kind: 'cashFund', name: 'Fondo Monetario Euro', assetClass: 'cash', assetId: 'asset-fondo-4' },
    ],
    held: {
      S1: { quantity: 120, priceEur: 100, valueEur: 12000, keep: true, tax: { kind: 'taxed', perEuro: 520 / 12000 } },
      S2: { quantity: 40, priceEur: 50, valueEur: 2000, keep: false, tax: { kind: 'unknown', reason: 'rate' }, maxPct: 15 },
      S3: { quantity: 0, priceEur: 60, valueEur: 0, keep: false, tax: { kind: 'exempt' } },
      M1: { quantity: 300, priceEur: 10, valueEur: 3000, keep: false, tax: { kind: 'exempt' } },
    },
  });
  const block = (overrides: Partial<Parameters<typeof formatOperatingPlanFacts>[0]> = {}) =>
    formatOperatingPlanFacts({
      facts: facts(),
      firstMonthLabel: 'dicembre 2026',
      investmentAccount: { name: 'Conto ornitorinco', balanceEur: 12000 },
      accountsEur: 18000,
      reserveEur: 10000,
      ...overrides,
    });

  // Mutation: `asset.isin` printed, or the rate.
  it('prints one fact per line, every key with its legend, never an id, a rate or a held ISIN', () => {
    const text = block();
    expect(text.split('\n')).toEqual([
      '--- DATI PER IL PIANO OPERATIVO ---',
      'Mese 1 del piano: dicembre 2026.',
      'Conto per gli investimenti: Conto ornitorinco, saldo €12.000.',
      "Riserva di liquidità dell'allocazione proposta: €10.000. Sopra la riserva ci sono €2.000.",
      'Strumenti posseduti che un piano può comprare (chiave · nome · classe › sotto-categoria · quote · prezzo · valore · tasse stimate se venduto tutto):',
      'S1 · ETF Mondo · Azioni › Mondo · 120 quote · €100,00 · €12.000 · tasse stimate €520 · DA TENERE',
      "S2 · ETF Emergenti · Azioni › Emergenti · 40 quote · €50,00 · €2.000 · tasse non stimabili (manca l'aliquota) · limite: massimo 15%",
      'S3 · ETF Oro · Materie Prime · 0 quote, non posseduto · €60,00',
      'Fondi monetari (si possono vendere, mai comprare):',
      'M1 · Fondo Monetario Euro · 300 quote · €10,00 · €3.000 · esente',
      'Strumenti nuovi indicati dal report (0 quote, da creare):',
      'N1 · ETF Obbligazioni Euro 1-3 (IE00AAAAAAA1) · Obbligazioni › Euro 1-3 anni',
    ]);
    expect(text).not.toMatch(/asset-/);
    // No rate: the only «%» is a limit's, and no «26» outside the month's year.
    expect(text.replace('dicembre 2026', '')).not.toContain('26');
    expect(text.match(/%/g)).toHaveLength(1);
  });

  it('says the account is not set, a reserve short of money, both limits, the cost basis missing and an empty section', () => {
    const own = facts();
    own.held.S2 = { ...own.held.S2, tax: { kind: 'unknown', reason: 'cost-basis' }, minPct: 5 };
    own.instruments = own.instruments.filter((instrument) => instrument.kind !== 'cashFund');
    delete own.held.M1;
    const text = block({ facts: own, investmentAccount: null, accountsEur: 7000 });
    expect(text).toContain('Conto per gli investimenti: non impostato: i conti liquidi sommano €7.000.');
    expect(text).toContain('Mancano €3.000 alla riserva.');
    expect(text).toContain('tasse non stimabili (manca il costo fiscale) · limite: minimo 5% · massimo 15%');
    expect(text).toContain('Fondi monetari (si possono vendere, mai comprare):\nnessuno');
  });

  // Found on the guided verification (2026-11-19): a proposal without a cash class gave a reserve of
  // a float's negative zero, printed «€-0». Mutation: the euro figure printed without the zero's sign cleared.
  // Found on the guided verification (2026-11-19): a held asset's name stored with a leading space
  // printed «S1 ·  …». Mutation: the names printed as stored.
  it('trims the names it prints: a key, an account, a new instrument', () => {
    const own = facts();
    own.instruments = own.instruments.map((instrument) => ({ ...instrument, name: `  ${instrument.name} ` }));
    const text = block({ facts: own, investmentAccount: { name: ' Conto ornitorinco ', balanceEur: 12000 } });
    expect(text).toContain('S1 · ETF Mondo · Azioni');
    expect(text).toContain('M1 · Fondo Monetario Euro · 300 quote');
    expect(text).toContain('N1 · ETF Obbligazioni Euro 1-3 (IE00AAAAAAA1)');
    expect(text).toContain('Conto per gli investimenti: Conto ornitorinco, saldo');
    expect(text).not.toMatch(/ {2}/);
  });

  it('never prints a negative zero: a reserve of −0,0001 reads «€0»', () => {
    const text = block({ reserveEur: -0.0001, investmentAccount: null, accountsEur: 8000 });
    expect(text).toContain("Riserva di liquidità dell'allocazione proposta: €0. Sopra la riserva ci sono €8.000.");
    expect(text).not.toContain('€-0');
  });

  const prompt = (overrides: { factsBlock?: string; cashflowBlock?: string } = {}) =>
    buildPlanPrompt(ANSWERS, '# In una frase\nIl report.\n\n```allocation-proposal\n{}\n```', '- Mondo: trovato.', null, {
      factsBlock: overrides.factsBlock ?? block(),
      cashflowBlock: overrides.cashflowBlock ?? '--- CASHFLOW 12 MESI ---\nmediana del risparmio €1.000',
      accumulationPlan: '--- PIANO DI ACCUMULO ---\nNessun piano di accumulo attivo.',
    });

  // Mutation: the cashflow block dropped.
  it('carries the answers, the report with its block, the instruments, the facts, the cashflow and the plan, in this order', () => {
    const { userContent } = prompt();
    const at = (needle: string) => {
      const index = userContent.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };
    const order = [
      at('--- RISPOSTE DEL PERCORSO ---'),
      at('--- IL REPORT (la revisione) ---'),
      at('```allocation-proposal'),
      at('--- STRUMENTI TROVATI ---'),
      at('--- DATI PER IL PIANO OPERATIVO ---'),
      at('--- CASHFLOW 12 MESI ---'),
      at('--- PIANO DI ACCUMULO ---'),
      at('Scrivi il piano operativo come descritto.'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(userContent).toContain('NOTA: il secondo agente non ha prodotto un blocco strutturato valido');
  });

  // Mutation: the month interpolated in the contract.
  it('keeps system byte-identical for two portfolios, ending with the contract', () => {
    const other = buildPlanPrompt({ ...ANSWERS, age: 60 }, 'Altro report.', 'Altri strumenti.', null, {
      factsBlock: block({ firstMonthLabel: 'marzo 2027', investmentAccount: null, accountsEur: 500, reserveEur: 0 }),
      cashflowBlock: '--- CASHFLOW 12 MESI ---\naltro',
      accumulationPlan: '--- PIANO DI ACCUMULO ---\naltro',
    });
    const { system } = prompt();
    expect(system).toBe(other.system);
    expect(system.endsWith(PLAN_CONTRACT)).toBe(true);
    expect(system).not.toContain('dicembre 2026');
    expect(PLAN_CONTRACT).toContain('Non vendere MAI uno strumento segnato DA TENERE');
    expect(PLAN_CONTRACT).toContain('le vendite e i primi versamenti la ricostituiscono prima che il piano compri');
  });

  // The swap (owner, 2026-11-20): written only when the report says to sell one instrument to buy another with the
  // money. Mutation that turns it red: the field or its rule left out of the contract.
  it('the contract names the swap: the field, when to write it, and the quota it leaves', () => {
    expect(PLAN_CONTRACT).toContain('"reinvestInto"?: string (solo su una riga "sell": la chiave della riga "buy" che il ricavato compra tutto nel mese della vendita, lo scambio)');
    expect(PLAN_CONTRACT).toContain('- Scrivi "reinvestInto" solo quando il report dice di vendere uno strumento per comprarne un altro con quei soldi');
    expect(PLAN_CONTRACT).toContain('una riga comprata solo con lo scambio ha "targetPercentage" 0');
  });
});
