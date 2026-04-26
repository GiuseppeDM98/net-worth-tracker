/**
 * Assistant Prompt Builders
 *
 * Constructs structured prompts for each assistant mode before sending to Anthropic.
 * Separating prompt construction from streaming lets us unit-test prompts independently
 * and keep anthropicStream.ts focused on the HTTP/SSE layer.
 */

import { AssistantMemoryItem, AssistantMonthContextBundle, AssistantPreferences } from '@/types/assistant';

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

const MEMORY_CATEGORY_LABELS: Record<AssistantMemoryItem['category'], string> = {
  goal: 'Obiettivi finanziari',
  preference: 'Preferenze',
  risk: 'Profilo di rischio',
  fact: 'Fatti utili',
};

/**
 * Returns a human-readable label for the period encoded in selector.
 *   selector.quarter set    → "Q1 2025" (check before month > 0 — quarter end-month is positive)
 *   month > 0               → "Marzo 2025"
 *   month === 0             → "Anno 2025"
 *   month === -1            → "YTD 2025"
 *   month === -2            → "Storico da 2020"
 */
export function getPeriodLabel(selector: { year: number; month: number; quarter?: number }): string {
  // Must check quarter before month > 0: quarterly end-months (3,6,9,12) are positive
  if (selector.quarter !== undefined) {
    return `Q${selector.quarter} ${selector.year}`;
  }
  if (selector.month > 0) {
    return `${MONTH_NAMES[selector.month - 1]} ${selector.year}`;
  }
  if (selector.month === 0) return `Anno ${selector.year}`;
  if (selector.month === -1) return `YTD ${selector.year}`;
  if (selector.month === -2) return `Storico da ${selector.year}`;
  return `${selector.year}`;
}

/**
 * Serialises active memory items into a structured text block for the prompt.
 * Only active items are included — archived ones are excluded.
 * Returns an empty string when there are no items to inject.
 */
function formatMemoryForPrompt(items: AssistantMemoryItem[]): string {
  const active = items.filter((item) => item.status === 'active');
  if (active.length === 0) return '';

  // Group by category preserving canonical order
  const order: AssistantMemoryItem['category'][] = ['goal', 'preference', 'risk', 'fact'];
  const lines: string[] = ['--- COSA SAI GIÀ SULL\'INVESTITORE (memoria persistente) ---'];

  for (const cat of order) {
    const group = active.filter((i) => i.category === cat);
    if (group.length === 0) continue;
    lines.push(`${MEMORY_CATEGORY_LABELS[cat]}:`);
    for (const item of group) {
      lines.push(`- ${item.text}`);
    }
  }

  lines.push('Usa questi fatti per personalizzare la risposta quando sono pertinenti.');
  return lines.join('\n');
}

/**
 * Serialises the numeric bundle into a readable Italian text block
 * that Claude can reference when writing the analysis.
 *
 * Design: structured prose is clearer than JSON for an LLM operating on
 * financial narrative tasks; the key/value format mimics a briefing note.
 */
