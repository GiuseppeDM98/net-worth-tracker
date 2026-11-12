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
 *   and that mode's output contract) — cacheable as a system block, though
 *   anthropicStream.ts deliberately sends it without `cache_control` (see there).
 * - `userContent` carries everything that changes per request: the period label,
 *   the numeric data bundle, memory, and the user's question.
 */

import { AssistantMemoryItem, AssistantMonthContextBundle, AssistantPreferences, AssistantTodayContext } from '@/types/assistant';
import { getAssistantPeriodLabel } from '@/lib/utils/assistantPeriodLabel';
import { EXPENSE_PROPOSAL_LANGUAGE, EXPENSE_PROPOSALS_MAX_PER_MESSAGE } from '@/lib/utils/expenseProposal';
import { ASSISTANT_QUESTION_MAX_PER_MESSAGE } from '@/lib/utils/questionSet';
import { MAX_RECURRENCE_OCCURRENCES } from '@/lib/utils/recurrenceDates';
import { GoalVerdict } from '@/lib/utils/goalTrajectory';
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import {
  HOLDING_ROLE_LABELS,
  ledgerTypeLabel,
  type AssistantPortfolioContext,
} from '@/lib/utils/assistantPortfolioContext';

/**
 * The class as the app names it on screen. The blocks below are quoted back to the user in
 * Italian prose, so handing the model 'realestate' or 'trendFollowing' is how a Firestore key
 * ends up in an answer — and «dell'trendFollowing» is not a sentence in any language.
 */
function assetClassLabel(assetClass: string): string {
  return ASSET_CLASS_LABELS[assetClass] ?? assetClass;
}

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
 * Formats a share of a total (0-100), with no leading sign.
 *
 * Distinct from pct() on purpose: pct() always prepends '+' because it renders a
 * *change*. Reusing it for a share would print "+18,2% delle uscite", which reads
 * as growth rather than a proportion.
 */
