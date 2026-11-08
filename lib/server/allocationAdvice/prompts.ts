/**
 * The prompts of the Consulente (2026-10-20): the strategy (Opus 5.5), the instrument search
 * (Sonnet 5.5 with web search), the review (Opus 5.5) and, since 2026-11-08, the interview
 * round that precedes the strategy and a revision (Opus 5.5, `buildInterviewPrompt`). Pure
 * string builders, unit-tested; the orchestration is `run.ts`.
 *
 * Each builder returns `{ system, userContent }` like the assistant's (`prompts.ts` there):
 * `system` is byte-identical across users — the role, the rules of the data, the output
 * contract and the fenced-block schema — and everything of the user (the answers, the data
 * block of `formatBundleForPrompt`, the other agent's result) rides in `userContent`.
 *
 * The data rules are the assistant's: the figures come from the block and are never
 * recomputed; a class or an instrument the user does not have is not invented; the user's
 * answers win over the agent's taste (a home the user wants excluded stays excluded; the
 * agent may say why it would decide otherwise, in words). The strategy and the review answer as
 * a structured output, `{ markdown, proposal }` (`allocationAdviceAnswerSchema` in
 * `lib/utils/allocationAdviceProposal.ts`, 2026-10-23); the instrument search writes ONE fenced
 * block; nothing is written until the user presses «Applica».
 */