function formatBundleForPrompt(bundle: AssistantMonthContextBundle): string {
  const { selector, netWorth, cashflow, allocationChanges, dataQuality, currentSnapshot } = bundle;
  const periodLabel = getPeriodLabel(selector);

  const lines: string[] = [];

  lines.push(`=== DATI FINANZIARI: ${periodLabel} ===`);
  lines.push('');

  // Net worth section
  lines.push('--- PATRIMONIO ---');
  lines.push(`Inizio periodo: ${netWorth.start !== null ? eur(netWorth.start) : 'N/D'}`);
  lines.push(`Fine periodo: ${netWorth.end !== null ? eur(netWorth.end) : 'N/D'}`);
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

  // Full current allocation by asset class — includes all classes (e.g. real_estate, pension funds)
  // even when they have zero monthly change. Without this, Claude only sees the top-5 movers
  // and incorrectly labels stable classes (like real estate) as "unclassified" patrimony.
  const byAssetClass = currentSnapshot?.byAssetClass;
  if (byAssetClass && Object.keys(byAssetClass).length > 0) {
    const totalNetWorth = currentSnapshot?.totalNetWorth ?? 0;
    lines.push('--- ALLOCAZIONE CORRENTE (tutte le classi) ---');
    const entries = Object.entries(byAssetClass).sort((a, b) => b[1] - a[1]);
    for (const [assetClass, value] of entries) {
      const pctOfTotal =
        totalNetWorth > 0 ? ` (${pct((value / totalNetWorth) * 100)})` : '';
      lines.push(`${assetClass}: ${eur(value)}${pctOfTotal}`);
    }
    lines.push('');
  }

  // Sub-category breakdown within each asset class.
  // Only rendered when assets have subCategory metadata — otherwise omitted entirely.
  // This lets Claude cite specific sub-allocations like "Azioni USA €42.000"
  // rather than just "equity €80.000".
  const subCatAlloc = bundle.bySubCategoryAllocation;
  if (subCatAlloc && Object.keys(subCatAlloc).length > 0) {
    const totalNetWorth = currentSnapshot?.totalNetWorth ?? 0;
    lines.push('--- SOTTO-ALLOCAZIONE PER CLASSE ---');
    for (const [assetClass, subCats] of Object.entries(subCatAlloc)) {
      const sorted = Object.entries(subCats).sort((a, b) => b[1] - a[1]);
      for (const [subCat, value] of sorted) {
        const pctOfTotal = totalNetWorth > 0 ? ` (${pct((value / totalNetWorth) * 100)})` : '';
        lines.push(`  ${assetClass} › ${subCat}: ${eur(value)}${pctOfTotal}`);
      }
    }
    lines.push('');
  }

  // Top-5 movers section: shows which classes changed most this period.
  // allocationChanges is already capped at 5 by the context builder.
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

// ─── Common instruction builders ─────────────────────────────────────────────

function buildResponseStyleInstruction(style: AssistantPreferences['responseStyle']): string {
  if (style === 'concise') return 'Rispondi in modo sintetico, con punti chiari e pochi fronzoli.';
  if (style === 'deep') return 'Rispondi con maggiore profondità, esplicitando ipotesi e limiti dei dati.';
  return 'Rispondi in modo equilibrato: chiaro, concreto e leggibile.';
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

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
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): string {
  const monthLabel = getPeriodLabel(bundle.selector);
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi integrare contesto macro (mercati, tassi, geopolitica) se rilevante per il mese. Usa al massimo 2 ricerche web.'
    : 'Non cercare informazioni macro esterne. Concentrati esclusivamente sui dati del portafoglio forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito di questa sessione.';

  const sections = [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano self-directed.',
    'Rispondi sempre in italiano.',
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `Stai analizzando il mese di ${monthLabel}.`,
    'Di seguito trovi i dati finanziari del mese, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
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
 * Builds the prompt for a full-year analysis.
 *
 * Same 3-section structure as monthly, but uses annual framing.
 * When the year is still in progress (isCurrentYear encoded in dataQuality.isPartialMonth),
 * Claude is explicitly told to avoid drawing final annual conclusions.
 */
export function buildYearAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): string {
  const yearLabel = `Anno ${bundle.selector.year}`;
  const isCurrentYear = bundle.dataQuality.isPartialMonth;
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? `Puoi integrare contesto macro annuale (mercati, tassi, ciclo economico) rilevante per il ${yearLabel}. Usa al massimo 2 ricerche web.`
    : 'Non cercare informazioni macro esterne. Concentrati sui dati forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito.';

  const partialNote = isCurrentYear
    ? `IMPORTANTE: il ${yearLabel} è ancora in corso. I dati cashflow e patrimoniali sono parziali. Non trarre conclusioni definitive sull'anno — evidenzia le tendenze finora visibili.`
    : '';

  const sections = [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano self-directed.',
    'Rispondi sempre in italiano.',
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    ...(partialNote ? [partialNote, ''] : []),
    `Stai analizzando ${yearLabel}.`,
    'Di seguito trovi i dati finanziari aggregati per l\'anno, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    'Struttura la risposta in tre sezioni markdown:',
    '1. **In sintesi** — 2-3 frasi sul risultato complessivo dell\'anno',
    '2. **Cosa ha mosso il patrimonio nell\'anno** — i principali driver (mercato, cashflow, allocazione, eventi)' + (isCurrentYear ? ' — finora' : ''),
    '3. **1-2 azioni o attenzioni** — osservazioni pratiche per l\'investitore',
    '',
    'Rispetta questi vincoli:',
    '- Massimo 500 parole',
    '- Usa markdown semplice (grassetto, elenchi puntati)',
    '- Non inventare numeri non presenti nel blocco dati',
    '- Se un dato è N/D, non speculare sul suo valore',
    '',
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ];

  return sections.join('\n');
}

/**
 * Builds the prompt for a YTD (Year-to-Date) analysis.
 *
 * Covers Jan 1 of the current year to the latest available month.
 * Always partial — Claude must be told not to extrapolate to the full year.
 */
export function buildYtdAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): string {
  const yearLabel = `${bundle.selector.year}`;
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi integrare contesto macro (mercati, tassi) rilevante per l\'anno in corso. Usa al massimo 2 ricerche web.'
    : 'Non cercare informazioni macro esterne. Concentrati sui dati forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente.';

  const sections = [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano self-directed.',
    'Rispondi sempre in italiano.',
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `IMPORTANTE: stai analizzando il periodo YTD (da inizio ${yearLabel} a oggi). L\'anno è in corso — i dati sono parziali. Non trarre conclusioni finali sull\'anno.`,
    '',
    'Di seguito trovi i dati finanziari YTD, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    'Struttura la risposta in tre sezioni markdown:',
    '1. **In sintesi** — 2-3 frasi sul risultato YTD',
    '2. **Cosa ha mosso il patrimonio da inizio anno** — principali driver finora',
    '3. **1-2 azioni o attenzioni** — osservazioni pratiche',
    '',
    'Rispetta questi vincoli:',
    '- Massimo 450 parole',
    '- Usa markdown semplice',
    '- Non inventare numeri non presenti nel blocco dati',
    '- Non proiettare valori annualizzati salvo esplicita richiesta dell\'utente',
    '',
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ];

  return sections.join('\n');
}

/**
 * Builds the prompt for a total-history analysis.
 *
 * Covers from cashflowHistoryStartYear to today. Claude should focus on
 * long-term trends, cumulative cashflow, and overall patrimony evolution.
 */
export function buildHistoryAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): string {
  const startYear = bundle.selector.year;
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi citare eventi macro rilevanti nel periodo storico. Usa al massimo 2 ricerche web.'
    : 'Non cercare informazioni macro esterne. Concentrati sui dati storici forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente.';

  const sections = [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano self-directed.',
    'Rispondi sempre in italiano.',
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `Stai analizzando lo storico totale del portafoglio dal ${startYear} ad oggi. L\'anno corrente è incluso nei dati (parziale).`,
    'Di seguito trovi i dati finanziari aggregati sull\'intero periodo storico:',
    '',
    numericBlock,
    'Struttura la risposta in tre sezioni markdown:',
    '1. **In sintesi** — 2-3 frasi sull\'evoluzione complessiva del patrimonio nel periodo',
    '2. **Trend storici principali** — cashflow cumulativo, crescita patrimonio, composizione del portafoglio nel tempo',
    '3. **1-2 osservazioni strategiche** — cosa emerge dal lungo periodo, opportunità o rischi strutturali',
    '',
    'Rispetta questi vincoli:',
    '- Massimo 550 parole',
    '- Usa markdown semplice',
    '- Non inventare numeri non presenti nel blocco dati',
    '- Privilegia la visione di lungo periodo, non i dettagli mensili',
    '',
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ];

  return sections.join('\n');
}