function share(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

/** Pluralises the transaction count — "1 transazioni" is a phrasing the model copies. */
function txn(count: number): string {
  return `${count} ${count === 1 ? 'transazione' : 'transazioni'}`;
}

// Safety valve on the subcategory rows rendered into the prompt. Never reached with a
// realistic taxonomy (~120 rows over five years of history); it exists so a pathological
// account cannot blow up the context window. When it DOES trip, the omission is stated
// in the text — a silent cap is precisely the defect this whole section replaces.
const MAX_SUBCATEGORY_ROWS_IN_PROMPT = 150;

/**
 * Verdict wording for the goals section.
 *
 * Deliberately NOT the chip labels from `goalVerdictMeta.tsx`: a chip has three words
 * of room and a reader who can see the deadline next to it, while the model reads one
 * line of prose and needs the reason spelled out.
 */
const GOAL_VERDICT_PROMPT_LABELS: Record<GoalVerdict, string> = {
  reached: 'raggiunto',
  onTrack: 'in linea con la scadenza al ritmo attuale',
  offTrack: 'in ritardo: al ritmo attuale non arriva al target entro la scadenza',
  noDeadline: 'senza scadenza: il ritmo non è giudicabile',
  noTarget: 'aperto: nessun importo target definito',
};

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
 * Renders the Goal-Based Investing section, including its two absence cases.
 *
 * The section always exists. `goals === null` (feature off, or no goal document)
 * and an empty goal list are DIFFERENT states and both are said out loud, because
 * an LLM cannot tell either of them from "this data was not sent to me" — and once
 * it cannot, the data-integrity rules make it answer "N/D" about a feature the user
 * may simply not have turned on.
 *
 * Returns the lines to append, trailing blank line included.
 */
function formatGoalsSection(goals: (AssistantMonthContextBundle['goals'] & { coverage?: AssistantPortfolioContext['goalCoverage'] }) | null): string[] {
  const lines: string[] = ['--- OBIETTIVI DI INVESTIMENTO (Goal-Based Investing) ---'];

  if (!goals || !goals.enabled) {
    lines.push(
      "Goal-Based Investing non attivo: l'utente non usa questa funzionalità, quindi non ha obiettivi di investimento configurati. Non è un dato mancante."
    );
    lines.push('');
    return lines;
  }

  // What no goal holds — the same figure FIRE › Obiettivi prints as «Non assegnato» (2026-10-20);
  // with no goal yet it is the whole held portfolio, and saying so is the point.
  const coverageLine = goals.coverage
    ? `Non assegnato a nessun obiettivo: ${eur(goals.coverage.freeEur)} su ${eur(goals.coverage.totalEur)} di strumenti posseduti (un immobile al netto del mutuo che lo finanzia; mutui e prestiti non sono strumenti); assegnato ${eur(goals.coverage.assignedEur)}. Ogni riga del blocco STRUMENTI dice la sua quota libera: somma quelle, non i valori.`
    : null;

  if (goals.items.length === 0) {
    lines.push('Funzionalità attiva ma nessun obiettivo ancora creato.');
    if (coverageLine) lines.push(coverageLine);
    lines.push('');
    return lines;
  }

  lines.push(
    `Elenco completo (${goals.items.length}). Il "valore attuale" è la quota di portafoglio assegnata all'obiettivo, non un conto separato: una quota è una parte di uno strumento, scritta dall'utente in percentuale o in quote (euro per un conto o un immobile) e già convertita in euro qui.`
  );

  for (const goal of goals.items) {
    const parts: string[] = [`valore attuale ${eur(goal.currentValue)}`];

    if (goal.targetAmount != null) {
      const progress = goal.targetAmount > 0 ? (goal.currentValue / goal.targetAmount) * 100 : 0;
      parts.push(`target ${eur(goal.targetAmount)} (${share(progress)} raggiunto)`);
    } else {
      parts.push('nessun importo target (obiettivo aperto)');
    }

    parts.push(goal.targetDateIso ? `scadenza ${goal.targetDateIso}` : 'nessuna scadenza');
    parts.push(`priorità ${goal.priority}`);

    if (goal.monthlyContribution != null) {
      parts.push(`contributo mensile pianificato ${eur(goal.monthlyContribution)}`);
    }

    lines.push(`${goal.name} [id ${goal.id}]: ${parts.join(' | ')}`);

    if (goal.verdict) {
      lines.push(`  › stato: ${GOAL_VERDICT_PROMPT_LABELS[goal.verdict]}`);
    }

    // The required pace, stated as a projection and never as a measurement — the
    // assumed return is printed next to it so the model can qualify it instead of
    // presenting an annuity calculation as an observed fact.
    if (goal.requiredMonthlyContribution != null) {
      const assumption =
        goal.assumedAnnualReturn != null
          ? ` (proiezione, ipotizzando un rendimento nominale del ${share(goal.assumedAnnualReturn)} annuo)`
          : ' (proiezione)';
      lines.push(
        goal.requiredMonthlyContribution > 0
          ? `  › versamento mensile necessario per arrivare al target entro la scadenza: ${eur(goal.requiredMonthlyContribution)}${assumption}`
          : `  › nessun altro versamento necessario: il capitale già assegnato basta a raggiungere il target entro la scadenza${assumption}`
      );
    }

    if (goal.projectedValueAtDeadline != null) {
      lines.push(
        `  › valore proiettato alla scadenza al ritmo attuale: ${eur(goal.projectedValueAtDeadline)}`
      );
    }

    if (goal.recommendedAllocation && Object.keys(goal.recommendedAllocation).length > 0) {
      const mix = Object.entries(goal.recommendedAllocation)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .map(([assetClass, percentage]) => `${assetClassLabel(assetClass)} ${percentage}%`)
        .join(', ');
      lines.push(`  › allocazione consigliata per questo obiettivo: ${mix}`);
    }

    // What stands behind the goal, instrument by instrument (2026-10-20).
    lines.push(
      goal.assignments.length === 0
        ? '  › strumenti assegnati: nessuno'
        : `  › strumenti assegnati: ${goal.assignments.map((row) => `${row.assetName}${row.ticker ? ` (${row.ticker})` : ''} ${row.quota} = ${eur(row.valueEur)}`).join('; ')}`
    );
  }

  if (goals.goalDrivenAllocationEnabled) {
    lines.push(
      "Allocazione goal-driven ATTIVA: i target di allocazione del portafoglio sono derivati da questi obiettivi."
    );
  }
  if (coverageLine) lines.push(coverageLine);

  lines.push('');
  return lines;
}

function eurCents(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

function pp(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} p.p.`;
}

function quantity(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 4 }).format(value);
}

/** The unit a holding's quantity counts in: euro for a balance-like value, quote for an instrument. */
function quantityUnit(type: string): string {
  return type === 'cash' || type === 'realestate' || type === 'pensionFund' || type === 'loan' ? '€' : 'quote';
}

/**
 * The portfolio block (2026-10-20): what the owner asked the assistant to SEE — every
 * instrument, the allocation on the page's base, the ledger, the registers, the household.
 * Each list is printed whole, or the text says how many rows were left out and which (the
 * oldest), never a silent cap (the rule of this module's header).
 */
export function formatPortfolioForPrompt(portfolio: AssistantPortfolioContext): string[] {
  const lines: string[] = [];
  const { holdings, allocation, ledger, dividends, pension, loans, family } = portfolio;

  // Every instrument, largest first, debts last.
  lines.push(`--- STRUMENTI IN PORTAFOGLIO OGGI (elenco completo, ${holdings.length}) ---`);
  if (holdings.length === 0) {
    lines.push('Nessuno strumento registrato.');
  }
  for (const row of holdings) {
    const parts: string[] = [];
    parts.push(`${assetClassLabel(row.assetClass)}${row.subCategory ? ` › ${row.subCategory}` : ' (senza sottocategoria)'}`);
    parts.push(HOLDING_ROLE_LABELS[row.role]);
    parts.push(`${quantity(row.quantity)} ${quantityUnit(row.type)}`);
    parts.push(`valore ${eur(row.valueEur)}`);
    if (row.costPerUnitEur !== undefined) parts.push(`PMC ${eurCents(row.costPerUnitEur)}`);
    if (row.gainEur !== undefined && row.gainPct !== undefined) parts.push(`G/P ${eur(row.gainEur)} (${pct(row.gainPct)})`);
    if (row.owner) parts.push(`intestatario: ${row.owner}`);
    parts.push(row.isLiquid ? 'liquido' : 'illiquido');
    if (row.financedAssetName) parts.push(`finanzia: ${row.financedAssetName}`);
    if (row.goalAssignedPct !== undefined && row.goalFreeEur !== undefined) {
      // The free figure always, even with no goal on it: a property is free NET of its loan, and
      // without the figure the model summed the gross values and called the total inconsistent
      // (the owner's run, 2026-10-20).
      parts.push(row.goalAssignedPct > 0 ? `obiettivi: assegnato ${share(row.goalAssignedPct)}, libero ${eur(row.goalFreeEur)}` : `libero da obiettivi (${eur(row.goalFreeEur)})`);
    }
    lines.push(`${row.name}${row.ticker ? ` (${row.ticker})` : ''}: ${parts.join(' | ')}`);
  }
  lines.push('');

  // The allocation as the page measures it.
  lines.push('--- ALLOCAZIONE OGGI (la base della pagina Allocazione: negoziabili + non negoziabili, al netto dei debiti che li seguono) ---');
  lines.push(
    `Base: ${eur(allocation.baseTotal)} (negoziabile ${eur(allocation.tradableTotal)}, non negoziabile ${eur(allocation.frozenTotal)}). Fuori dall'allocazione: ${eur(allocation.excludedTotal)}.`
  );
  for (const row of allocation.byClass) {
    lines.push(`${row.label}: ${eur(row.value)} (${share(row.pct)} della base)${row.frozenValue > 0 ? ` — di cui non negoziabile ${eur(row.frozenValue)}` : ''}`);
    for (const sub of row.subCategories) {
      lines.push(`  › ${sub.subCategory}: ${eur(sub.value)} (${share(sub.pctOfClass)} della classe, ${share(sub.pctOfBase)} della base)`);
    }
  }
  if (allocation.frozen.length > 0) {
    lines.push(`Non negoziabili (nella base, mai nei piani): ${allocation.frozen.map((row) => `${row.name} ${eur(row.value)}`).join('; ')}.`);
  }
  if (allocation.excluded.length > 0) {
    lines.push(`Esclusi dall'Allocazione (fuori dalla base, elencati per completezza): ${allocation.excluded.map((row) => `${row.name} ${eur(row.value)}`).join('; ')}.`);
  }
  lines.push('');

  // Target vs current, on the same base.
  if (allocation.targets) {
    lines.push('--- ALLOCAZIONE TARGET vs ATTUALE (sulla base della pagina Allocazione) ---');
    for (const row of allocation.targets) {
      const target =
        row.fixedAmount !== undefined
          ? `target ${eur(row.fixedAmount)} fisso (${share(row.targetPct)} della base oggi)`
          : `target ${share(row.targetPct)}`;
      lines.push(`${row.label}: attuale ${share(row.currentPct)} (${eur(row.currentValue)}) | ${target} | gap ${pp(row.gapPp)}`);
      for (const sub of row.subRows) {
        lines.push(
          `  › ${sub.subCategory}: attuale ${share(sub.currentPctOfClass)} della classe | target ${share(sub.targetPctOfClass)} della classe | gap ${pp(sub.gapPp)}`
        );
      }
    }
    lines.push('');
  } else {
    lines.push('--- ALLOCAZIONE TARGET vs ATTUALE ---');
    lines.push("Nessun target di allocazione configurato: è una scelta dell'utente, non un dato mancante.");
    lines.push('');
  }

  // The ledger.
  lines.push(`--- REGISTRO OPERAZIONI (acquisti, vendite, rettifiche; ${ledger.totalRows} in tutto) ---`);
  if (ledger.totalRows === 0) {
    lines.push('Nessuna operazione registrata: gli strumenti sono stati inseriti con il loro PMC, senza registro.');
  }
  if (ledger.omittedRows > 0) {
    lines.push(`(le ${ledger.omittedRows} operazioni più vecchie sono omesse; sotto le ${ledger.rows.length} più recenti)`);
  }
  for (const row of ledger.rows) {
    lines.push(
      `${row.dateIso} · ${ledgerTypeLabel(row.type)}${row.isBaseline ? ' (posizione iniziale di migrazione)' : ''} · ${row.assetName}${row.ticker ? ` (${row.ticker})` : ''}: ${quantity(row.quantity)} quote a ${eurCents(row.priceEur)} = ${eur(row.amountEur)}${row.feesEur > 0 ? `, commissioni ${eurCents(row.feesEur)}` : ''}`
    );
  }
  lines.push('');

  // Dividends: received and announced never one figure.
  lines.push(
    `--- DIVIDENDI E CEDOLE: REGISTRO (${dividends.received.length + dividends.omittedReceived} incassati, ${dividends.announced.length} annunciati) ---`
  );
  if (dividends.received.length === 0 && dividends.announced.length === 0) {
    lines.push('Nessun dividendo o cedola nel registro.');
  }
  if (dividends.omittedReceived > 0) {
    lines.push(`(i ${dividends.omittedReceived} incassi più vecchi sono omessi)`);
  }
  for (const row of dividends.received) {
    lines.push(
      `${row.paymentDateIso} · incassato · ${row.assetName}${row.ticker ? ` (${row.ticker})` : ''}: netto ${eurCents(row.netEur)} (lordo ${eurCents(row.grossEur)})${row.isProvisional ? ' — provvisorio' : ''}`
    );
  }
  for (const row of dividends.announced) {
    lines.push(
      `${row.paymentDateIso} · annunciato, non ancora incassato · ${row.assetName}${row.ticker ? ` (${row.ticker})` : ''}: netto ${eurCents(row.netEur)} (lordo ${eurCents(row.grossEur)})${row.isProvisional ? ' — provvisorio' : ''}`
    );
  }
  if (dividends.coupons.length > 0) {
    lines.push('Cedole dei bond in portafoglio:');
    for (const coupon of dividends.coupons) {
      const parts = [
        coupon.annualRatePct !== null ? `tasso annuo ${share(coupon.annualRatePct)}` : 'tasso non noto',
        coupon.frequency,
        `scadenza ${coupon.maturityIso}`,
        coupon.nextCouponIso
          ? `prossima cedola ${coupon.nextCouponIso}${coupon.nextCouponPerUnitEur !== null ? ` (${eurCents(coupon.nextCouponPerUnitEur)} per unità)` : ''}`
          : 'nessuna cedola futura',
      ];
      if (coupon.indexation) parts.push(coupon.indexation);
      lines.push(`  ${coupon.assetName}${coupon.ticker ? ` (${coupon.ticker})` : ''}: ${parts.join(' | ')}`);
    }
  }
  lines.push('');

  // Pension funds and their contributions.
  lines.push(`--- PREVIDENZA (fondi pensione: ${pension.length}) ---`);
  if (pension.length === 0) lines.push('Nessun fondo pensione registrato.');
  for (const fund of pension) {
    lines.push(`${fund.name}: valore ${eur(fund.valueEur)}${fund.memberName ? ` | di ${fund.memberName}` : ''} | ${HOLDING_ROLE_LABELS[fund.role]}`);
    if (fund.byYear.length === 0) lines.push('  › nessun versamento registrato');
    for (const year of fund.byYear) {
      lines.push(`  › ${year.taxYear}: ${eur(year.total)} (TFR ${eur(year.tfr)}, volontari ${eur(year.voluntary)}, datoriali ${eur(year.employer)})`);
    }
  }
  lines.push('');

  // Loans.
  lines.push(`--- MUTUI E PRESTITI (${loans.length}) ---`);
  if (loans.length === 0) lines.push('Nessun debito registrato.');
  for (const loan of loans) {
    const parts = [`debito residuo ${eur(loan.residualDebtEur)}`];
    parts.push(loan.financedAssetName ? `finanzia: ${loan.financedAssetName}` : 'prestito personale');
    parts.push(loan.interestRatePct !== null ? `TAN ${share(loan.interestRatePct)}` : 'TAN non indicato');
    if (loan.lastInstalmentEur !== null) parts.push(`ultima rata nel periodo ${eur(loan.lastInstalmentEur)}`);
    parts.push(HOLDING_ROLE_LABELS[loan.role]);
    lines.push(`${loan.name}: ${parts.join(' | ')}`);
  }
  lines.push('');

  // The household.
  lines.push('--- FAMIGLIA ---');
  lines.push(
    family.ownerAge !== null
      ? `Età dell'intestatario del conto: ${family.ownerAge} anni.`
      : "Età dell'intestatario del conto: non indicata nelle impostazioni."
  );
  if (family.members.length === 0) {
    lines.push('Nessun membro della famiglia configurato: ogni strumento è in comune.');
  } else {
    lines.push(
      `Membri: ${family.members.map((member) => `${member.name}${member.grossAnnualIncome !== null ? ` (RAL ${eur(member.grossAnnualIncome)})` : ''}`).join(', ')}.`
    );
  }
  lines.push('');

  return lines;
}

