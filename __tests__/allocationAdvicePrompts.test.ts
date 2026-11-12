/**
 * The Consulente's three prompts (lib/server/allocationAdvice/prompts.ts): the answers block,
 * a system byte-identical across users, the sleeves the instrument search is handed, the review
 * that is told when the candidates block is missing.
 */

import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_CONTRACT,
  buildInstrumentsPrompt,
  buildInterviewPrompt,
  buildReviewPrompt,
  buildRevisionPrompt,
  buildStrategyPrompt,
  formatAnswersForPrompt,
  formatInterviewForPrompt,
  formatPreviousPathsForPrompt,
  formatPriorPlanForPrompt,
} from '@/lib/server/allocationAdvice/prompts';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { AllocationAdviceAnswers, AllocationAdviceInterview, AllocationAdviceInterviewRound, AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import { QUESTION_DECLINE_VALUE } from '@/lib/utils/questionSet';

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
    expect(withBlock.userContent).toContain('PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI e CASHFLOW 12 MESI sono esaustivi. Il blocco CASHFLOW del periodo copre solo l\'anno in corso: per entrate, spesa e risparmio usa il blocco CASHFLOW 12 MESI.');
    expect(without.userContent).not.toContain('CASHFLOW 12 MESI');
    expect(without.userContent).toContain('PREVIDENZA, MUTUI, FAMIGLIA e OBBLIGAZIONI sono esaustivi.');
  });

  it('keeps system byte-identical with and without the block, and across users', () => {
    const a = buildStrategyPrompt(ANSWERS, 'DATI A', { cashflowBlock: BLOCK });
    const b = buildStrategyPrompt({ ...ANSWERS, age: 60 }, 'DATI B');
    expect(a.system).toBe(b.system);
    expect(a.system).not.toContain('sono esaustivi');
    expect(a.system).not.toContain(BLOCK);
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
    expect(at('--- RISPOSTE DEL PERCORSO ---')).toBeLessThan(at('OBBLIGAZIONI e CASHFLOW 12 MESI sono esaustivi'));
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

  it('the data intro names OBBLIGAZIONI among the exhaustive blocks, with and without the cashflow block', () => {
    expect(buildStrategyPrompt(ANSWERS, 'DATI', { cashflowBlock: '--- CASHFLOW 12 MESI (x) ---\nX' }).userContent).toContain('MUTUI, FAMIGLIA, OBBLIGAZIONI e CASHFLOW 12 MESI sono esaustivi');
    expect(buildStrategyPrompt(ANSWERS, 'DATI').userContent).toContain('MUTUI, FAMIGLIA e OBBLIGAZIONI sono esaustivi.');
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
