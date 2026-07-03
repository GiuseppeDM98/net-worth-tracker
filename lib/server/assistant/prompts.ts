/**
 * Assistant Prompt Builders
 *
 * Constructs structured prompts for each assistant mode before sending to Anthropic.
 * Separating prompt construction from streaming lets us unit-test prompts independently
 * and keep anthropicStream.ts focused on the HTTP/SSE layer.
 *
 * Each builder returns { system, userContent } instead of one combined string:
 * - `system` is byte-identical across every request of that mode (role, domain
 *   vocabulary, data-integrity rules, web-search policy, formatting conventions,
 *   and that mode's output contract) — callers pass it as a cached system block
 *   (see anthropicStream.ts) so repeated requests don't re-pay for it in full.
 * - `userContent` carries everything that changes per request: the period label,
 *   the numeric data bundle, memory, and the user's question.
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
 * Result of every prompt builder in this module.
 *
 * `system` is safe to send as a cached content block: it never interpolates
 * per-request data, so it stays byte-identical across users and turns for the
 * same mode. `userContent` is the per-request message and must never be cached.
 */
export interface AssistantPromptParts {
  system: string;
  userContent: string;
}

/**
 * Returns a human-readable label for the period encoded in selector.
 *   selector.quarter set    → "Q1 2025" (check before month > 0 — quarter end-month is positive)
 *   month > 0               → "Marzo 2025"
 *   month === 0              → "Anno 2025"
 *   month === -1             → "YTD 2025"
 *   month === -2             → "Storico da 2020"
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
export function formatMemoryForPrompt(items: AssistantMemoryItem[]): string {
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

  // Target vs current allocation: gives Claude the gap for each asset class and
  // sub-category so it can reason about rebalancing without doing the maths itself.
  // Only rendered when targets are configured and a snapshot is available — otherwise
  // the section is silently omitted to keep the prompt clean.
  const targetAlloc = bundle.targetAllocation;
  if (targetAlloc && byAssetClass && Object.keys(byAssetClass).length > 0) {
    const totalNetWorth = currentSnapshot?.totalNetWorth ?? 0;
    lines.push('--- ALLOCAZIONE TARGET vs CORRENTE ---');
    for (const [assetClass, target] of Object.entries(targetAlloc)) {
      const currentValue = byAssetClass[assetClass] ?? 0;
      const currentPct = totalNetWorth > 0 ? (currentValue / totalNetWorth) * 100 : 0;
      const gap = currentPct - target.targetPercentage;
      const gapStr = gap >= 0 ? `+${gap.toFixed(1)} p.p.` : `${gap.toFixed(1)} p.p.`;
      lines.push(`${assetClass}: attuale ${currentPct.toFixed(1)}% | target ${target.targetPercentage}% | gap ${gapStr}`);

      if (target.subTargets) {
        for (const [sub, subTargetPct] of Object.entries(target.subTargets)) {
          // subTargetPct is relative to the asset class; convert to portfolio-level for comparison
          const subTargetOfPortfolio = (subTargetPct / 100) * target.targetPercentage;
          const subCurrentValue = bundle.bySubCategoryAllocation?.[assetClass]?.[sub] ?? 0;
          const subCurrentPct = totalNetWorth > 0 ? (subCurrentValue / totalNetWorth) * 100 : 0;
          const subGap = subCurrentPct - subTargetOfPortfolio;
          const subGapStr = subGap >= 0 ? `+${subGap.toFixed(1)} p.p.` : `${subGap.toFixed(1)} p.p.`;
          lines.push(`  › ${sub}: attuale ${subCurrentPct.toFixed(1)}% | target ${subTargetOfPortfolio.toFixed(1)}% (${subTargetPct}% dell'${assetClass}) | gap ${subGapStr}`);
        }
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

export function buildResponseStyleInstruction(style: AssistantPreferences['responseStyle']): string {
  if (style === 'concise') return 'Rispondi in modo sintetico, con punti chiari e pochi fronzoli.';
  if (style === 'deep') return 'Rispondi con maggiore profondità, esplicitando ipotesi e limiti dei dati.';
  return 'Rispondi in modo equilibrato: chiaro, concreto e leggibile.';
}

// ─── Shared static system core (cacheable) ───────────────────────────────────
//
// Every line below is byte-identical for every user, every mode, every request.
// It carries no per-request data — the numeric bundle, memory items, and the
// user's question live in userContent instead. Keep it that way: interpolating
// anything dynamic in here (a date, a name, a computed flag) would silently
// break the prefix match and stop it from ever being served from cache.

export const ASSISTANT_SYSTEM_CORE = [
  '# Ruolo e missione',
  "Sei l'Assistente AI di Net Worth Tracker, il consulente digitale di un investitore italiano self-directed che gestisce autonomamente il proprio patrimonio: portafoglio titoli, liquidità, immobili, fondi pensione, cashflow e budget.",
  "Non sei un consulente finanziario regolamentato: non dare raccomandazioni di investimento vincolanti né disclaimer generici da prospetto. Il tuo valore è leggere i SUOI dati reali e restituire un giudizio concreto, non un discorso generico applicabile a chiunque.",
  'Rispondi sempre in italiano.',
  '',
  '# Vocabolario di dominio',
  "Nei dati che ricevi troverai termini specifici del mercato italiano. Interpretali così, senza chiedere chiarimenti:",
  '- **PAC**: piano di accumulo, versamenti periodici su ETF o fondi',
  "- **Cedole**: pagamenti periodici di obbligazioni (BTP, corporate bond). I BTP Italia indicizzati all'inflazione (\"Sì\") hanno cedole variabili legate al FOI: un valore diverso dal precedente non è un errore",
  "- **Bollo (imposta di bollo)**: imposta annuale sul patrimonio finanziario, tipicamente 0,2% del valore, esente sotto soglie specifiche per la liquidità",
  '- **YOC (Yield on Cost)**: rendimento da dividendi/cedole calcolato sul prezzo di acquisto, non sul valore corrente — resta stabile anche se il prezzo di mercato cambia',
  '- **TWR (Time-Weighted Return)**: rendimento che neutralizza l\'effetto di versamenti e prelievi, utile per giudicare la qualità delle scelte di investimento indipendentemente da quanto capitale è stato aggiunto',
  '- **MWR/IRR (Money-Weighted Return)**: rendimento che invece include l\'effetto del timing dei versamenti — se diverge molto dal TWR, il timing dei contributi ha pesato sul risultato',
  '- **Ribilanciamento**: riportare l\'allocazione per classe di attivo (azionario, obbligazionario, immobiliare, liquidità, ecc.) verso i target che l\'utente ha dichiarato nelle impostazioni',
  "- **Centro di costo**: raggruppamento opzionale delle spese per progetto (es. ristrutturazione), distinto dalle categorie di spesa ordinarie",
  '',
  '# Regole sui dati (non negoziabili)',
  '- Usa esclusivamente i numeri presenti nel blocco dati del messaggio; non calcolarli, stimarli o arrotondarli diversamente da come sono forniti',
  '- Se un valore è indicato come N/D, dillo esplicitamente e non speculare su quale potrebbe essere',
  '- Distingui sempre fatto da inferenza: quando ipotizzi una causa non esplicitata nei dati, segnala che è una tua lettura ("probabilmente", "i dati suggeriscono"), non presentarla come certezza',
  '- Le variazioni di entrate e spese personali si spiegano solo con i dati per categoria forniti nel messaggio, mai con cause esterne inventate',
  '',
  '# Ricerca web (quando disponibile come strumento)',
  "Quando hai accesso alla ricerca web, usala ESCLUSIVAMENTE per contestualizzare i movimenti di mercato del patrimonio (decisioni di banche centrali, eventi geopolitici, andamento borsistico) con eventi e date verificabili. Non usarla mai per spiegare variazioni di entrate o spese personali dell'utente: quelle dipendono solo dai suoi dati di cashflow. Cita l'evento e la data specifica, non affermazioni generiche come \"i mercati sono saliti\".",
  '',
  '# Stile e formattazione',
  '- Markdown semplice: grassetto per i numeri chiave, elenchi puntati per le liste. Evita tabelle complesse e intestazioni annidate oltre un livello',
  '- Valute in formato italiano (es. €1.234), percentuali con segno esplicito (+2,3% / -1,1%)',
  "- Non ripetere meccanicamente i numeri già presenti nei dati senza aggiungere interpretazione: il valore che dai è nel collegare un numero a una causa o a un'azione, non nel ridirlo",
  '- Non aprire con premesse generiche ("Come assistente AI...", "Analizzando i dati forniti..."): vai dritto al punto richiesto',
  '',
  '# Calibrazione del tono',
  '- Evita: "Il patrimonio è cresciuto. Questo è un buon segno per i tuoi investimenti."',
  '- Preferisci: "Il patrimonio è salito di €3.200 (+1,8%), trainato per €2.100 dal versamento mensile e per €1.100 dalla performance di mercato — la componente organica resta modesta questo mese."',
  '- Evita: "Le spese sono aumentate rispetto al mese scorso."',
  "- Preferisci: \"Le uscite sono salite di €340, quasi interamente per la voce Trasporti (+€290) — verifica se è una spesa una tantum o un nuovo livello stabile.\"",
  '',
  '# Casi limite',
  "- Periodo ancora in corso (mese/anno corrente, YTD): i dati sono parziali per definizione — evidenzia le tendenze osservate finora, non presentarle come il risultato finale del periodo",
  '- Asset venduti: sono esclusi dal calcolo di YOC e Current Yield per quell\'asset — non è un dato mancante, è per design',
  "- Se l'utente non ha configurato target di allocazione o memoria persistente, non trattarlo come un'anomalia da segnalare: sono funzionalità opzionali",
].join('\n');

// ─── Per-mode format contracts (static per mode, cacheable) ──────────────────

const MONTH_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  '1. **In sintesi** — 2-3 frasi sul risultato complessivo del mese',
  '2. **Cosa ha mosso il patrimonio** — i principali driver (mercato, cashflow, allocazione)',
  "3. **1-2 azioni o attenzioni** — osservazioni pratiche per l'investitore",
  '',
  'Vincoli: massimo 450 parole.',
].join('\n');

const YEAR_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  "1. **In sintesi** — 2-3 frasi sul risultato complessivo dell'anno",
  "2. **Cosa ha mosso il patrimonio nell'anno** — i principali driver (mercato, cashflow, allocazione, eventi); se l'anno è ancora in corso, precisa che sono i driver osservati finora",
  "3. **1-2 azioni o attenzioni** — osservazioni pratiche per l'investitore",
  '',
  'Vincoli: massimo 500 parole.',
].join('\n');

const YTD_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  '1. **In sintesi** — 2-3 frasi sul risultato YTD',
  "2. **Cosa ha mosso il patrimonio da inizio anno** — principali driver osservati finora",
  '3. **1-2 azioni o attenzioni** — osservazioni pratiche',
  '',
  "Vincoli: massimo 450 parole. Non proiettare valori annualizzati salvo esplicita richiesta dell'utente — il periodo è per definizione parziale.",
].join('\n');

const HISTORY_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  "1. **In sintesi** — 2-3 frasi sull'evoluzione complessiva del patrimonio nel periodo",
  '2. **Trend storici principali** — cashflow cumulativo, crescita patrimonio, composizione del portafoglio nel tempo',
  '3. **1-2 osservazioni strategiche** — cosa emerge dal lungo periodo, opportunità o rischi strutturali',
  '',
  'Vincoli: massimo 550 parole. Privilegia la visione di lungo periodo rispetto ai dettagli di un singolo mese.',
].join('\n');

const QUARTER_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  '1. **In sintesi** — 2-3 frasi sul risultato complessivo del trimestre',
  '2. **Cosa ha mosso il patrimonio nel trimestre** — i principali driver (mercato, cashflow, allocazione)',
  "3. **1-2 azioni o attenzioni** — osservazioni pratiche per l'investitore",
  '',
  'Vincoli: massimo 450 parole.',
].join('\n');

const CHAT_FORMAT_CONTRACT = [
  '# Formato della risposta',
  "Modalità conversazionale: nessuna struttura fissa a sezioni. Rispondi direttamente alla domanda, usando i dati forniti quando disponibili e restando comunque entro le regole sui dati e lo stile definiti sopra.",
].join('\n');

/**
 * Format contract for the periodic summary email (monthly/quarterly/semiannual/yearly
 * AI comment). Exported so monthlyEmailService.ts can compose it with ASSISTANT_SYSTEM_CORE
 * without duplicating the shared role/domain/guardrail text.
 *
 * Written to cover both possible shapes of point 2/3 without branching on per-request
 * data (baseline label, whether the YoY comparison coincides with the previous-period
 * one for an annual email) — those specifics live in the numeric data block instead,
 * keeping this contract byte-identical across every email sent.
 */