import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import type { AllocationAdviceAnswers, AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import {
  ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS,
  type AllocationAdviceInterview,
  type AllocationAdviceInterviewRound,
  type AllocationAdvicePreviousPaths,
  type AllocationAdvicePriorPlan,
} from '@/types/allocationAdvice';
import { formatQuestionAnswersForPrompt } from '@/lib/utils/questionSet';
import { describeRoundCount } from '@/lib/utils/allocationAdviceNarrative';
import { formatCashflowBlockSection, type AssistantPromptParts } from '@/lib/server/assistant/prompts';

function eur(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

const CLASS_LIST = ASSET_CLASS_SEQUENCE.map((cls) => `"${cls}" (${ASSET_CLASS_LABELS[cls] ?? cls})`).join(', ');

const LOSS_TOLERANCE_LABELS: Record<AllocationAdviceAnswers['lossTolerance'], string> = {
  bassa: "bassa: una perdita del 10% del portafoglio lo farebbe vendere o dormire male",
  media: 'media: reggerebbe un −25% senza vendere, con fatica',
  alta: 'alta: reggerebbe un −40% senza vendere e comprerebbe ancora',
};

const POLICY_LABELS: Record<AllocationAdviceAnswers['distributionPolicy'], string> = {
  accumulazione: 'ad accumulazione (reinveste i proventi)',
  distribuzione: 'a distribuzione (incassa dividendi e cedole)',
  indifferente: 'indifferente: scegli tu, motivando',
};

const ROLE_LABELS = {
  tradable: 'negoziabile (nella base dei target e nei piani)',
  frozen: 'non negoziabile (nella base dei target, mai nei piani)',
  excluded: "escluso dall'Allocazione (fuori dalla base)",
} as const;

/** The answers as the agents read them: one line per question, the user's words quoted. */
export function formatAnswersForPrompt(answers: AllocationAdviceAnswers): string {
  const lines: string[] = ['--- RISPOSTE DEL PERCORSO ---'];
  lines.push(`Età: ${answers.age !== null ? `${answers.age} anni` : 'non indicata'} | orizzonte di investimento: ${answers.horizonYears !== null ? `${answers.horizonYears} anni` : 'non indicato'}`);
  lines.push(`Tolleranza alle perdite: ${LOSS_TOLERANCE_LABELS[answers.lossTolerance]}`);
  lines.push(`Borsa di riferimento: ${answers.exchange}${answers.broker ? ` | broker: ${answers.broker}` : ''}`);
  lines.push(`Politica dei proventi preferita: ${POLICY_LABELS[answers.distributionPolicy]}`);
  lines.push(`Ruolo della casa in cui vive: ${ROLE_LABELS[answers.homeRole]}`);
  lines.push(`Ruolo dei fondi pensione: ${ROLE_LABELS[answers.pensionRole]}`);
  lines.push(`Ruolo del private equity e degli illiquidi: ${ROLE_LABELS[answers.privateEquityRole]}`);
  lines.push('');
  lines.push(`Obiettivi confermati o aggiunti dall'utente (${answers.goals.length}):`);
  if (answers.goals.length === 0) lines.push('- nessuno');
  for (const goal of answers.goals) {
    const parts = [
      goal.goalId ? `esistente (id ${goal.goalId})` : 'NUOVO',
      goal.keep ? 'da tenere' : 'DA ELIMINARE: non rispecchia più la realtà',
      goal.targetAmount !== null ? `target ${eur(goal.targetAmount)}` : 'senza importo target',
      goal.targetDateIso ? `scadenza ${goal.targetDateIso}` : 'senza scadenza',
      `priorità ${goal.priority}`,
    ];
    lines.push(`- ${goal.name}: ${parts.join(' | ')}${goal.note ? ` | nota: «${goal.note}»` : ''}`);
  }
  lines.push(answers.goalsReflectReality ? 'L\'utente dice che gli obiettivi rispecchiano la realtà.' : "L'utente dice che gli obiettivi NON rispecchiano del tutto la realtà.");
  if (answers.newGoalsNote.trim()) lines.push(`Cosa manca, nelle sue parole: «${answers.newGoalsNote.trim()}»`);
  lines.push('');
  lines.push(`Strumenti da tenere comunque: ${answers.keepAssets.length > 0 ? answers.keepAssets.join('; ') : 'nessun vincolo'}`);
  lines.push(`Da evitare: ${answers.avoid.trim() || 'niente di dichiarato'}`);
  lines.push(`Preferenza ESG: ${answers.esg ? 'sì' : 'no'}`);
  if (answers.notes.trim()) lines.push(`Altre note: «${answers.notes.trim()}»`);
  lines.push('');
  return lines.join('\n');
}

// ─── Shared core ──────────────────────────────────────────────────────────────

/**
 * The interview's rounds as the strategy, the review and the revision read them (2026-11-08,
 * decision 53): nothing for null or an interview with no round that was not skipped; the one
 * sentence «L'utente ha saltato il colloquio.» for a skip with zero rounds; otherwise the header
 * with the round count, the reading rule and the rounds, closed by the skip's sentence when the
 * user left after some rounds.
 */
export function formatInterviewForPrompt(interview: AllocationAdviceInterview | null): string {
  if (!interview) return '';
  const count = interview.rounds.length;
  if (count === 0) return interview.skipped ? "L'utente ha saltato il colloquio." : '';
  return [
    `--- IL COLLOQUIO (${describeRoundCount(count)}) ---`,
    'Risposte al colloquio: «Preferisco non dire» è una scelta dell\'utente, da rispettare senza dedurne nulla; «non risposta» vuol dire che ha saltato il colloquio prima di rispondere.',
    formatQuestionAnswersForPrompt(interview.rounds, 'Tornata'),
    ...(interview.skipped ? [`L'utente ha saltato il colloquio dopo ${describeRoundCount(count)}.`] : []),
  ].join('\n');
}

/** The block as the strategy and the review print it, right after the answers; `''` prints nothing. */
function interviewLines(interview: AllocationAdviceInterview | null | undefined, closing?: string): string[] {
  const block = formatInterviewForPrompt(interview ?? null);
  if (block === '') return [];
  const closes = closing !== undefined && (interview?.rounds.length ?? 0) > 0;
  return [block, ...(closes ? [closing] : []), ''];
}

const CONSULENTE_CORE = [
  '# Ruolo',
  "Sei il Consulente di Net Worth Tracker: aiuti un investitore italiano self-directed a impostare l'allocazione del suo portafoglio. Non sei un consulente finanziario regolamentato e non dai raccomandazioni vincolanti: ragioni sui SUOI dati, spieghi i compromessi, proponi, e la decisione resta sua.",
  'Rispondi sempre in italiano. Valute in formato italiano (es. €1.234), percentuali con la virgola.',
  '',
  '# Regole sui dati (non negoziabili)',
  '- Usa esclusivamente i numeri del blocco dati: non ricalcolarli e non inventarne.',
  "- Le risposte dell'utente vincono sulle tue preferenze: il ruolo che ha scelto per casa, fondi pensione e illiquidi va rispettato nella proposta; se lo giudichi sbagliato, dillo nel testo con il perché, ma la proposta segue la sua scelta.",
  "- Le classi di attivo sono solo queste, con queste chiavi: " + CLASS_LIST + '. Non inventarne altre.',
  "- Un'allocazione è un piano per i prossimi anni, non una previsione: motiva ogni classe con orizzonte, tolleranza alle perdite e obiettivi di QUESTO investitore, mai con massime generali.",
  "- Nulla viene scritto nell'app da te: la scrittura avviene solo se l'utente preme «Applica» sulla proposta.",
  '',
].join('\n');

// ─── 1. Strategy (Opus 5.5) ───────────────────────────────────────────────────

const PROPOSAL_SCHEMA_TEXT = [
  '{',
  '  "summary": string (2-3 frasi: la proposta in breve),',
  '  "classes": [ { "assetClass": chiave di classe, "targetPercentage": number (della base; 0 se "fixedAmount" è presente), "fixedAmount"?: number (solo "cash": riserva fissa in euro), "rationale": string, "subTargets": [ { "name": string, "targetPercentage": number (della classe; i sotto-target di una classe sommano a 100, oppure lista vuota), "instrument"?: string, "rationale"?: string } ] } ],',
  '  "assetRoles": [ { "assetName": nome ESATTO di uno strumento del blocco STRUMENTI, "role": "tradable" | "frozen" | "excluded", "reason": string } ],',
  '  "goals": [ { "goalId"?: id di un obiettivo esistente, "name": string, "targetAmount"?: number, "targetDateIso"?: "YYYY-MM-DD", "priority": "alta" | "media" | "bassa", "monthlyContribution"?: number, "recommendedAllocation"?: [ { "assetClass": chiave di classe, "percentage": number } ] (le percentuali sommano a 100; nel blocco di una proposta già scritta la stessa allocazione compare come oggetto { chiave di classe: number }), "assignments": [ { "assetName": nome ESATTO di uno strumento posseduto, "percentage": number (quota dello strumento, 0-100) } ], "rationale": string } ],',
  '  "reviewByIso": "YYYY-MM-DD",',
  '  "reviewReason": string,',
  '  "risks": [ string ]',
  '}',
].join('\n');

const STRATEGY_CONTRACT = [
  '# Cosa devi produrre',
  "La risposta è UN oggetto JSON con due campi, `markdown` e `proposal`. In `markdown` l'analisi per l'utente, con queste sezioni:",
  '1. **La situazione** — cosa vedi nel portafoglio di oggi e nel cashflow (entrate e loro concentrazione, spesa, capacità di risparmio) rispetto a orizzonte, tolleranza e obiettivi (2-4 frasi).',
  "2. **L'allocazione proposta** — ogni classe con la percentuale e il perché; per ogni classe i sotto-target (nome e % della classe); la liquidità come percentuale o come riserva fissa in euro, dicendo quale e perché.",
  '3. **Casa, fondi pensione e illiquidi** — il ruolo scelto dall\'utente e il tuo giudizio su di esso.',
  '4. **Obiettivi** — per ogni obiettivo tenuto o nuovo: a quali strumenti POSSEDUTI legarlo e con quale quota (percentuale dello strumento), coerente con la sua scadenza e priorità; le quote dello stesso strumento su più obiettivi non superano il 100%; un obiettivo che l\'utente ha segnato da eliminare non compare.',
  '5. **Cosa cambia rispetto a oggi** — le differenze principali con i target attuali e con le classi attuali, in punti percentuali.',
  '6. **Rischi e revisione** — i rischi del piano e quando rivederlo (una data, motivata: di norma fra 1 e 3 anni, o prima se un obiettivo scade).',
  '',
  "Se i dati contengono il blocco IL PIANO IN VIGORE E IL PERCHÉ, è il piano che l'utente segue oggi e le ragioni di allora: non ripartire da zero. Tieni ciò che regge ancora, cambia ciò che i dati nuovi o le risposte nuove contraddicono, e aggiungi la sezione **Rispetto al piano precedente** (fra «Cosa cambia rispetto a oggi» e «Rischi e revisione») che dice cosa confermi, cosa cambi e perché, richieste di modifica di allora comprese.",
  '',
  'In `proposal` la proposta strutturata, con questi campi:',
  PROPOSAL_SCHEMA_TEXT,
  'Vincoli: le "targetPercentage" delle classi senza "fixedAmount" sommano esattamente a 100; ogni classe compare una volta; i nomi in "assetName" sono copiati ESATTAMENTE dal blocco STRUMENTI; "assetRoles" contiene solo gli strumenti il cui ruolo deve CAMBIARE o che l\'utente ha nominato (casa, fondi pensione, illiquidi), non tutti; un sotto-target che corrisponde a uno strumento già posseduto lo nomina in "instrument". Il nome di un sotto-target è la SOTTOCATEGORIA che gli strumenti posseduti portano già nel blocco STRUMENTI (es. «All World», «Bond Singoli»): un sotto-target con un nome nuovo resta vuoto finché l\'utente non riclassifica lo strumento a mano — se lo proponi, dillo nel testo.',
  // The goals' contributions and the cash reserve rest on the cashflow block (owner, 2026-11-01).
  'I "monthlyContribution" degli obiettivi stanno dentro la mediana del risparmio mensile del blocco CASHFLOW 12 MESI (se la superano, dillo e perché); la riserva di liquidità si misura sulla spesa mensile mediana e sui conti liquidi del blocco.',
  // The bonds by horizon (owner, 2026-11-08, after AI-04's phase F): the block OBBLIGAZIONI is the data, the goals' dates the horizons.
  "Nella classe Obbligazioni ogni sotto-target dice nel testo quale orizzonte copre (es. 1-3 anni, 3-7 anni) e quale obiettivo serve, a partire dalle scadenze degli obiettivi e dal blocco OBBLIGAZIONI (le scadenze dei titoli, le duration degli ETF): se l'orizzonte di un obiettivo resta scoperto, proponi il sotto-target che lo copre e di' che resta vuoto finché l'utente non ci mette uno strumento; se le scadenze possedute sono già allineate, dillo in una riga.",
  // The previous paths (owner, 2026-11-08): what changed since then, and whether the facts or the words moved it.
  "Se ci sono PERCORSI PRECEDENTI, «La situazione» dice cosa è cambiato rispetto ad allora — tolleranza, orizzonte, obiettivi, strumenti da tenere — e se il cambiamento nasce dai fatti (reddito, patrimonio, famiglia, obiettivi) o dalle parole dell'utente: se nelle sue parole, di allora o di oggi, leggi paura, fretta o euforia, nominale citando la frase che te lo fa pensare, senza giudicare; un piano che cambia direzione per emozione lo dice e propone il passo più piccolo che la rispetta.",
].join('\n');

/** The last report and its requests, as the strategy reads them (2026-10-20). */
export function formatPriorPlanForPrompt(plan: AllocationAdvicePriorPlan): string {
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const header = [
    `il report del percorso precedente, del ${iso(plan.finishedAt)}`,
    plan.appliedAt ? `applicato alle impostazioni il ${iso(plan.appliedAt)}` : 'mai applicato alle impostazioni',
    plan.reviewByIso ? `da rivedere entro il ${plan.reviewByIso}${plan.reviewReason ? `: ${plan.reviewReason}` : ''}` : null,
  ].filter((part): part is string => part !== null).join('; ');
  return [
    `--- IL PIANO IN VIGORE E IL PERCHÉ (${header}) ---`,
    plan.reportMarkdown,
    '',
    plan.revisions.length > 0
      ? `Richieste di modifica fatte allora sul report, in ordine: ${plan.revisions.map((request, index) => `${index + 1}. ${request}`).join(' ')}`
      : 'Nessuna richiesta di modifica fu fatta su quel report.',
  ].join('\n');
}

/** The data intro of a run WITH the cashflow block, shared by the strategy and the interview so they never drift (2026-11-08). */
const DATA_INTRO =
  "Di seguito i dati dell'intero portafoglio, estratti in modo affidabile dal sistema. I blocchi STRUMENTI, ALLOCAZIONE OGGI, ALLOCAZIONE TARGET vs ATTUALE, REGISTRO OPERAZIONI, DIVIDENDI, PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI e CASHFLOW 12 MESI sono esaustivi. Il blocco CASHFLOW del periodo copre solo l'anno in corso: per entrate, spesa e risparmio usa il blocco CASHFLOW 12 MESI.";
const DATA_INTRO_WITHOUT_CASHFLOW =
  "Di seguito i dati dell'intero portafoglio, estratti in modo affidabile dal sistema. I blocchi STRUMENTI, ALLOCAZIONE OGGI, ALLOCAZIONE TARGET vs ATTUALE, REGISTRO OPERAZIONI, DIVIDENDI, PREVIDENZA, MUTUI, FAMIGLIA e OBBLIGAZIONI sono esaustivi.";

/** One path's answers in a line: what the comparison with today needs, the rest stays in the archive. */
function formatPathAnswersLine(answers: AllocationAdviceAnswers): string {
  return [
    `età ${answers.age !== null ? `${answers.age} anni` : 'non indicata'}`,
    `orizzonte ${answers.horizonYears !== null ? `${answers.horizonYears} anni` : 'non indicato'}`,
    `tolleranza ${LOSS_TOLERANCE_LABELS[answers.lossTolerance]}`,
    `proventi ${POLICY_LABELS[answers.distributionPolicy]}`,
    `ESG ${answers.esg ? 'sì' : 'no'}`,
    `da tenere: ${answers.keepAssets.length > 0 ? answers.keepAssets.join('; ') : 'nessun vincolo'}`,
    `da evitare: ${answers.avoid.trim() || 'niente'}`,
  ].join(' | ');
}

/**
 * The paths before this one, as the interview and the strategy read them (2026-11-08): per path,
 * its dates, the answers of then in two lines, the user's own words (what was missing, the notes,
 * the goals' notes), the interview of then with its answers, the requests for changes, and the
 * proposal in one line. The most recent first; the plan in force is the first one's report. Empty
 * string when there is no path and the archive was read.
 */
export function formatPreviousPathsForPrompt(previous: AllocationAdvicePreviousPaths | null | undefined): string {
  if (!previous) return '';
  const { paths, archiveRead } = previous;
  if (paths.length === 0 && archiveRead) return '';
  const iso = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
  if (paths.length === 0) return ['--- I PERCORSI PRECEDENTI ---', "L'archivio dei percorsi non è stato letto in questa corsa: non so se ce ne sono."].join('\n');
  const lines: string[] = [`--- I PERCORSI PRECEDENTI (${paths.length === 1 ? '1 percorso' : `${paths.length} percorsi`}, dal più recente; il report del primo è il piano in vigore) ---`];
  if (!archiveRead) lines.push("L'archivio dei percorsi non è stato letto in questa corsa: qui c'è solo l'ultimo.");
  paths.forEach((path, index) => {
    const proposal = path.report?.proposal ?? path.strategy?.proposal ?? null;
    const header = [
      path.report ? `report del ${iso(path.report.finishedAt)}` : 'nessun report',
      path.applied ? `applicato il ${iso(path.applied.at)}` : 'mai applicato',
      proposal?.reviewByIso ? `revisione consigliata entro il ${proposal.reviewByIso}` : null,
    ].filter((part): part is string => part !== null).join('; ');
    if (index > 0) lines.push('');
    lines.push(`## Percorso del ${iso(path.createdAt)} (${header})`);
    lines.push(`Risposte di allora: ${formatPathAnswersLine(path.answers)}`);
    const goals = path.answers.goals;
    lines.push(
      `Obiettivi di allora (${goals.length}): ${
        goals.length > 0
          ? goals
              .map((goal) => `${goal.name} (${[goal.keep ? null : 'da eliminare', goal.targetAmount !== null ? `target ${eur(goal.targetAmount)}` : 'senza importo', goal.targetDateIso ? `scadenza ${goal.targetDateIso}` : 'senza scadenza', `priorità ${goal.priority}`].filter(Boolean).join(', ')})${goal.note ? ` — «${goal.note}»` : ''}`)
              .join(' · ')
          : 'nessuno'
      }`
    );
    const words = [
      path.answers.goalsReflectReality ? null : 'gli obiettivi NON rispecchiavano del tutto la realtà',
      path.answers.newGoalsNote.trim() ? `cosa mancava: «${path.answers.newGoalsNote.trim()}»` : null,
      path.answers.notes.trim() ? `note: «${path.answers.notes.trim()}»` : null,
    ].filter((part): part is string => part !== null);
    if (words.length > 0) lines.push(`Nelle sue parole: ${words.join(' | ')}`);
    const rounds = path.interview?.rounds ?? [];
    if (rounds.length > 0) {
      lines.push(`Colloquio di allora (${describeRoundCount(rounds.length)}):`);
      lines.push(formatQuestionAnswersForPrompt(rounds, 'Tornata'));
    } else if (path.interview?.skipped) {
      lines.push('Colloquio di allora: saltato.');
    }
    const revisions = path.revisions ?? [];
    if (revisions.length > 0) lines.push(`Modifiche chieste allora sul report: ${revisions.map((row, i) => `${i + 1}. ${row.request}`).join(' ')}`);
    const revisionRounds = path.revisionInterview?.rounds ?? [];
    if (revisionRounds.length > 0) lines.push(formatQuestionAnswersForPrompt(revisionRounds, 'Tornata della revisione'));
    if (proposal) {
      lines.push(`Proposta di allora: ${proposal.summary} — ${proposal.classes.map((cls) => `${ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass} ${cls.targetPercentage}%`).join(' · ')}`);
    } else {
      lines.push(`Proposta di allora: nessuna (percorso ${path.status === 'failed' ? 'fallito' : 'interrotto'} alla fase ${path.stage ?? 'iniziale'})`);
    }
  });
  return lines.join('\n');
}

/**
 * The strategy's user turn: the answers, the interview (2026-11-08), the portfolio's data, the
 * CASHFLOW 12 MESI block (2026-11), the plan in force and the previous paths (2026-11-08), in
 * this order. `system` is the same for every user, with or without the blocks.
 */
export function buildStrategyPrompt(
  answers: AllocationAdviceAnswers,
  dataBlock: string,
  opts: { priorPlan?: AllocationAdvicePriorPlan | null; cashflowBlock?: string; interview?: AllocationAdviceInterview | null; previousPaths?: AllocationAdvicePreviousPaths | null } = {}
): AssistantPromptParts {
  const { priorPlan = null, cashflowBlock, interview = null, previousPaths = null } = opts;
  const previousBlock = formatPreviousPathsForPrompt(previousPaths);
  const userContent = [
    formatAnswersForPrompt(answers),
    ...interviewLines(interview, 'Tieni conto di queste risposte nella sezione «La situazione».'),
    cashflowBlock ? DATA_INTRO : DATA_INTRO_WITHOUT_CASHFLOW,
    '',
    dataBlock,
    // Under the note every surface carries (owner, 2026-11-07); the blank lines are this prompt's own.
    ...(cashflowBlock ? ['', ...formatCashflowBlockSection(cashflowBlock).slice(0, 2)] : []),
    ...(priorPlan ? ['', formatPriorPlanForPrompt(priorPlan)] : []),
    ...(previousBlock ? ['', previousBlock, ''] : []),
    "Proponi l'allocazione ottimale per questo investitore, come descritto nel contratto di risposta.",
  ].join('\n');
  return { system: `${CONSULENTE_CORE}\n${STRATEGY_CONTRACT}`, userContent };
}

// ─── 0. The interview (Opus 5.5, 2026-11-08) ─────────────────────────────────
// The critical friend before the strategy (doc/ai/AI-04-colloquio.md): up to three rounds of
// 0–4 questions, each born from a figure or an answer; the same stage asks ONE round about a
// written «Chiedi una modifica». No advice, no proposal: the contract overrides the core's
// «proponi» for this stage. The caps are written here and the round number in the user turn
// (the silent-cap rule).

export const INTERVIEW_CONTRACT = [
  '# In questa fase',
  'In questa fase non proponi né consigli: chiedi.',
  "Hai davanti le risposte del percorso e i dati dell'intero portafoglio e del cashflow. Fai da amico critico: chiedi SOLO ciò che i dati o le risposte rendono dubbio e che cambierebbe la strategia. Esempi del genere di dubbio: un reddito concentrato su una sola fonte con un orizzonte lungo e una tolleranza alle perdite alta; un obiettivo entro pochi anni con molte azioni; una riserva di emergenza che i conti liquidi non coprono; una rata di prestito accanto a «niente da evitare».",
  'Non chiedere ciò che le risposte dicono già. Non dare consigli, non proporre allocazioni, non giudicare il mercato.',
  "Le obbligazioni: se il blocco OBBLIGAZIONI elenca titoli o ETF, o la classe dovrà avere peso nel piano, chiedi a cosa servono (quale obiettivo, quale orizzonte), se l'utente preferisce titoli singoli, ETF o entrambi, e quali scadenze vuole coprire — nel `why` le scadenze e le duration che il blocco riporta.",
  '',
  '# Cosa devi produrre',
  "La risposta è UN oggetto JSON con tre campi, in quest'ordine: `note`, `satisfied`, `questions`.",
  '- `note`: 1-2 frasi, scritte PRIMA delle domande: cosa vedi nei dati e nelle risposte.',
  '- `satisfied`: true quando nessun dubbio resta aperto; allora `questions` può essere vuota.',
  "- `questions`: da 0 a 4 domande; quelle oltre la quarta vengono scartate. Ognuna ha `id` (breve, unico nella tornata), `kind` (\"single\" se la risposta è una, \"multiple\" se possono essere più), `text` (la domanda, in seconda persona), `why` (una riga: il numero o la risposta che l'ha fatta nascere, citato — es. «la tua unica fonte di reddito copre l'86% delle entrate»), `options` (da 2 a 4 opzioni concrete, con i numeri quando i dati li danno: `value` breve e unico nella domanda, `label` leggibile; una domanda con meno di 2 opzioni viene scartata) e `allowOther`: sempre true.",
  "- Non mettere fra le opzioni «Altro» né «Preferisco non dire»: l'app li aggiunge a ogni domanda. «Preferisco non dire» è una scelta dell'utente da rispettare.",
  "- Le tornate sono al massimo tre e il numero della tornata è scritto alla fine dei dati. Dopo la terza non ce n'è una quarta: se qualcosa resta aperto, dillo nella `note`.",
  // The previous paths (owner, 2026-11-08): a change since then is a question; an emotion in the words is said, not judged.
  "- Se ci sono PERCORSI PRECEDENTI, confronta le risposte di oggi con quelle di allora — tolleranza, orizzonte, obiettivi, strumenti da tenere: un cambiamento che i dati non spiegano è una domanda, e nel `why` citi la risposta di allora e quella di oggi. Se nelle parole dell'utente, di allora o di oggi, leggi paura, fretta o euforia, dillo nella `note` con la frase che te lo fa pensare, senza giudicare, e chiedi se è il momento giusto per cambiare piano.",
].join('\n');

/**
 * One round's user turn: the answers, the strategy's data intro and block, the cashflow block
 * under its note, the plan in force and the previous paths (a new path only, 2026-11-08), the
 * previous rounds, and either the round number («Questa è la tornata N di 3.») or the revision's
 * report and requests. Everything of the user rides here; `system` is byte-identical across
 * users, rounds and the revision option.
 */
export function buildInterviewPrompt(
  answers: AllocationAdviceAnswers,
  dataBlock: string,
  opts: {
    cashflowBlock: string;
    priorPlan: AllocationAdvicePriorPlan | null;
    previousRounds: AllocationAdviceInterviewRound[];
    roundNumber: number;
    revision?: { requests: string; report: string } | null;
    previousPaths?: AllocationAdvicePreviousPaths | null;
  }
): AssistantPromptParts {
  const { cashflowBlock, priorPlan, previousRounds, roundNumber, revision = null, previousPaths = null } = opts;
  const previousBlock = formatPreviousPathsForPrompt(previousPaths);
  const userContent = [
    formatAnswersForPrompt(answers),
    DATA_INTRO,
    '',
    dataBlock,
    '',
    ...formatCashflowBlockSection(cashflowBlock).slice(0, 2),
    ...(priorPlan ? ['', formatPriorPlanForPrompt(priorPlan)] : []),
    ...(previousBlock ? ['', previousBlock] : []),
    ...(previousRounds.length > 0 ? ['', '--- LE TORNATE PRECEDENTI ---', formatQuestionAnswersForPrompt(previousRounds, 'Tornata')] : []),
    '',
    ...(revision
      ? [
          '--- IL REPORT DA RIVEDERE ---',
          revision.report,
          '',
          "--- LE RICHIESTE DELL'UTENTE, in ordine (l'ultima è quella nuova) ---",
          revision.requests,
          '',
          "Questa tornata riguarda SOLO l'ultima richiesta di modifica: chiedi cosa intende, cosa accetta di cedere e cosa non va toccato, se i dati o il report lo rendono dubbio. È l'unica tornata: non ce ne sarà un'altra.",
        ]
      : [
          `Questa è la tornata ${roundNumber} di ${ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS}.${roundNumber === ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS ? " È l'ultima: non ci sarà una quarta tornata." : ''}`,
        ]),
    'Leggi risposte e dati e scrivi la tornata come descritto nel contratto.',
  ].join('\n');
  return { system: `${CONSULENTE_CORE}\n${INTERVIEW_CONTRACT}`, userContent };
}

// ─── 2. Instruments (Sonnet 5.5 + web search) ────────────────────────────────

const CANDIDATES_SCHEMA_TEXT = [
  '```instrument-candidates',
  '{ "sleeves": [ { "assetClass": chiave di classe, "subTarget": nome del sotto-target, "candidates": [ { "name": string, "isin"?: string, "ticker"?: string, "exchange": string, "policy"?: "accumulazione" | "distribuzione", "ter"?: number (percento annuo, es. 0.2), "duration"?: number (anni: la duration effettiva di un ETF obbligazionario, verificata), "domicile"?: string, "alreadyHeld"?: boolean, "note": string, "source"?: string (URL o fonte) } ], "caveat"?: string } ] }',
  '```',
].join('\n');

const INSTRUMENTS_CONTRACT = [
  '# Cosa devi fare',
  "Per OGNI sotto-target della proposta trova da 1 a 3 strumenti (ETF/ETC UCITS, o titoli di Stato quando il sotto-target lo richiede) negoziabili sulla borsa indicata dall'utente, con la politica dei proventi che preferisce. Usa la ricerca web per verificare: quotazione sulla borsa indicata, ISIN, ticker, TER, domicilio. Cita la fonte di ogni verifica.",
  "Se l'utente possiede già uno strumento adatto a un sotto-target, è il primo candidato e lo segni «alreadyHeld»: cambiare strumento ha un costo fiscale.",
  'Non inventare ISIN o ticker: un dato che non riesci a verificare lo ometti e lo dici in "caveat". Non dare giudizi di mercato né previsioni.',
  "Una ricerca per strumento, non per sotto-target: le ricerche sono limitate, quindi verifica prima gli strumenti che l'utente NON possiede ancora e per quelli già posseduti conferma solo quotazione e ISIN. Parla all'utente in seconda persona («lo possiedi già»), mai in prima.",
  "Per un sotto-target obbligazionario verifica anche la duration effettiva (o la scadenza media) di ogni ETF e scrivila in \"duration\" (anni): il blocco OBBLIGAZIONI dei dati riporta le duration di Yahoo per gli strumenti posseduti, da confermare, e il testo della strategia dice quale orizzonte il sotto-target deve coprire — un candidato la cui duration non lo copre non è un candidato.",
  '',
  'Scrivi prima una breve nota in markdown (una riga per sotto-target: cosa hai trovato e cosa non hai potuto verificare), poi UN solo blocco di codice con linguaggio `instrument-candidates` con SOLO JSON valido, con questo schema:',
  CANDIDATES_SCHEMA_TEXT,
].join('\n');

export function buildInstrumentsPrompt(answers: AllocationAdviceAnswers, proposal: AllocationAdviceProposal, holdingsBlock: string): AssistantPromptParts {
  const sleeves: string[] = ['--- SOTTO-TARGET DA COPRIRE ---'];
  for (const cls of proposal.classes) {
    const label = ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass;
    if (cls.subTargets.length === 0) {
      sleeves.push(`${cls.assetClass} (${label}): nessun sotto-target, cerca 1-3 strumenti per l'intera classe con sotto-target "${label}"`);
      continue;
    }
    for (const sub of cls.subTargets) {
      sleeves.push(`${cls.assetClass} (${label}) › ${sub.name}: ${sub.targetPercentage}% della classe${sub.instrument ? ` | strumento indicato dalla strategia: ${sub.instrument}` : ''}`);
    }
  }
  const userContent = [
    `Borsa di riferimento: ${answers.exchange}${answers.broker ? ` (broker ${answers.broker})` : ''}. Politica dei proventi: ${POLICY_LABELS[answers.distributionPolicy]}. ESG: ${answers.esg ? 'preferiti' : 'nessuna preferenza'}.`,
    answers.avoid.trim() ? `Da evitare: ${answers.avoid.trim()}` : '',
    '',
    sleeves.join('\n'),
    '',
    holdingsBlock,
    'Trova gli strumenti per ogni sotto-target, come descritto.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
  return { system: `${CONSULENTE_CORE}\n${INSTRUMENTS_CONTRACT}`, userContent };
}

// ─── 3. Review (Opus 5.5) ─────────────────────────────────────────────────────

const REVIEW_CONTRACT = [
  '# Cosa devi produrre',
  "La risposta è UN oggetto JSON con due campi, `markdown` e `proposal`. In `markdown` il report finale per l'utente, che unisce la strategia e gli strumenti trovati. Sezioni, in quest'ordine:",
  "1. **In una frase** — il verdetto sull'allocazione proposta rispetto a quella di oggi.",
  "2. **L'allocazione proposta** — ogni classe con percentuale e perché; i sotto-target sotto ogni classe.",
  "3. **Gli strumenti** — per ogni sotto-target lo strumento consigliato (ISIN e borsa), perché lui, e se è già in portafoglio; per gli obbligazionari la duration e l'orizzonte (l'obiettivo) che coprono; se la ricerca non ha verificato qualcosa, dillo.",
  '4. **Gli obiettivi** — ogni obiettivo con gli strumenti legati e le quote.',
  '5. **Casa, fondi pensione e illiquidi** — il ruolo e il giudizio.',
  '6. **Cosa fare adesso** — i passi concreti, in ordine, con i costi fiscali di un eventuale cambio di strumento.',
  '7. **Rischi e revisione** — e la data entro cui rivedere il piano.',
  '',
  'In `proposal` la proposta con gli stessi campi della strategia (il suo blocco `allocation-proposal` nei dati qui sotto), rivista alla luce degli strumenti: in ogni sotto-target "instrument" nomina lo strumento scelto (nome e ISIN); le percentuali, i ruoli, gli obiettivi e la data di revisione restano coerenti con il testo. Se non cambi nulla della strategia, ricopia la sua proposta.',
  PROPOSAL_SCHEMA_TEXT,
].join('\n');

/** The revision's addendum: the same report, rewritten on the user's request, the request judged aloud. */
const REVISION_CONTRACT = [
  '',
  '# La revisione su richiesta',
  "L'utente ha letto il report e chiede una modifica. Riscrivi il report INTERO con le stesse sette sezioni, applicando la richiesta dove è sensata e coerente con i dati e con le risposte del percorso; dove non lo è, o ha un costo (fiscale, di rischio, per gli obiettivi), dillo apertamente in una sezione in più, «La tua richiesta», subito dopo «In una frase». Le richieste precedenti restano applicate, salvo contrasto con l'ultima. La `proposal` riflette il report rivisto.",
].join('\n');

/**
 * «Chiedi una modifica» (2026-10-20): the review run again on the same strategy and
 * instruments, with the previous report and every request so far, the new one last.
 */
export function buildRevisionPrompt(
  answers: AllocationAdviceAnswers,
  strategyMarkdown: string,
  instrumentsMarkdown: string,
  candidates: InstrumentCandidates | null,
  previousReport: string,
  requests: readonly string[],
  opts: { interview?: AllocationAdviceInterview | null } = {}
): AssistantPromptParts {
  // The REVISION's round (asked on the written request, 2026-11-08), never the path's: that one
  // reached the revision through the strategy and the previous report it already carries.
  const round = opts.interview ?? null;
  const userContent = [
    formatAnswersForPrompt(answers),
    '--- STRATEGIA PROPOSTA (primo agente) ---',
    strategyMarkdown,
    '',
    '--- STRUMENTI TROVATI (secondo agente, con ricerca web) ---',
    instrumentsMarkdown,
    candidates ? '' : 'NOTA: il secondo agente non ha prodotto un blocco strutturato valido; usa solo il suo testo.',
    '',
    '--- IL REPORT PRECEDENTE (da rivedere) ---',
    previousReport,
    '',
    "--- LE RICHIESTE DELL'UTENTE, in ordine (l'ultima è quella nuova) ---",
    ...requests.map((request, index) => `${index + 1}. ${request}`),
    '',
    ...(round && round.rounds.length > 0
      ? [
          "Prima di questa revisione il Consulente ha fatto una tornata di domande sull'ultima richiesta:",
          formatInterviewForPrompt(round),
          "Applica l'ultima richiesta alla luce di queste risposte.",
          '',
        ]
      : []),
    "Riscrivi il report intero applicando l'ultima richiesta, come descritto.",
  ].join('\n');
  return { system: `${CONSULENTE_CORE}\n${REVIEW_CONTRACT}${REVISION_CONTRACT}`, userContent };
}

export function buildReviewPrompt(
  answers: AllocationAdviceAnswers,
  strategyMarkdown: string,
  instrumentsMarkdown: string,
  candidates: InstrumentCandidates | null,
  opts: { interview?: AllocationAdviceInterview | null } = {}
): AssistantPromptParts {
  const userContent = [
    formatAnswersForPrompt(answers),
    ...interviewLines(opts.interview),
    '--- STRATEGIA PROPOSTA (primo agente) ---',
    strategyMarkdown,
    '',
    '--- STRUMENTI TROVATI (secondo agente, con ricerca web) ---',
    instrumentsMarkdown,
    candidates ? '' : 'NOTA: il secondo agente non ha prodotto un blocco strutturato valido; usa solo il suo testo.',
    '',
    'Scrivi il report finale come descritto.',
  ].join('\n');
  return { system: `${CONSULENTE_CORE}\n${REVIEW_CONTRACT}`, userContent };
}