/**
 * Serialises the numeric bundle into a readable Italian text block
 * that Claude can reference when writing the analysis.
 *
 * Design: structured prose is clearer than JSON for an LLM operating on
 * financial narrative tasks; the key/value format mimics a briefing note.
 *
 * Exported for `buildEmailAiPrompt` (monthlyEmailService.ts): the periodic emails send
 * this same block, so every future bundle field reaches them for free and the
 * "questo blocco è ESAUSTIVO" guardrails in ASSISTANT_SYSTEM_CORE stay true there too.
 *
 * @param bundle       The period's numeric bundle.
 * @param periodLabel  Overrides the label derived from `selector`. A quarter or a
 *                     semester cannot be encoded in a `{year, month}` selector, so the
 *                     email passes its own window name rather than let the header claim
 *                     the closing month is the whole period.
 */
/**
 * The data block of a free question with NO period (2026-10-20): the portfolio of today, the
 * origin of the targets and the goals — the same formatters as the period bundle, so the two
 * blocks can never disagree — under a header that says what is NOT there (no cashflow, no
 * snapshot, no comparison between dates), so the model never invents a period figure.
 */
export function formatTodayContextForPrompt(context: AssistantTodayContext): string {
  const lines: string[] = [];
  lines.push('=== DATI FINANZIARI: PORTAFOGLIO DI OGGI (nessun periodo selezionato) ===');
  lines.push(
    "Non c'è un periodo: niente entrate, uscite, snapshot o confronto tra date. Se la domanda riguarda un periodo, chiedi all'utente di selezionarlo nel contesto; non stimare quelle cifre."
  );
  lines.push('');
  lines.push(
    context.targetAllocationSource === 'goal_driven'
      ? 'Origine dei target di allocazione: derivati dagli obiettivi di investimento (allocazione goal-driven attiva). Non sono i target manuali delle impostazioni.'
      : "Origine dei target di allocazione: impostati manualmente dall'utente in Impostazioni → Allocazione."
  );
  lines.push('');
  lines.push(...formatPortfolioForPrompt(context.portfolio));
  lines.push(...formatGoalsSection(context.goals ? { ...context.goals, coverage: context.portfolio.goalCoverage } : null));
  return lines.join('\n');
}