export const EMAIL_PERIODIC_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in markdown con queste sezioni:',
  '1. **In sintesi** — 2-3 frasi sul risultato complessivo del periodo; se i dati includono un piazzamento Hall of Fame, citalo (non inventare la posizione)',
  '2. **Rispetto al periodo precedente** — cosa è cambiato rispetto al periodo precedente, citando i numeri del blocco di confronto fornito',
  "3. **Confronto con l'anno precedente** — confronto anno su anno citando i numeri forniti; se il periodo è annuale e questo confronto coincide con quello del punto 2 (i dati te lo segnalano esplicitamente), unisci le due sezioni e dillo",
  "4. **Entrate e spese: di quanto e perché** — quantifica l'aumento o la diminuzione di entrate e spese e ipotizza le cause più probabili basandoti sui dati per categoria; commenta il mix per tipo (Fisse/Variabili/Debiti) quando rilevante; per il patrimonio puoi citare il contesto macro di mercato",
  "5. **Azioni o attenzioni** — 1-2 osservazioni pratiche per l'investitore",
  '',
  'Vincoli: massimo 500 parole.',
].join('\n');

// ─── Prompt builders ──────────────────────────────────────────────────────────

/**
 * Builds the system + user content sent to Claude for a month analysis.
 *
 * `system` (role, domain, guardrails, month output contract) is identical across
 * every request of this mode — pass it as a cached block. `userContent` carries
 * the period label, numeric bundle, memory, and the user's question.
 */
