/**
 * Assistant Prompt Builders
 *
 * Constructs structured prompts for each assistant mode before sending to Anthropic.
 * Separating prompt construction from streaming lets us unit-test prompts independently
 * and keep anthropicStream.ts focused on the HTTP/SSE layer.
 */

import { AssistantMonthContextBundle, AssistantPreferences } from '@/types/assistant';

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function eur(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/**
 * Serialises the numeric bundle into a readable Italian text block
 * that Claude can reference when writing the analysis.
 *
 * Design: structured prose is clearer than JSON for an LLM operating on
 * financial narrative tasks; the key/value format mimics a briefing note.
 */
function formatBundleForPrompt(bundle: AssistantMonthContextBundle): string {
  const { selector, netWorth, cashflow, allocationChanges, dataQuality } = bundle;
  const monthLabel = `${MONTH_NAMES[selector.month - 1]} ${selector.year}`;

  const lines: string[] = [];

  lines.push(`=== DATI FINANZIARI: ${monthLabel} ===`);
  lines.push('');

  // Net worth section
  lines.push('--- PATRIMONIO ---');
  lines.push(`Inizio mese: ${netWorth.start !== null ? eur(netWorth.start) : 'N/D'}`);
  lines.push(`Fine mese: ${netWorth.end !== null ? eur(netWorth.end) : 'N/D'}`);
  if (netWorth.delta !== null) {
    lines.push(`Variazione assoluta: ${eur(netWorth.delta)}`);
  }
  if (netWorth.deltaPct !== null) {
    lines.push(`Variazione %: ${pct(netWorth.deltaPct)}`);
  }
  lines.push('');

  // Cashflow section
  lines.push('--- CASHFLOW ---');
  lines.push(`Entrate (esclusi dividendi): ${eur(cashflow.totalIncome)}`);
  lines.push(`Dividendi e cedole: ${eur(cashflow.totalDividends)}`);
  lines.push(`Uscite: ${eur(cashflow.totalExpenses)}`);
  lines.push(`Flusso netto: ${eur(cashflow.netCashFlow)}`);
  lines.push(`Numero transazioni: ${cashflow.transactionCount}`);
  lines.push('');

  // Top expense categories — lets Claude cite concrete spending drivers by name
  if (bundle.topExpensesByCategory.length > 0) {
    lines.push('--- SPESE PER CATEGORIA (top 5 per importo) ---');
    for (const cat of bundle.topExpensesByCategory) {
      lines.push(`${cat.categoryName}: ${eur(cat.total)} (${cat.transactionCount} transazioni)`);
    }
    lines.push('');
  }

  // Top individual expenses — lets Claude call out specific large outlier transactions
  if (bundle.topIndividualExpenses.length > 0) {
    lines.push('--- SPESE SINGOLE PIU\' GRANDI ---');
    for (const exp of bundle.topIndividualExpenses) {
      const label = exp.notes ? `${exp.categoryName} – ${exp.notes}` : exp.categoryName;
      lines.push(`${label}: ${eur(exp.amount)}`);
    }
    lines.push('');
  }

  // Allocation changes section
  if (allocationChanges.length > 0) {
    lines.push('--- VARIAZIONI ALLOCAZIONE (top 5 per variazione assoluta) ---');
    for (const change of allocationChanges) {
      const prev = change.previousValue !== null ? eur(change.previousValue) : 'N/D';
      const curr = change.currentValue !== null ? eur(change.currentValue) : 'N/D';
      const abs = eur(change.absoluteChange);
      const pp =
        change.percentagePointsChange !== null
          ? ` (${pct(change.percentagePointsChange)} p.p.)`
          : '';
      lines.push(`${change.assetClass}: ${prev} → ${curr} | Δ ${abs}${pp}`);
    }
    lines.push('');
  }

  // Data quality notes — instructs Claude on what it can and cannot say
  if (dataQuality.notes.length > 0) {
    lines.push('--- NOTE QUALITÀ DATI ---');
    for (const note of dataQuality.notes) {
      lines.push(`• ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Builds the full system + user content sent to Claude for a month analysis.
 *
 * Output structure requested from Claude:
 * 1. "In sintesi" — 2-3 sentence summary
 * 2. "Cosa ha mosso il patrimonio" — key drivers
 * 3. "1-2 azioni o attenzioni" — practical takeaways
 *
 * Web search is only enabled when includeMacroContext is true; the prompt
 * asks Claude to use at most 2 searches if it decides to look something up.
 *
 * @param bundle - Numeric context bundle built server-side for the selected month
 * @param userPrompt - The free-text question from the user
 * @param preferences - Persisted user preferences (style, macro context, memory)
 * @returns A single combined prompt string ready to send as the user message
 */
export function buildMonthAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences
): string {
  const monthLabel = `${MONTH_NAMES[bundle.selector.month - 1]} ${bundle.selector.year}`;
  const numericBlock = formatBundleForPrompt(bundle);

  const responseStyleInstruction =
    preferences.responseStyle === 'concise'
      ? 'Rispondi in modo sintetico, con punti chiari e pochi fronzoli.'
      : preferences.responseStyle === 'deep'
        ? 'Rispondi con maggiore profondità, esplicitando ipotesi e limiti dei dati.'
        : 'Rispondi in modo equilibrato: chiaro, concreto e leggibile.';

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi integrare contesto macro (mercati, tassi, geopolitica) se rilevante per il mese. Usa al massimo 2 ricerche web.'
    : 'Non cercare informazioni macro esterne. Concentrati esclusivamente sui dati del portafoglio forniti.';

  const memoryInstruction = preferences.memoryEnabled
    ? 'Puoi riutilizzare preferenze e fatti salvati sulla situazione dell\'investitore quando sono pertinenti.'
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito di questa sessione.';

  const sections = [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano self-directed.',
    'Rispondi sempre in italiano.',
    responseStyleInstruction,
    macroInstruction,
    memoryInstruction,
    '',
    `Stai analizzando il mese di ${monthLabel}.`,
    'Di seguito trovi i dati finanziari del mese, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    // Output structure constraint: keeps the response focused and scannable
    'Struttura la risposta in tre sezioni markdown:',
    '1. **In sintesi** — 2-3 frasi sul risultato complessivo del mese',
    '2. **Cosa ha mosso il patrimonio** — i principali driver (mercato, cashflow, allocazione)',
    '3. **1-2 azioni o attenzioni** — osservazioni pratiche per l\'investitore',
    '',
    'Rispetta questi vincoli:',
    '- Massimo 450 parole',
    '- Usa markdown semplice (grassetto, elenchi puntati, niente tabelle complesse)',
    '- Non inventare numeri non presenti nel blocco dati',
    '- Se un dato è N/D, non speculare sul suo valore',
    '',
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ];

  return sections.join('\n');
}

/**
 * Builds the prompt for chat mode (no structured month context).
 * Used when mode === 'chat' to keep a single entry point in anthropicStream.ts.
 */
export function buildChatPrompt(
  prompt: string,
  preferences: AssistantPreferences,
  monthLabel?: string
): string {
  const responseStyleInstruction =
    preferences.responseStyle === 'concise'
      ? 'Rispondi in modo sintetico, con punti chiari e pochi fronzoli.'
      : preferences.responseStyle === 'deep'
        ? 'Rispondi con maggiore profondità, esplicitando ipotesi e limiti.'
        : 'Rispondi in modo equilibrato: chiaro, concreto e leggibile.';

  const monthContext = monthLabel
    ? `Il contesto mensile selezionato è ${monthLabel}.`
    : 'Non è stato selezionato un mese di riferimento specifico.';

  const memoryInstruction = preferences.memoryEnabled
    ? 'Puoi riutilizzare preferenze e fatti salvati quando sono pertinenti.'
    : 'Non fare affidamento su memoria persistente; usa solo il contesto esplicito del messaggio.';

  return [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano.',
    'Rispondi sempre in italiano.',
    responseStyleInstruction,
    'Stai rispondendo a una conversazione generale sul portafoglio dell\'utente.',
    monthContext,
    memoryInstruction,
    '',
    `Richiesta utente: ${prompt.trim()}`,
  ].join('\n');
}