export function formatBundleForPrompt(
  bundle: AssistantMonthContextBundle,
  periodLabel: string = getAssistantPeriodLabel(bundle.selector)
): string {
  const { netWorth, cashflow, allocationChanges, dataQuality, currentSnapshot } = bundle;

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

  // Cashflow section. «Entrate» is the figure Cashflow › Tracciamento prints — every income
  // row, dividends and coupons included — with the dividends named inside it (owner's decision,
  // 2026-10-20: the two surfaces printed two different «Entrate» for the same month).
  lines.push('--- CASHFLOW ---');
  lines.push(
    `Entrate: ${eur(cashflow.totalIncome + cashflow.totalDividends)} (di cui dividendi e cedole ${eur(cashflow.totalDividends)}; è lo stesso totale della pagina Cashflow)`
  );
  lines.push(`Uscite: ${eur(cashflow.totalExpenses)}`);
  lines.push(`Flusso netto: ${eur(cashflow.netCashFlow)}`);
  lines.push(
    `Numero transazioni: ${cashflow.transactionCount} (di cui ${cashflow.expenseTransactionCount} di spesa; i trasferimenti fra conti sono esclusi)`
  );
  lines.push('');

  const totalExpenses = cashflow.totalExpenses;
  const shareOfExpenses = (value: number): string =>
    totalExpenses !== 0 ? share((value / totalExpenses) * 100) : share(0);

  // Coarse-grained view first, so the model has the Fisse/Variabili/Debiti mix in mind
  // before it reads the long category list.
  if (bundle.expensesByType.length > 0) {
    lines.push('--- SPESE PER TIPO ---');
    for (const entry of bundle.expensesByType) {
      lines.push(`${entry.label}: ${eur(entry.total)} (${shareOfExpenses(entry.total)})`);
    }
    lines.push('');
  }

  // The exhaustive spending tree. This section replaced a top-5 category list that made
  // the assistant report "N/D" for subcategories it simply had never been sent.
  if (bundle.expensesByCategory.length > 0) {
    lines.push('--- SPESE PER CATEGORIA E SOTTOCATEGORIA (elenco completo del periodo) ---');
    let renderedSubRows = 0;
    let omittedSubRows = 0;
    let omittedSubTotal = 0;

    for (const category of bundle.expensesByCategory) {
      lines.push(
        `${category.categoryName}: ${eur(category.total)} (${txn(category.transactionCount)}, ${shareOfExpenses(category.total)} delle uscite)`
      );
      for (const sub of category.subCategories) {
        if (renderedSubRows >= MAX_SUBCATEGORY_ROWS_IN_PROMPT) {
          omittedSubRows += 1;
          omittedSubTotal += sub.total;
          continue;
        }
        lines.push(`  › ${sub.subCategoryName}: ${eur(sub.total)} (${txn(sub.transactionCount)})`);
        renderedSubRows += 1;
      }
    }

    if (omittedSubRows > 0) {
      lines.push(
        `(${omittedSubRows} sottocategorie minori omesse per brevità, totale ${eur(omittedSubTotal)}; le categorie sopra sono comunque complete)`
      );
    }
    lines.push('');
  }

  // Income by category. Dividends are named inside «Entrate» above and excluded here, so
  // these rows add up to Entrate minus the dividends.
  if (bundle.incomeByCategory.length > 0) {
    lines.push('--- ENTRATE PER CATEGORIA (esclusi i dividendi, già contati in Entrate) ---');
    for (const entry of bundle.incomeByCategory) {
      lines.push(`${entry.categoryName}: ${eur(entry.total)} (${txn(entry.transactionCount)})`);
    }
    lines.push('');
  }

  // Individual outliers — the date and subcategory let Claude tie a spike to one event
  // rather than to a whole category.
  if (bundle.topIndividualExpenses.length > 0) {
    lines.push('--- SPESE SINGOLE PIU\' GRANDI ---');
    for (const exp of bundle.topIndividualExpenses) {
      const category = exp.subCategoryName ? `${exp.categoryName} › ${exp.subCategoryName}` : exp.categoryName;
      const label = exp.notes ? `${category} – ${exp.notes}` : category;
      lines.push(`${exp.date} · ${label}: ${eur(exp.amount)}`);
    }
    lines.push('');
  }

  // The WHOLE patrimony by class at the period's end, from the snapshot — the home, the loans,
  // the pension funds included. Named as such since 2026-10-20: the allocation the Allocazione
  // page measures is the portfolio block's (`formatPortfolioForPrompt`), on a smaller base.
  const byAssetClass = currentSnapshot?.byAssetClass;
  if (byAssetClass && Object.keys(byAssetClass).length > 0) {
    const totalNetWorth = currentSnapshot?.totalNetWorth ?? 0;
    lines.push("--- PATRIMONIO PER CLASSE A FINE PERIODO (snapshot dell'intero patrimonio: casa, debiti e fondi pensione inclusi; NON è la base della pagina Allocazione) ---");
    const entries = Object.entries(byAssetClass).sort((a, b) => b[1] - a[1]);
    for (const [assetClass, value] of entries) {
      const pctOfTotal =
        totalNetWorth > 0 ? ` (${pct((value / totalNetWorth) * 100)})` : '';
      lines.push(`${assetClassLabel(assetClass)}: ${eur(value)}${pctOfTotal}`);
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
        lines.push(`  ${assetClassLabel(assetClass)} › ${subCat}: ${eur(value)}${pctOfTotal}`);
      }
    }
    lines.push('');
  }

  // The portfolio as a whole — instruments, the allocation on the page's base with its targets,
  // the ledger, the registers, the household (2026-10-20). The target-vs-current reading moved
  // in here: until then it stood the manual targets against the snapshot's WHOLE patrimony, a
  // base the Allocazione page never uses. Naming the source still matters: with goal-driven
  // allocation on, the percentages the page measures against come from the goals.
  lines.push(
    bundle.targetAllocationSource === 'goal_driven'
      ? 'Origine dei target di allocazione: derivati dagli obiettivi di investimento (allocazione goal-driven attiva). Non sono i target manuali delle impostazioni.'
      : "Origine dei target di allocazione: impostati manualmente dall'utente in Impostazioni → Allocazione."
  );
  lines.push('');
  lines.push(...formatPortfolioForPrompt(bundle.portfolio));

  // Goal-Based Investing. Always rendered, absence included: a missing section would
  // leave the model unable to tell "the feature is off" from "I was not sent the data",
  // and the data-integrity rules then push it toward an invented "N/D".
  lines.push(...formatGoalsSection(bundle.goals ? { ...bundle.goals, coverage: bundle.portfolio.goalCoverage } : null));

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
      lines.push(`${assetClassLabel(change.assetClass)}: ${prev} → ${curr} | Δ ${abs}${pp}`);
    }
    lines.push('');
  }

  // Full category taxonomy — lets Claude answer "in che categoria segno questa spesa?"
  // or "ha senso creare una nuova categoria?" against what the user has already
  // configured, instead of only the top-5 categories actually used this period.
  if (bundle.expenseCategories.length > 0) {
    lines.push('--- CATEGORIE DI SPESA CONFIGURATE ---');
    for (const category of bundle.expenseCategories) {
      const subLabel = category.subCategories.length > 0 ? ` (sottocategorie: ${category.subCategories.join(', ')})` : '';
      lines.push(`${category.name} [${category.type}]${subLabel}`);
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
  '- Apri con la risposta al punto richiesto, senza premesse',
  '',
  '# Calibrazione del tono',
  '- Evita: "Il patrimonio è cresciuto. Questo è un buon segno per i tuoi investimenti."',
  '- Preferisci: "Il patrimonio è salito di €3.200 (+1,8%), trainato per €2.100 dal versamento mensile e per €1.100 dalla performance di mercato — la componente organica resta modesta questo mese."',
  '- Evita: "Le spese sono aumentate rispetto al mese scorso."',
  "- Preferisci: \"Le uscite sono salite di €340, quasi interamente per la voce Trasporti (+€290) — verifica se è una spesa una tantum o un nuovo livello stabile.\"",
  '',
  '# Categorizzazione spese',
  "Il blocco CATEGORIE DI SPESA CONFIGURATE elenca l'intera tassonomia impostata dall'utente (non solo quelle usate nel periodo). Usalo per rispondere a domande come \"in che categoria segno questa spesa?\" o \"ha senso creare una nuova categoria?\": suggerisci prima una categoria/sottocategoria già esistente se pertinente, e proponi una nuova categoria solo se davvero non c'è una corrispondenza ragionevole.",
  "Il blocco SPESE PER CATEGORIA E SOTTOCATEGORIA è ESAUSTIVO: contiene ogni categoria e ogni sottocategoria con spesa nel periodo, non una classifica dei primi cinque. Quando l'utente chiede il dettaglio di una categoria, elenca le sue sottocategorie leggendole da lì — il dato c'è.",
  "Una sottocategoria che l'utente nomina e che NON compare in quel blocco ha avuto spesa zero nel periodo. Dillo così, \"nessuna spesa registrata\", e non come \"dato non disponibile\": sono due affermazioni diverse e solo la prima è vera. L'unica eccezione è la riga esplicita di omissione in coda al blocco, quando presente.",
  "Non elencare le sottocategorie quando non ti vengono chieste: l'elenco completo serve a rispondere nel dettaglio, non a riempire la risposta.",
  '',
  '# Portafoglio: strumenti, allocazione, registri',
  "Il blocco STRUMENTI IN PORTAFOGLIO OGGI è ESAUSTIVO: ogni strumento posseduto oggi con classe, sottocategoria, ruolo in allocazione, quantità, valore, PMC e G/P (dove misurabili), intestatario e, con il Goal-Based Investing attivo, la quota assegnata agli obiettivi e quella libera («libero da obiettivi» = nessun obiettivo lo tocca). Uno strumento che l'utente nomina e che non compare non è in portafoglio.",
  "Il ruolo in allocazione ha tre valori e li devi usare con questo significato: «negoziabile» entra nella base e nei piani; «non negoziabile» entra nella base (conta nelle percentuali) ma i piani non possono muoverlo (un fondo pensione, un private equity); «escluso» è fuori dalla pagina Allocazione, base compresa (la casa in cui si vive). Un mutuo segue l'immobile che finanzia; un prestito personale è liquidità negativa.",
  "Il blocco ALLOCAZIONE OGGI è la base che la pagina Allocazione misura (negoziabili + non negoziabili, netta dei debiti) e ALLOCAZIONE TARGET vs ATTUALE è calcolato su quella base: quando parli di allocazione, percentuali e scostamenti sono QUESTI. Il blocco PATRIMONIO PER CLASSE A FINE PERIODO è un'altra cosa: l'intero patrimonio fotografato dallo snapshot, casa, debiti e fondi pensione inclusi. Non confrontare mai i target con quest'ultimo.",
  "Il REGISTRO OPERAZIONI e il REGISTRO DIVIDENDI sono esaustivi salvo la riga di omissione esplicita; incassato e annunciato sono due cifre e restano tali. PREVIDENZA, MUTUI E PRESTITI e FAMIGLIA descrivono la situazione di oggi.",
  '',
  '# Obiettivi di investimento (Goal-Based Investing), quando i dati li includono',
  "Quando il messaggio contiene un blocco OBIETTIVI DI INVESTIMENTO, quello elenca gli obiettivi che l'utente ha configurato nella pagina FIRE e Simulazioni: nome, importo target, scadenza, valore già assegnato, contributo mensile pianificato, allocazione consigliata e stato della traiettoria. Sono una cosa diversa dagli obiettivi della memoria persistente: questi hanno numeri e una quota di portafoglio assegnata, quelli sono frasi che l'utente ti ha detto.",
  "L'elenco è ESAUSTIVO. Se il blocco dice che la funzionalità non è attiva, dillo come tale — è una funzionalità opzionale che l'utente non usa, non un dato che ti manca.",
  "Quando un obiettivo è in ritardo, cita il versamento mensile necessario e il valore proiettato alla scadenza che trovi nel blocco: sono già calcolati con la matematica dell'annualità sull'ipotesi di rendimento indicata lì. Non ricavarli moltiplicando contributo per mesi — quel conto ignora i rendimenti e dà un numero più pessimista del vero. Presentali per quello che sono, proiezioni basate su un rendimento ipotizzato, non misure.",
  "Quando consigli un'allocazione per un obiettivo, ragiona su orizzonte temporale e priorità: più la scadenza è vicina, più la quota di strumenti volatili va ridotta a favore di obbligazioni e liquidità; un obiettivo senza scadenza e a bassa priorità tollera molto più rischio. Motiva sempre la proposta con la scadenza e la priorità di QUELL'obiettivo, non con massime generali.",
  '',
  '## Proporre la creazione o la modifica di un obiettivo',
  "Non puoi creare, modificare o eliminare obiettivi da solo: puoi solo PROPORRE, e la scrittura avviene unicamente quando l'utente preme Conferma sulla card che la tua proposta genera.",
  "Quando — e SOLO quando — l'utente ti chiede di creare un obiettivo, o di cambiare uno di quelli esistenti (scadenza, importo, priorità, strumenti e quote), introducilo con una frase che spiega le scelte fatte e poi emetti UN blocco di codice delimitato con linguaggio `goal-proposal` che contenga SOLO JSON valido, senza commenti e senza testo attorno, con questo schema:",
  // The allocation keys come from ASSET_CLASS_SEQUENCE, the app-wide enumeration: a hand-written
  // list is how the model stopped being told trendFollowing and carry exist, while
  // `goalProposal.ts` had been accepting all eight all along.
  `{ "goalId"?: string, "name": string, "targetAmount"?: number, "targetDateIso"?: "YYYY-MM-DD", "priority": "alta" | "media" | "bassa", "monthlyContribution"?: number, "recommendedAllocation"?: { ${ASSET_CLASS_SEQUENCE.map((cls) => `"${cls}"?: number`).join(', ')} }, "assignments"?: [ { "assetName": string, "percentage": number } ], "notes"?: string }`,
  "Vincoli: `name` e `priority` sono obbligatori; gli importi sono in euro, senza separatori né simbolo di valuta; le percentuali di `recommendedAllocation` devono sommare esattamente a 100. Per MODIFICARE un obiettivo esistente metti in `goalId` l'id che il blocco OBIETTIVI stampa accanto al suo nome e ricopia nei campi i valori nuovi E quelli che restano (il blocco sostituisce l'obiettivo intero); senza `goalId` la card crea un obiettivo nuovo. `assignments` lega strumenti POSSEDUTI al nome ESATTO del blocco STRUMENTI, ciascuno con la quota in percento dello strumento (la quota libera di ogni strumento è scritta nella sua riga: non superarla); su una modifica sostituisce le quote dell'obiettivo, se lo ometti restano quelle di oggi. Un solo blocco per risposta. Non emetterlo mai se l'utente non ha chiesto di creare o cambiare un obiettivo: per discuterne basta il testo.",
  '',
  '# Casi limite',
  "- Periodo ancora in corso (mese/anno corrente, YTD): i dati sono parziali per definizione — evidenzia le tendenze osservate finora, non presentarle come il risultato finale del periodo",
  '- Asset venduti: sono esclusi dal calcolo di YOC e Current Yield per quell\'asset — non è un dato mancante, è per design',
  "- Se l'utente non ha configurato target di allocazione o memoria persistente, non trattarlo come un'anomalia da segnalare: sono funzionalità opzionali",
].join('\n');

// ─── Per-mode format contracts (static per mode, cacheable) ──────────────────
//
// The output budget lives in anthropicStream.ts (`max_tokens` covers thinking AND text
// under adaptive thinking): whatever length a contract asks for must fit inside it.
// A question like "break Casa down by subcategory, then add these five categories"
// needs room for exactly the enumeration that was asked for.

const MONTH_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  '1. **In sintesi** — 2-3 frasi sul risultato complessivo del mese',
  '2. **Cosa ha mosso il patrimonio** — i principali driver (mercato, cashflow, allocazione)',
  "3. **1-2 azioni o attenzioni** — osservazioni pratiche per l'investitore",
  '',
  'Lunghezza: quella che le tre sezioni richiedono, nello stile di risposta indicato nel messaggio.',
].join('\n');