export function buildMonthAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): AssistantPromptParts {
  const monthLabel = getPeriodLabel(bundle.selector);
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi integrare contesto macro (mercati, tassi, geopolitica) se rilevante per il mese.'
    : 'Non cercare informazioni macro esterne. Concentrati esclusivamente sui dati del portafoglio forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito di questa sessione.';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `Stai analizzando il mese di ${monthLabel}.`,
    'Di seguito trovi i dati finanziari del mese, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${MONTH_FORMAT_CONTRACT}`, userContent };
}

/**
 * Builds the prompt for a full-year analysis.
 *
 * Same 3-section contract as monthly, with annual framing baked into the static
 * system block. When the year is still in progress, `partialNote` (per-request,
 * computed from dataQuality.isPartialMonth) is injected into userContent so
 * Claude sees the concrete warning without the system block needing to branch.
 */
export function buildYearAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): AssistantPromptParts {
  const yearLabel = `Anno ${bundle.selector.year}`;
  const isCurrentYear = bundle.dataQuality.isPartialMonth;
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? `Puoi integrare contesto macro annuale (mercati, tassi, ciclo economico) rilevante per il ${yearLabel}.`
    : 'Non cercare informazioni macro esterne. Concentrati sui dati forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito.';

  const partialNote = isCurrentYear
    ? `IMPORTANTE: il ${yearLabel} è ancora in corso. I dati cashflow e patrimoniali sono parziali. Non trarre conclusioni definitive sull'anno — evidenzia le tendenze finora visibili.`
    : '';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    ...(partialNote ? [partialNote, ''] : []),
    `Stai analizzando ${yearLabel}.`,
    'Di seguito trovi i dati finanziari aggregati per l\'anno, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${YEAR_FORMAT_CONTRACT}`, userContent };
}