/**
 * Builds the prompt for a quarterly analysis.
 *
 * Covers a full calendar quarter (3 months). Baseline is the previous quarter-end
 * snapshot; end is the current quarter-end snapshot.
 * Same 3-section structure as monthly, with quarterly framing.
 *
 * Used by the email service to generate the AI comment in quarterly emails.
 * Not exposed in the interactive UI (quarter_analysis is email-only).
 */
export function buildQuarterAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): string {
  const quarterLabel = getPeriodLabel(bundle.selector); // e.g. "Q1 2026"
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? `Puoi integrare contesto macro trimestrale (mercati, tassi, geopolitica) rilevante per il ${quarterLabel}. Usa al massimo 2 ricerche web.`
    : 'Non cercare informazioni macro esterne. Concentrati esclusivamente sui dati del portafoglio forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito di questa sessione.';

  const sections = [
    "Sei l'Assistente AI di Net Worth Tracker per un investitore italiano self-directed.",
    'Rispondi sempre in italiano.',
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `Stai analizzando ${quarterLabel}.`,
    'Di seguito trovi i dati finanziari del trimestre, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    'Struttura la risposta in tre sezioni markdown:',
    '1. **In sintesi** — 2-3 frasi sul risultato complessivo del trimestre',
    '2. **Cosa ha mosso il patrimonio nel trimestre** — i principali driver (mercato, cashflow, allocazione)',
    "3. **1-2 azioni o attenzioni** — osservazioni pratiche per l'investitore",
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
/**
 * Builds the prompt for chat mode.
 *
 * When a context bundle is available (user has a month selected), the numeric
 * data is injected so Claude can answer questions like "cosa pesa di più sul
 * patrimonio?" with real numbers. The response format is intentionally free-form
 * — no forced section structure unlike month_analysis mode.
 */
export function buildChatPrompt(
  prompt: string,
  preferences: AssistantPreferences,
  monthLabel?: string,
  memoryItems: AssistantMemoryItem[] = [],
  contextBundle?: AssistantMonthContextBundle | null,
  enableWebSearch?: boolean
): string {
  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente; usa solo il contesto esplicito del messaggio.';

  // When web search is active, instruct Claude to use recent results to cite
  // specific events (crises, rate decisions, geopolitical developments) and
  // connect them to the user's actual portfolio composition.
  const webSearchInstruction = enableWebSearch
    ? 'Hai accesso a ricerche web recenti. Usale per citare eventi specifici (conflitti, decisioni banche centrali, shock macro) con date precise, e collegali all\'impatto concreto sul portafoglio dell\'utente. Usa al massimo 3 ricerche.'
    : '';

  const sections: string[] = [
    'Sei l\'Assistente AI di Net Worth Tracker per un investitore italiano.',
    'Rispondi sempre in italiano.',
    buildResponseStyleInstruction(preferences.responseStyle),
    'Stai rispondendo a una conversazione generale sul portafoglio dell\'utente.',
    ...(webSearchInstruction ? [webSearchInstruction] : []),
    memoryBlock,
    '',
  ];

  if (contextBundle) {
    // Numeric data available: inject it and instruct Claude to use it freely
    const numericBlock = formatBundleForPrompt(contextBundle);
    sections.push(
      'Di seguito trovi i dati finanziari del periodo selezionato. Usali per rispondere alla domanda dell\'utente — non è richiesta una struttura fissa.',
      '',
      numericBlock,
    );
  } else {
    // No month selected: remind Claude it has no portfolio numbers
    const noDataNote = monthLabel
      ? `Il contesto selezionato è ${monthLabel}, ma non sono disponibili dati numerici.`
      : 'Non è stato selezionato un periodo di riferimento. Rispondi in modo generale senza inventare numeri.';
    sections.push(noDataNote);
  }

  sections.push('', `Richiesta utente: ${prompt.trim()}`);

  return sections.join('\n');
}