const YEAR_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  "1. **In sintesi** — 2-3 frasi sul risultato complessivo dell'anno",
  "2. **Cosa ha mosso il patrimonio nell'anno** — i principali driver (mercato, cashflow, allocazione, eventi); se l'anno è ancora in corso, precisa che sono i driver osservati finora",
  "3. **1-2 azioni o attenzioni** — osservazioni pratiche per l'investitore",
  '',
  'Lunghezza: quella che le tre sezioni richiedono, nello stile di risposta indicato nel messaggio.',
].join('\n');

const YTD_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  '1. **In sintesi** — 2-3 frasi sul risultato YTD',
  "2. **Cosa ha mosso il patrimonio da inizio anno** — principali driver osservati finora",
  '3. **1-2 azioni o attenzioni** — osservazioni pratiche',
  '',
  "Non proiettare valori annualizzati salvo esplicita richiesta dell'utente — il periodo è per definizione parziale.",
].join('\n');

const HISTORY_FORMAT_CONTRACT = [
  '# Formato della risposta',
  'Struttura la risposta in tre sezioni markdown:',
  "1. **In sintesi** — 2-3 frasi sull'evoluzione complessiva del patrimonio nel periodo",
  '2. **Trend storici principali** — cashflow cumulativo, crescita patrimonio, composizione del portafoglio nel tempo',
  '3. **1-2 osservazioni strategiche** — cosa emerge dal lungo periodo, opportunità o rischi strutturali',
  '',
  'Privilegia la visione di lungo periodo rispetto ai dettagli di un singolo mese.',
].join('\n');