/**
 * Builds the prompt for a YTD (Year-to-Date) analysis.
 *
 * Covers Jan 1 of the current year to the latest available month.
 * Always partial — the static contract already tells Claude not to extrapolate.
 */
export function buildYtdAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): AssistantPromptParts {
  const yearLabel = `${bundle.selector.year}`;
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi integrare contesto macro (mercati, tassi) rilevante per l\'anno in corso.'
    : 'Non cercare informazioni macro esterne. Concentrati sui dati forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente.';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `IMPORTANTE: stai analizzando il periodo YTD (da inizio ${yearLabel} a oggi). L\'anno è in corso — i dati sono parziali. Non trarre conclusioni finali sull\'anno.`,
    '',
    'Di seguito trovi i dati finanziari YTD, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${YTD_FORMAT_CONTRACT}`, userContent };
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
): AssistantPromptParts {
  const startYear = bundle.selector.year;
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? 'Puoi citare eventi macro rilevanti nel periodo storico.'
    : 'Non cercare informazioni macro esterne. Concentrati sui dati storici forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente.';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `Stai analizzando lo storico totale del portafoglio dal ${startYear} ad oggi. L\'anno corrente è incluso nei dati (parziale).`,
    'Di seguito trovi i dati finanziari aggregati sull\'intero periodo storico:',
    '',
    numericBlock,
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${HISTORY_FORMAT_CONTRACT}`, userContent };
}

/**
 * Builds the prompt for a quarterly analysis.
 *
 * Covers a full calendar quarter (3 months). Baseline is the previous quarter-end
 * snapshot; end is the current quarter-end snapshot. Same 3-section contract as
 * monthly, with quarterly framing.
 *
 * Used by the email service to generate the AI comment in quarterly emails.
 * Not exposed in the interactive UI (quarter_analysis is email-only).
 */
export function buildQuarterAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): AssistantPromptParts {
  const quarterLabel = getPeriodLabel(bundle.selector); // e.g. "Q1 2026"
  const numericBlock = formatBundleForPrompt(bundle);

  const macroInstruction = preferences.includeMacroContext
    ? `Puoi integrare contesto macro trimestrale (mercati, tassi, geopolitica) rilevante per il ${quarterLabel}.`
    : 'Non cercare informazioni macro esterne. Concentrati esclusivamente sui dati del portafoglio forniti.';

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente. Usa solo il contesto esplicito di questa sessione.';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    macroInstruction,
    memoryBlock,
    '',
    `Stai analizzando ${quarterLabel}.`,
    'Di seguito trovi i dati finanziari del trimestre, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${QUARTER_FORMAT_CONTRACT}`, userContent };
}

