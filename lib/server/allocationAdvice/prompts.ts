/**
 * The three prompts of the Consulente (2026-10-20): the strategy (Opus 5.5), the instrument
 * search (Sonnet 5.5 with web search), the review (Opus 5.5). Pure string builders, unit-tested;
 * the orchestration is `run.ts`.
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
import type { AllocationAdvicePriorPlan } from '@/types/allocationAdvice';
import type { AssistantPromptParts } from '@/lib/server/assistant/prompts';

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
  '1. **La situazione** — cosa vedi nel portafoglio di oggi rispetto a orizzonte, tolleranza e obiettivi (2-4 frasi).',
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

export function buildStrategyPrompt(answers: AllocationAdviceAnswers, dataBlock: string, priorPlan: AllocationAdvicePriorPlan | null = null): AssistantPromptParts {
  const userContent = [
    formatAnswersForPrompt(answers),
    "Di seguito i dati dell'intero portafoglio, estratti in modo affidabile dal sistema. I blocchi STRUMENTI, ALLOCAZIONE OGGI, ALLOCAZIONE TARGET vs ATTUALE, REGISTRO OPERAZIONI, DIVIDENDI, PREVIDENZA, MUTUI e FAMIGLIA sono esaustivi.",
    '',
    dataBlock,
    ...(priorPlan ? ['', formatPriorPlanForPrompt(priorPlan)] : []),
    "Proponi l'allocazione ottimale per questo investitore, come descritto nel contratto di risposta.",
  ].join('\n');
  return { system: `${CONSULENTE_CORE}\n${STRATEGY_CONTRACT}`, userContent };
}

// ─── 2. Instruments (Sonnet 5.5 + web search) ────────────────────────────────

const CANDIDATES_SCHEMA_TEXT = [
  '```instrument-candidates',
  '{ "sleeves": [ { "assetClass": chiave di classe, "subTarget": nome del sotto-target, "candidates": [ { "name": string, "isin"?: string, "ticker"?: string, "exchange": string, "policy"?: "accumulazione" | "distribuzione", "ter"?: number (percento annuo, es. 0.2), "domicile"?: string, "alreadyHeld"?: boolean, "note": string, "source"?: string (URL o fonte) } ], "caveat"?: string } ] }',
  '```',
].join('\n');

const INSTRUMENTS_CONTRACT = [
  '# Cosa devi fare',
  "Per OGNI sotto-target della proposta trova da 1 a 3 strumenti (ETF/ETC UCITS, o titoli di Stato quando il sotto-target lo richiede) negoziabili sulla borsa indicata dall'utente, con la politica dei proventi che preferisce. Usa la ricerca web per verificare: quotazione sulla borsa indicata, ISIN, ticker, TER, domicilio. Cita la fonte di ogni verifica.",
  "Se l'utente possiede già uno strumento adatto a un sotto-target, è il primo candidato e lo segni «alreadyHeld»: cambiare strumento ha un costo fiscale.",
  'Non inventare ISIN o ticker: un dato che non riesci a verificare lo ometti e lo dici in "caveat". Non dare giudizi di mercato né previsioni.',
  "Una ricerca per strumento, non per sotto-target: le ricerche sono limitate, quindi verifica prima gli strumenti che l'utente NON possiede ancora e per quelli già posseduti conferma solo quotazione e ISIN. Parla all'utente in seconda persona («lo possiedi già»), mai in prima.",
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
  '3. **Gli strumenti** — per ogni sotto-target lo strumento consigliato (ISIN e borsa), perché lui, e se è già in portafoglio; se la ricerca non ha verificato qualcosa, dillo.',
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
  requests: readonly string[]
): AssistantPromptParts {
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
    "Riscrivi il report intero applicando l'ultima richiesta, come descritto.",
  ].join('\n');
  return { system: `${CONSULENTE_CORE}\n${REVIEW_CONTRACT}${REVISION_CONTRACT}`, userContent };
}

export function buildReviewPrompt(
  answers: AllocationAdviceAnswers,
  strategyMarkdown: string,
  instrumentsMarkdown: string,
  candidates: InstrumentCandidates | null
): AssistantPromptParts {
  const userContent = [
    formatAnswersForPrompt(answers),
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