const CHAT_FORMAT_CONTRACT = [
  '# Formato della risposta',
  "Modalità conversazionale: nessuna struttura fissa a sezioni. Rispondi direttamente alla domanda, usando i dati forniti quando disponibili e restando comunque entro le regole sui dati e lo stile definiti sopra.",
].join('\n');

// The period named in the length line. A quarter carries three months of causes to explain
// and a year twelve, against the same six sections, so the length follows the period.
// WARNING: the keys must stay in step with `EmailPeriodType` in monthlyEmailService.ts —
// the two unions are structurally identical and nothing but this comment says so
// (prompts.ts must not import that module, which pulls firebase-admin and Resend).
export type EmailPeriodicPeriodType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

const EMAIL_PERIOD_SCOPE: Record<EmailPeriodicPeriodType, string> = {
  monthly: 'un mese',
  quarterly: 'un trimestre',
  semiannual: 'un semestre',
  yearly: 'un anno',
};

/**
 * Format contract for the periodic summary email (monthly/quarterly/semiannual/yearly
 * AI comment). Exported so monthlyEmailService.ts can compose it with ASSISTANT_SYSTEM_CORE
 * without duplicating the shared role/domain/guardrail text.
 *
 * Parametric in the period type ONLY, so the returned string is still byte-identical
 * across every user and every run of a given period — the same property the mode
 * contracts have. Everything genuinely per-request (baseline labels, whether the YoY
 * comparison coincides with the previous-period one, which blocks are present) lives in
 * the numeric data block instead, which is why the sections below are worded to cover
 * both shapes without branching.
 */