/**
 * Builds the prompt for chat mode (no forced section structure).
 *
 * When a context bundle is available (user has a month/year/etc. selected), the
 * numeric data is injected so Claude can answer questions like "cosa pesa di più
 * sul patrimonio?" with real numbers. Web search scoping is already covered by
 * the shared system core — no per-request instruction needed here, since the
 * `enableWebSearch` flag only controls whether the tool is declared at all
 * (see anthropicStream.ts); Claude can't call a tool that isn't offered.
 */
export function buildChatPrompt(
  prompt: string,
  preferences: AssistantPreferences,
  monthLabel: string | undefined,
  memoryItems: AssistantMemoryItem[] = [],
  contextBundle?: AssistantMonthContextBundle | null
): AssistantPromptParts {
  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente; usa solo il contesto esplicito del messaggio.';

  const userSections: string[] = [
    buildResponseStyleInstruction(preferences.responseStyle),
    memoryBlock,
    '',
  ];

  if (contextBundle) {
    // Numeric data available: inject it and instruct Claude to use it freely
    const numericBlock = formatBundleForPrompt(contextBundle);
    userSections.push(
      'Di seguito trovi i dati finanziari del periodo selezionato. Usali per rispondere alla domanda dell\'utente — non è richiesta una struttura fissa.',
      '',
      numericBlock,
    );
  } else {
    // No month selected: remind Claude it has no portfolio numbers
    const noDataNote = monthLabel
      ? `Il contesto selezionato è ${monthLabel}, ma non sono disponibili dati numerici.`
      : 'Non è stato selezionato un periodo di riferimento. Rispondi in modo generale senza inventare numeri.';
    userSections.push(noDataNote);
  }

  userSections.push('', `Richiesta utente: ${prompt.trim()}`);

  return {
    system: `${ASSISTANT_SYSTEM_CORE}\n\n${CHAT_FORMAT_CONTRACT}`,
    userContent: userSections.join('\n'),
  };
}