export function buildEmailPeriodicFormatContract(periodType: EmailPeriodicPeriodType): string {
  return [
    '# Formato della risposta',
    'Struttura la risposta in markdown con queste sezioni, in questo ordine:',
    '1. **In sintesi** — 2-3 frasi sul risultato complessivo del periodo; se i dati includono un piazzamento Hall of Fame, citalo (non inventare la posizione)',
    "2. **Patrimonio e investimenti** — come si è mosso il patrimonio: usa la riga EFFETTO MERCATO già calcolata per separare quanto viene dal risparmio e quanto dalla variazione di mercato, commenta l'allocazione corrente e il suo scostamento dai target quando sono configurati, e cita gli obiettivi di investimento solo se il blocco relativo ne contiene",
    '3. **Rispetto al periodo precedente** — cosa è cambiato rispetto al periodo precedente, citando i numeri del blocco di confronto fornito',
    "4. **Confronto con l'anno precedente** — confronto anno su anno citando i numeri forniti; se il periodo è annuale e questo confronto coincide con quello del punto 3 (i dati te lo segnalano esplicitamente), unisci le due sezioni e dillo",
    "5. **Entrate e spese: di quanto e perché** — quantifica l'aumento o la diminuzione di entrate e spese e ipotizza le cause più probabili basandoti sui dati per categoria e sottocategoria; commenta il mix per tipo (Fisse/Variabili/Debiti) quando rilevante",
    "6. **Azioni o attenzioni** — 1-2 osservazioni pratiche per l'investitore",
    '',
    "I blocchi delle spese per categoria e sottocategoria e delle entrate per categoria sono ESAUSTIVI: una voce che non c'è ha avuto importo zero nel periodo — dillo come \"nessuna spesa registrata\", non come dato mancante. L'unica eccezione sono le righe di omissione dichiarate esplicitamente nel testo dei dati.",
    '',
    `Lunghezza: quella che serve a spiegare le cause di ${EMAIL_PERIOD_SCOPE[periodType]}; chi legge scorre un'email, quindi ogni frase porta un numero o una causa.`,
  ].join('\n');
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

/**
 * Builds the system + user content sent to Claude for a month analysis.
 *
 * `system` (role, domain, guardrails, month output contract) is identical across
 * every request of this mode, so it is cacheable. `userContent` carries
 * the period label, numeric bundle, memory, and the user's question.
 */
export function buildMonthAnalysisPrompt(
  bundle: AssistantMonthContextBundle,
  userPrompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = [],
  cashflowBlock?: string
): AssistantPromptParts {
  const monthLabel = getAssistantPeriodLabel(bundle.selector);
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
    ...formatCashflowBlockSection(cashflowBlock),
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${MONTH_FORMAT_CONTRACT}`, userContent };
}

/**
 * The note over the CASHFLOW 12 MESI block (lib/utils/cashflowBlock.ts), the same on every surface that
 * carries it — every mode of the Assistente and the emails' AI comments (since 2026-11-07): the
 * block is the whole recorded history whatever the period in question, so a period's figures stay its
 * bundle's. In `userContent`, never in `system`.
 */
const CASHFLOW_BLOCK_NOTE = "Il blocco CASHFLOW 12 MESI qui sotto è il cashflow di tutta la storia registrata fino a oggi, qualunque sia il periodo in esame: le cifre di un periodo vengono dai blocchi del periodo; usalo per l'andamento recente, la capacità di risparmio e la sua stabilità, gli impegni ricorrenti e i conti.";

/** The note, the block and a blank line — or nothing without a block. */
export function formatCashflowBlockSection(cashflowBlock?: string | null): string[] {
  return cashflowBlock ? [CASHFLOW_BLOCK_NOTE, cashflowBlock, ''] : [];
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
  memoryItems: AssistantMemoryItem[] = [],
  cashflowBlock?: string
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
    ? `Il ${yearLabel} è ancora in corso. I dati cashflow e patrimoniali sono parziali. Non trarre conclusioni definitive sull'anno — evidenzia le tendenze finora visibili.`
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
    ...formatCashflowBlockSection(cashflowBlock),
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
  memoryItems: AssistantMemoryItem[] = [],
  cashflowBlock?: string
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
    `Stai analizzando il periodo YTD (da inizio ${yearLabel} a oggi). L\'anno è in corso — i dati sono parziali. Non trarre conclusioni finali sull\'anno.`,
    '',
    'Di seguito trovi i dati finanziari YTD, estratti in modo affidabile dal sistema:',
    '',
    numericBlock,
    ...formatCashflowBlockSection(cashflowBlock),
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
  memoryItems: AssistantMemoryItem[] = [],
  cashflowBlock?: string
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
    ...formatCashflowBlockSection(cashflowBlock),
    `Domanda dell'utente: ${userPrompt.trim()}`,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${HISTORY_FORMAT_CONTRACT}`, userContent };
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
  contextBundle?: AssistantMonthContextBundle | null,
  todayContext?: AssistantTodayContext | null,
  cashflowBlock?: string | null
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
  } else if (todayContext) {
    // No period, but the portfolio of today (2026-10-20): instruments, allocation, registers, goals.
    userSections.push(
      "Di seguito trovi il portafoglio di oggi dell'utente, senza un periodo selezionato. Usalo per rispondere alla domanda — non è richiesta una struttura fissa.",
      '',
      formatTodayContextForPrompt(todayContext),
    );
  } else {
    // No month selected: remind Claude it has no portfolio numbers
    const noDataNote = monthLabel
      ? `Il contesto selezionato è ${monthLabel}, ma non sono disponibili dati numerici.`
      : 'Non è stato selezionato un periodo di riferimento. Rispondi in modo generale senza inventare numeri.';
    userSections.push(noDataNote);
  }

  // The CASHFLOW 12 MESI block, with or without a period (2026-11-07).
  if (cashflowBlock) userSections.push('', ...formatCashflowBlockSection(cashflowBlock).slice(0, 2));
  userSections.push('', `Richiesta utente: ${prompt.trim()}`);

  return {
    system: `${ASSISTANT_SYSTEM_CORE}\n\n${CHAT_FORMAT_CONTRACT}`,
    userContent: userSections.join('\n'),
  };
}

/**
 * The Registra mode's contract (2026-11): the ```expense-proposal and ```assistant-question protocols,
 * the four kinds of row, the WHEN rules and the memory-off answer, in THIS mode's `system` only. `ASSISTANT_SYSTEM_CORE` is shared with every other mode and with the emails, which must
 * never be told a row can be proposed — so the contract is appended here and nowhere else, and it
 * switches the core's goal protocol off for the mode. Static: every id, name and figure the model
 * copies is in `userContent` (the register block), so the system stays byte-identical per mode.
 * The schemas are `expenseProposalSchema` (lib/utils/expenseProposal.ts) and the question's
 * (lib/utils/questionSet.ts, through lib/utils/assistantQuestionBlocks.ts): a block that breaks
 * its schema renders as code.
 */
export const REGISTER_CONTRACT = [
  '# Modalità Registra',
  "In questa modalità l'utente ti dice cosa ha speso, incassato, spostato fra i suoi conti o pagato a rata e tu gli proponi la riga da registrare nel Cashflow. Non puoi scrivere nulla da solo: puoi solo PROPORRE, e la riga viene scritta unicamente quando l'utente preme Conferma sulla card che la tua proposta genera.",
  '',
  '## La proposta di una riga',
  `Per ogni riga emetti un blocco di codice delimitato con linguaggio \`${EXPENSE_PROPOSAL_LANGUAGE}\` che contenga SOLO JSON valido, senza commenti e senza testo attorno, con questo schema:`,
  '{ "kind": "expense" | "income" | "transfer" | "debt", "type": "fixed" | "variable" | "income" | "transfer" | "debt", "amount": number, "dateIso": "YYYY-MM-DD", "categoryId"?: string, "subCategoryId"?: string, "accountId"?: string, "fromAccount"?: string, "toAccount"?: string, "loanName"?: string, "payoff"?: boolean, "fee"?: { "amount": number }, "recurring"?: { "frequency": "monthly" | "yearly", "count": number, "day"?: number }, "newCategory"?: { "name": string, "type": "fixed" | "variable" | "income" | "debt" }, "newSubCategory"?: { "categoryId": string, "name": string }, "costCenterId"?: string, "memberId"?: string, "excludeFromBudget"?: boolean, "note"?: string, "reason": string }',
  'Vincoli:',
  `- Un blocco per ogni riga che l'utente nomina, al massimo ${EXPENSE_PROPOSALS_MAX_PER_MESSAGE} per messaggio: se ne nomina di più, proponi le prime ${EXPENSE_PROPOSALS_MAX_PER_MESSAGE} e scrivi “Ne restano N: vuoi che continui?”.`,
  '- Ogni blocco sta su righe sue, fuori da elenchi e citazioni.',
  '- `amount` è un numero JSON in euro con il punto decimale, senza separatori di migliaia né simbolo, sempre positivo (al massimo 1000000): il segno lo dà il tipo. Senza importo non emettere il blocco: chiedilo in prosa.',
  '- Gli id (`categoryId`, `subCategoryId`, `accountId`, `costCenterId`, `memberId`) si copiano dai blocchi CATEGORIE, CONTI, CENTRI DI COSTO e INTESTATARI, dove stanno fra parentesi quadre: mai inventati, mai il nome al posto dell\'id. Solo `fromAccount`, `toAccount` e `loanName` ammettono il nome come lo dice l\'utente, quando l\'[id] non c\'è.',
  '- Scegli una categoria del tipo della riga e copia il suo tipo: `type` è "fixed" per Spese Necessarie, "variable" per Spese Non Necessarie, "income" per Entrate, "debt" per Debiti; un trasferimento non ha bisogno di `categoryId` (la categoria la sceglie l\'app). Segui il modo di categorizzare dell\'utente nelle ULTIME RIGHE e scrivi in `reason` quali righe hai seguito. `subCategoryId` solo se la sottocategoria è della categoria scelta.',
  "- Il conto è quello che l'utente nomina o sceglie rispondendo a una domanda \"account:\" (il suo [id]); se non lo nomina e QUANDO CHIEDERE non dice di chiederlo, è il predefinito del tipo (addebito per una spesa e per una rata, accredito per un'entrata): ometti `accountId`.",
  '- La data è oggi, salvo che l\'utente dica altro: risolvi “ieri”, “lunedì scorso” dalla data di oggi stampata nel blocco REGISTRA; una data futura è ammessa.',
  "- `costCenterId` e `memberId` solo se il loro blocco è attivo e l'utente li nomina o li sceglie rispondendo a una domanda; `excludeFromBudget` su una spesa o una rata quando QUANDO CHIEDERE lo applica.",
  '- `note` (al massimo 200 caratteri) è la nota della riga: il negozio o il dettaglio che l\'utente ha detto. `reason` (obbligatorio, al massimo 240 caratteri) spiega in una frase la categoria scelta.',
  "- Le righe proposte nei messaggi precedenti l'utente le ha già confermate o ignorate: non riproporle, salvo che te lo chieda.",
  '',
  '## Attorno alle proposte',
  'Scrivi poco, qualunque sia lo stile di risposta indicato nel messaggio: una frase prima dei blocchi, poi i blocchi. Dopo i blocchi scrivi solo ciò che serve all\'utente per decidere: una riga che non hai proposto e perché, e al massimo una frase sul budget della categoria presa da IL MESE, senza inventare cifre.',
  'Niente sezioni con titolo (ipotesi, dati del mese, limiti dei dati) e nessun elenco di ciò che hai dato per scontato: ciò che la card già mostra (data, conto, categoria) non si ripete in prosa.',
  'Non dire quante righe hai letto né che le ULTIME RIGHE sono tagliate, salvo che l\'utente chieda di una riga che non trovi.',
  'Un dubbio vero su categoria, conto, immobile, intestatario o prestito si chiede con un blocco \`\`\`assistant-question in un messaggio SENZA proposte, mai con una domanda in prosa sotto le card.',
  'Non proporre mai una riga con una categoria sbagliata.',
  'In questa modalità non proporre obiettivi.',
  '',
  '## Tipi di riga, domande e memoria',
  'TIPI DI RIGA: "kind" è "expense" (type "fixed" o "variable"), "income" (type "income"), "transfer" (type "transfer") o "debt" (type "debt").',
  'Un trasferimento sposta soldi fra due conti, o fra un conto e un immobile: scrivi "fromAccount" e "toAccount" con l\'[id] dei blocchi CONTI o IMMOBILI (o il nome come lo dice l\'utente), mai "accountId"; un immobile sta su un lato solo. Se l\'utente non nomina uno dei due lati, chiedilo.',
  'Una rata di mutuo o di prestito ha kind "debt" e "loanName" con l\'[id] o il nome del blocco PRESTITI; con due o più prestiti e un nome che non li distingue, chiedi «Quale prestito?» con una domanda "loan:"; una rata che non ripaga un prestito del blocco si propone senza "loanName"; "payoff": true solo per un\'estinzione anticipata.',
  `Le entrate e i trasferimenti non si ripetono: una serie ("recurring") è solo per spese e rate, al più ${MAX_RECURRENCE_OCCURRENCES.monthly} occorrenze mensili o ${MAX_RECURRENCE_OCCURRENCES.yearly} annuali; un'estinzione anticipata è una riga sola.`,
  'Una commissione si scrive "fee": { "amount" } sulla riga che la paga; la sua categoria è quella di Impostazioni: non sceglierla.',
  'Proponi una categoria nuova SOLO se nessuna esistente si adatta, e preferisci una sottocategoria sotto una categoria esistente; segui il modo di categorizzare dell\'utente (le righe recenti, le regole in memoria). Si scrive "newSubCategory": { "categoryId", "name" } con "categoryId" uguale a quello della riga, oppure "newCategory": { "name", "type" } senza "categoryId"; mai una categoria nuova di tipo "transfer".',
  'L\'ordine è: ciò che l\'utente dice in questo messaggio, poi le regole di categorizzazione in memoria, poi lo storico delle righe recenti.',
  'QUANDO CHIEDERE: chiedi il conto solo se l\'utente non l\'ha nominato E (non c\'è un conto predefinito per quel tipo O il conto più usato della categoria copre meno dell\'80% delle sue righe). Chiedi l\'intestatario solo se la Divisione è attiva e almeno il 50% delle righe della categoria è personale. Applica «fuori budget» se l\'utente lo dice o se almeno il 50% delle righe della categoria lo è: non chiederlo mai. Chiedi il centro di costo solo se i centri sono attivi e almeno una riga della categoria negli ultimi 12 mesi sta in un centro. Le percentuali sono quelle del blocco PATTERN.',
  'Se l\'importo arriva senza oggetto, chiedi «Di cosa si tratta?» con 2-4 categorie probabili e "allowOther": true. Non chiedere mai ciò che il messaggio, la memoria o le righe recenti già dicono.',
  'DOMANDE: una domanda è un blocco \`\`\`assistant-question con UN oggetto JSON { "id", "kind": "single", "text", "options": [{ "value", "label" }], "allowOther" }, alla fine del messaggio. L\'"id" di una domanda su conti, centri, intestatari, prestiti o categorie comincia con "account:", "center:", "member:", "loan:" o "category:" ("account:from" e "account:to" per i due lati di un trasferimento); i "value" sono gli [id] dei blocchi (per una categoria l\'[id] della sottocategoria, o della categoria se non ne ha). Su conti, centri, intestatari e prestiti al più 3 opzioni, le più probabili secondo il blocco PATTERN, e "allowOther": true; non scrivere mai un\'opzione «Altro»: la riga «Altro…» è della card.',
  `Al più ${EXPENSE_PROPOSALS_MAX_PER_MESSAGE} blocchi \`\`\`expense-proposal o al più ${ASSISTANT_QUESTION_MAX_PER_MESSAGE} blocchi \`\`\`assistant-question per messaggio, mai i due tipi nello stesso messaggio, mai un \`\`\`goal-proposal in questa modalità: prima chiedi, poi proponi.`,
  'La risposta dell\'utente arriva come un messaggio con una riga per domanda, «{domanda} → {scelta} [id]»: usa l\'[id] fra parentesi quadre e riproponi la riga intera, senza chiedere di nuovo ciò che è stato risposto.',
  'Se il blocco memoria dice «memoria disattivata» e l\'utente detta una regola, rispondi: «non posso ricordarlo: la memoria è spenta ("Apprendimento automatico" nelle Preferenze dell\'Assistente)».',
].join('\n');

/** Registra's memory line when the memory is on and holds nothing active yet. */
export const REGISTER_MEMORY_EMPTY_LINE = 'Memoria: attiva, nessuna regola salvata.';

/**
 * Builds the prompt of the Registra mode: the register block (ids, recent rows, the month so far)
 * and the CASHFLOW 12 MESI block under its note, both in `userContent`.
 */
export function buildRegisterPrompt(
  prompt: string,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[],
  registerBlock: string,
  cashflowBlock: string | null
): AssistantPromptParts {
  // Memory on and still empty says so: with no line at all the model could not tell it from memory
  // off, and answered a first rule «non posso confermarti che resti salvata» (the owner's tour, 2026-11-11).
  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems) || REGISTER_MEMORY_EMPTY_LINE
    : // The contract names this sentence: the model answers a rule it cannot keep (2026-11).
      'Memoria: memoria disattivata.';

  const userSections: string[] = [
    buildResponseStyleInstruction(preferences.responseStyle),
    memoryBlock,
    '',
    registerBlock,
  ];
  if (cashflowBlock) userSections.push('', ...formatCashflowBlockSection(cashflowBlock).slice(0, 2));
  userSections.push('', `Richiesta utente: ${prompt.trim()}`);

  return {
    system: `${ASSISTANT_SYSTEM_CORE}\n\n${REGISTER_CONTRACT}`,
    userContent: userSections.join('\n'),
  };
}
