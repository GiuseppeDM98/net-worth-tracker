/**
 * The words of Impostazioni: the one-line reading under each settings tile.
 *
 * The page has NO verdict — it is a form, not a measurement — but it keeps the tile cadence:
 * every group of settings states its CURRENT state in one rule-generated sentence, and every
 * reading declares the downstream effect of the group («guidano l'auto-calcolo dei target»,
 * «il salvataggio è bloccato»), because a setting the reader cannot place is a setting they
 * will not trust. Each phrasing is pinned by __tests__/settingsNarrative.test.ts.
 *
 * The Narrative Honesty Rule holds: a missing input drops its clause (no risk-free rate → no
 * rate clause, and the sentence says what stalls without it), the applicative INPS default is
 * NAMED as a default rather than shown as a choice, and the RITA unlock age is never derived
 * here — it comes from `resolveRitaUnlockAge`, the app's single unlock rule.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals); currency through
 * `cachedFormatCurrencyEUR` (nbsp before €, four-digit amounts ungrouped).
 */

import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { resolveRitaUnlockAge, DEFAULT_INPS_RETIREMENT_AGE } from '@/lib/utils/pensionUnlock';
import { MONTH_NAMES } from '@/lib/constants/months';
import type { ExpenseType } from '@/types/expenses';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** A whole euro figure, compact (no cents) — settings readings never need cents. */
const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

/** A percentage with only the decimals the value carries: 100 → «100%», 3,5 → «3,5%». */
function pctTrim(value: number): string {
  const decimals = value % 1 === 0 ? 0 : (value * 10) % 1 === 0 ? 1 : 2;
  return formatPercentage(value, decimals);
}

/** A plain number with only the decimals it carries («7,5», «34»). */
function numTrim(value: number): string {
  const decimals = value % 1 === 0 ? 0 : (value * 10) % 1 === 0 ? 1 : 2;
  return formatNumber(value, decimals);
}

/** «X», «X e Y», «X, Y e Z» — the Italian list join. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** 'YYYY-MM' → «novembre 2025». */
function monthYearInSentence(isoMonth: string): string {
  const [year, month] = isoMonth.split('-').map((part) => Number.parseInt(part, 10));
  return `${MONTH_NAMES[month - 1].toLowerCase()} ${year}`;
}

// ─── Preferenze ───────────────────────────────────────────────────────────────

export interface ProfileInput {
  userAge?: number;
  riskFreeRate?: number;
}

/** Profilo — age and risk-free rate, with what they feed downstream. */
export function describeProfile({ userAge, riskFreeRate }: ProfileInput): Narrative {
  if (userAge !== undefined && riskFreeRate !== undefined) {
    return [
      prose('Hai '),
      figure(String(userAge)),
      prose(' anni e un risk-free al '),
      figure(pctTrim(riskFreeRate)),
      prose(": guidano l'auto-calcolo dei target e le metriche di rischio di Rendimenti."),
    ];
  }
  if (userAge !== undefined) {
    return [
      prose('Hai '),
      figure(String(userAge)),
      prose(" anni; senza il risk-free rate l'auto-calcolo dei target non parte."),
    ];
  }
  if (riskFreeRate !== undefined) {
    return [
      prose('Risk-free al '),
      figure(pctTrim(riskFreeRate)),
      prose("; senza l'età l'auto-calcolo dei target non parte."),
    ];
  }
  return [
    prose(
      "Età e risk-free rate non sono impostati: servono all'auto-calcolo dei target e alle metriche di rischio di Rendimenti."
    ),
  ];
}

export interface PerformanceBaseInput {
  includesPensionFunds: boolean;
  includesExcludedAssets: boolean;
  /** ISO 'YYYY-MM'; empty string = start from the first recorded contribution. */
  pensionReturnStartMonth: string;
}

/** Calcolo dei rendimenti — which capital the metrics measure, and since when the fund's return exists. */
export function describePerformanceBase({
  includesPensionFunds,
  includesExcludedAssets,
  pensionReturnStartMonth,
}: PerformanceBaseInput): Narrative {
  let base: string;
  if (!includesPensionFunds && !includesExcludedAssets) {
    base = 'Base gestita: fondi pensione e asset esclusi restano fuori';
  } else if (includesPensionFunds && !includesExcludedAssets) {
    base = 'Base allargata ai fondi pensione (i versamenti pesano nel rendimento); gli asset esclusi restano fuori';
  } else if (!includesPensionFunds && includesExcludedAssets) {
    base = 'Base allargata agli asset esclusi (la casa ferma abbassa la volatilità); i fondi pensione restano fuori';
  } else {
    base = 'Base completa: fondi pensione e asset esclusi contano nelle metriche';
  }
  const monthClause = pensionReturnStartMonth
    ? `; il rendimento del fondo si misura da ${monthYearInSentence(pensionReturnStartMonth)}.`
    : '; il rendimento del fondo si misura dal primo versamento registrato.';
  return [prose(base), prose(monthClause)];
}

/** For checking accounts the stamp duty applies only above this balance (Italian rule). */
const STAMP_DUTY_CHECKING_THRESHOLD = 5000;

export interface CostsInput {
  stampDutyEnabled: boolean;
  stampDutyRate: number;
  /** Cash subcategory name, or the '__none__' sentinel / empty when unset. */
  checkingAccountSubCategory: string;
}

/** Costi — the stamp duty and where its checking-account threshold applies. */
export function describeCosts({ stampDutyEnabled, stampDutyRate, checkingAccountSubCategory }: CostsInput): Narrative {
  if (!stampDutyEnabled) {
    return [prose('Imposta di bollo spenta: non entra nel costo annuo del portafoglio.')];
  }
  const hasSubCategory = checkingAccountSubCategory !== '' && checkingAccountSubCategory !== '__none__';
  const head: Narrative = [
    prose('Bollo allo '),
    figure(pctTrim(stampDutyRate)),
    prose(' attivo: entra nel costo annuo del portafoglio; '),
  ];
  if (hasSubCategory) {
    return [
      ...head,
      prose(`per i conti in ${checkingAccountSubCategory} vale solo oltre `),
      figure(euro(STAMP_DUTY_CHECKING_THRESHOLD)),
      prose('.'),
    ];
  }
  return [
    ...head,
    prose('senza la sottocategoria dei conti correnti, la soglia dei '),
    figure(euro(STAMP_DUTY_CHECKING_THRESHOLD)),
    prose(' non si applica.'),
  ];
}

export interface FireTogglesInput {
  includePrimaryResidenceInFIRE: boolean;
  goalBasedInvestingEnabled: boolean;
  goalDrivenAllocationEnabled: boolean;
}

/** FIRE e obiettivi — the three toggles this page owns. */
export function describeFireToggles({
  includePrimaryResidenceInFIRE,
  goalBasedInvestingEnabled,
  goalDrivenAllocationEnabled,
}: FireTogglesInput): Narrative {
  const house = includePrimaryResidenceInFIRE
    ? 'La casa è dentro il patrimonio FIRE'
    : 'La casa resta fuori dal patrimonio FIRE';
  const goals = !goalBasedInvestingEnabled
    ? '; obiettivi di investimento spenti.'
    : goalDrivenAllocationEnabled
      ? '; obiettivi attivi e target di allocazione derivati dagli obiettivi.'
      : '; obiettivi attivi, con target di allocazione manuali.';
  return [prose(house), prose(goals)];
}

export interface PlanParametersInput {
  withdrawalRate?: number;
  plannedAnnualExpenses?: number;
  pensionInpsRetirementAge?: number;
  pensionRitaLongUnemployment: boolean;
  respectPensionLockInFire: boolean;
}

/**
 * Parametri del piano — the read-only declaration of the FIRE parameters owned by the FIRE
 * pages. The INPS default is named as such; the RITA age comes from the app's one unlock rule.
 */
export function describePlanParameters(input: PlanParametersInput): Narrative {
  const { withdrawalRate, plannedAnnualExpenses, pensionInpsRetirementAge, pensionRitaLongUnemployment } = input;
  if (withdrawalRate === undefined && plannedAnnualExpenses === undefined) {
    return [
      prose('Nessun parametro salvato: SWR e spese si impostano da FIRE › Calcolatore, età INPS e RITA da Coast FIRE.'),
    ];
  }

  const segments: Narrative = [];
  if (withdrawalRate !== undefined) {
    segments.push(prose('SWR al '), figure(pctTrim(withdrawalRate)));
    if (plannedAnnualExpenses !== undefined) {
      segments.push(prose(' e spese per '), figure(euro(plannedAnnualExpenses)), prose(" l'anno"));
    }
  } else if (plannedAnnualExpenses !== undefined) {
    segments.push(prose('Spese per '), figure(euro(plannedAnnualExpenses)), prose(" l'anno"));
  }

  const inpsAge = pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  const inpsIsDefault = pensionInpsRetirementAge === undefined;
  const ritaAge = resolveRitaUnlockAge({ pensionInpsRetirementAge, pensionRitaLongUnemployment });
  segments.push(
    prose('; pensione INPS a '),
    figure(String(inpsAge)),
    prose(` anni${inpsIsDefault ? ' (predefinita)' : ''}, RITA a `),
    figure(String(ritaAge)),
    prose(' anni')
  );

  if (input.respectPensionLockInFire) {
    segments.push(prose('; il fondo pensione vincolato resta fuori dal FIRE fino allo sblocco.'));
  } else {
    segments.push(prose('.'));
  }
  return segments;
}

export interface AssistantPreferencesInput {
  responseStyle?: 'balanced' | 'concise' | 'deep';
  memoryEnabled?: boolean;
  macroContextEnabled?: boolean;
}

const ASSISTANT_STYLE_WORDS: Record<'balanced' | 'concise' | 'deep', string> = {
  balanced: 'Risposte bilanciate',
  concise: 'Risposte concise',
  deep: 'Risposte approfondite',
};

/**
 * Assistente — the mirror the assistant syncs into the settings doc on every preference save.
 * A field never synced drops its clause; with nothing synced the reading says where the truth
 * lives instead of guessing defaults the memory document may contradict.
 */
export function describeAssistantPreferences({
  responseStyle,
  memoryEnabled,
  macroContextEnabled,
}: AssistantPreferencesInput): Narrative {
  const clauses: string[] = [];
  if (responseStyle !== undefined) clauses.push(ASSISTANT_STYLE_WORDS[responseStyle]);
  if (memoryEnabled !== undefined) clauses.push(memoryEnabled ? 'apprendimento attivo' : 'apprendimento spento');
  if (macroContextEnabled !== undefined) clauses.push(macroContextEnabled ? 'ricerca web attiva' : 'ricerca web spenta');
  if (clauses.length === 0) {
    return [prose('Preferenze non ancora sincronizzate: si leggono e modificano accanto alla conversazione.')];
  }
  const sentence = clauses.join(', ');
  return [prose(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`)];
}

export interface CashflowSettingsInput {
  laborCategoryNames: string[];
  historyStartYear: number;
  costCentersEnabled: boolean;
}

/** Cashflow — labor income categories, the history floor, cost centers. */
export function describeCashflowSettings({
  laborCategoryNames,
  historyStartYear,
  costCentersEnabled,
}: CashflowSettingsInput): Narrative {
  const segments: Narrative = [];
  if (laborCategoryNames.length === 0) {
    segments.push(prose('Nessuna categoria conta come reddito da lavoro'));
  } else if (laborCategoryNames.length === 1) {
    segments.push(prose(`${laborCategoryNames[0]} conta come reddito da lavoro`));
  } else if (laborCategoryNames.length === 2) {
    segments.push(prose(`${joinNames(laborCategoryNames)} contano come reddito da lavoro`));
  } else {
    const extra = laborCategoryNames.length - 2;
    segments.push(
      prose(`${laborCategoryNames[0]}, ${laborCategoryNames[1]} e `),
      figure(String(extra)),
      prose(` ${extra === 1 ? 'altra contano' : 'altre contano'} come reddito da lavoro`)
    );
  }
  segments.push(
    prose('; lo storico parte dal '),
    figure(String(historyStartYear)),
    prose(costCentersEnabled ? '; Centri di Costo attivi.' : '; Centri di Costo spenti.')
  );
  return segments;
}

export interface FamilyInput {
  members: { name: string; grossAnnualIncome?: number }[];
}

/** Famiglia — one clause per member, because the IRPEF ceiling is per taxpayer. */
export function describeFamily({ members }: FamilyInput): Narrative {
  if (members.length === 0) {
    return [prose('Nessun membro: i fondi pensione restano in Previdenza senza il calcolo del beneficio fiscale.')];
  }
  const segments: Narrative = [prose('Il beneficio fiscale di Previdenza si calcola per persona: ')];
  members.forEach((member, index) => {
    if (index > 0) segments.push(prose(index === members.length - 1 ? ' e ' : ', '));
    if (member.grossAnnualIncome !== undefined) {
      segments.push(prose(`${member.name} (RAL `), figure(euro(member.grossAnnualIncome)), prose(')'));
    } else {
      segments.push(prose(`${member.name} (senza RAL)`));
    }
  });
  segments.push(prose('.'));
  return segments;
}

export interface EmailsInput {
  monthly: boolean;
  quarterly: boolean;
  semiAnnual: boolean;
  yearly: boolean;
  weeklyBudget: boolean;
  recipientCount: number;
}

/** Email periodiche — which reports go out, to how many inboxes. */
export function describeEmails(input: EmailsInput): Narrative {
  const active: string[] = [];
  if (input.monthly) active.push('mensile');
  if (input.quarterly) active.push('trimestrale');
  if (input.semiAnnual) active.push('semestrale');
  if (input.yearly) active.push('annuale');
  if (input.weeklyBudget) active.push('budget settimanale');
  if (active.length === 0) {
    return [prose('Nessun report attivo: nessuna email in partenza.')];
  }
  const head = `Report ${joinNames(active)} ${active.length === 1 ? 'attivo' : 'attivi'}`;
  if (input.recipientCount === 0) {
    return [prose(`${head}, ma senza destinatari: aggiungi un indirizzo o non parte nulla.`)];
  }
  return [
    prose(`${head}, verso `),
    figure(String(input.recipientCount)),
    prose(` ${input.recipientCount === 1 ? 'destinatario' : 'destinatari'}.`),
  ];
}

// ─── Allocazione ──────────────────────────────────────────────────────────────

export interface AllocationTotalInput {
  total: number;
  isValid: boolean;
  leverageRatio: number;
  hasLeverage: boolean;
  cashUseFixedAmount: boolean;
  cashFixedAmount: number;
}

/** Allocazione target — what the plan commits, whether it is leverage or a blocking gap. */
export function describeAllocationTotal(input: AllocationTotalInput): Narrative {
  const segments: Narrative = [prose('Il piano impegna il '), figure(pctTrim(input.total)), prose(' del capitale investito')];
  if (!input.isValid) {
    segments.push(
      prose(': mancano '),
      figure(numTrim(100 - input.total)),
      prose(' punti al '),
      figure('100%'),
      prose(' e il salvataggio è bloccato')
    );
  } else if (input.hasLeverage) {
    segments.push(prose(': leva target '), figure(`${formatNumber(input.leverageRatio, 2)}×`));
  } else {
    segments.push(prose(', senza leva'));
  }
  if (input.cashUseFixedAmount) {
    segments.push(
      prose('; la liquidità fissa ('),
      figure(euro(input.cashFixedAmount)),
      prose(') resta fuori dal budget percentuale.')
    );
  } else {
    segments.push(prose('.'));
  }
  return segments;
}

export interface AutoCalcInput {
  enabled: boolean;
  userAge?: number;
  riskFreeRate?: number;
  /** The RESOLVED equity target (formula minus the other classes), not the raw formula output. */
  equityPct?: number;
  bondsPct?: number;
  /** Sum of every class target outside the auto-calculated pair. */
  otherTotal?: number;
}

/** Auto-calcolo — what the formula does, or would do, with the profile's inputs. */
export function describeAutoCalc(input: AutoCalcInput): Narrative {
  const hasInputs =
    input.userAge !== undefined &&
    input.riskFreeRate !== undefined &&
    input.equityPct !== undefined &&
    input.bondsPct !== undefined;
  if (input.enabled && hasInputs) {
    const segments: Narrative = [
      prose('Formula su '),
      figure(String(input.userAge)),
      prose(' anni e '),
      figure(pctTrim(input.riskFreeRate!)),
      prose(': '),
      figure(pctTrim(input.equityPct!)),
      prose(' alle Azioni e '),
      figure(pctTrim(input.bondsPct!)),
      prose(' alle Obbligazioni'),
    ];
    if (input.otherTotal !== undefined && input.otherTotal > 0) {
      segments.push(prose('; le altre classi ('), figure(pctTrim(input.otherTotal)), prose(') scalano dalle Azioni.'));
    } else {
      segments.push(prose('.'));
    }
    return segments;
  }
  if (!input.enabled && hasInputs) {
    return [
      prose('Spento: i target sono manuali; con la formula su '),
      figure(String(input.userAge)),
      prose(' anni e '),
      figure(pctTrim(input.riskFreeRate!)),
      prose(' le Azioni andrebbero al '),
      figure(pctTrim(input.equityPct!)),
      prose('.'),
    ];
  }
  return [prose('Spento: i target sono manuali; per usare la formula servono età e risk-free rate nel Profilo.')];
}

export interface ClassTargetsInput {
  classCount: number;
  withSubcategories: number;
  isValid: boolean;
}

/** Target per classe — the inventory line over the editable list. */
export function describeClassTargets({ classCount, withSubcategories, isValid }: ClassTargetsInput): Narrative {
  const segments: Narrative = [figure(String(classCount)), prose(' classi, ')];
  if (withSubcategories === 0) {
    segments.push(prose('nessuna con sotto-categorie'));
  } else {
    segments.push(figure(String(withSubcategories)), prose(' con sotto-categorie'));
  }
  if (isValid) {
    segments.push(prose('; un totale sopra il '), figure('100%'), prose(' è la leva target.'));
  } else {
    segments.push(prose('; il totale è sotto il '), figure('100%'), prose(' e il salvataggio è bloccato.'));
  }
  return segments;
}

// ─── Spese ────────────────────────────────────────────────────────────────────

export interface DefaultAccountsInput {
  debitName?: string;
  creditName?: string;
}

/** Conti di default — where expenses and income land without a choice. */
export function describeDefaultAccounts({ debitName, creditName }: DefaultAccountsInput): Narrative {
  if (debitName && creditName) {
    if (debitName === creditName) {
      return [prose(`Spese ed entrate passano entrambe da ${debitName}.`)];
    }
    return [prose(`Le spese scalano da ${debitName}, le entrate arrivano su ${creditName}.`)];
  }
  if (debitName) {
    return [prose(`Le spese scalano da ${debitName}; nessun conto di accredito predefinito.`)];
  }
  if (creditName) {
    return [prose(`Le entrate arrivano su ${creditName}; nessun conto di prelievo predefinito.`)];
  }
  return [prose('Nessun conto predefinito: il dialog delle spese parte senza conto.')];
}

export interface ExpenseCategoryCounts {
  income: number;
  fixed: number;
  variable: number;
  debt: number;
  withSubcategories: number;
}

/** Counts the categories by type and how many carry subcategories — the reading's numbers. */
export function summarizeExpenseCategories(
  categories: { type: ExpenseType; subCategories: unknown[] }[]
): ExpenseCategoryCounts {
  const counts: ExpenseCategoryCounts = { income: 0, fixed: 0, variable: 0, debt: 0, withSubcategories: 0 };
  for (const category of categories) {
    // The union carries types the management list does not show (transfers): count only the four.
    if (
      category.type !== 'income' &&
      category.type !== 'fixed' &&
      category.type !== 'variable' &&
      category.type !== 'debt'
    ) {
      continue;
    }
    counts[category.type] += 1;
    if (category.subCategories.length > 0) counts.withSubcategories += 1;
  }
  return counts;
}

/** Categorie — the inventory line over the management list. */
export function describeExpenseCategories(counts: ExpenseCategoryCounts): Narrative {
  const total = counts.income + counts.fixed + counts.variable + counts.debt;
  if (total === 0) {
    return [prose('Nessuna categoria: creane una per dare un nome ai movimenti.')];
  }
  const parts: Narrative[] = [];
  if (counts.income > 0) parts.push([figure(String(counts.income)), prose(' di entrate')]);
  if (counts.fixed > 0) parts.push([figure(String(counts.fixed)), prose(counts.fixed === 1 ? ' fissa' : ' fisse')]);
  if (counts.variable > 0)
    parts.push([figure(String(counts.variable)), prose(counts.variable === 1 ? ' variabile' : ' variabili')]);
  if (counts.debt > 0) parts.push([figure(String(counts.debt)), prose(' di debito')]);

  const segments: Narrative = [figure(String(total)), prose(total === 1 ? ' categoria: ' : ' categorie: ')];
  parts.forEach((part, index) => {
    if (index > 0) segments.push(prose(index === parts.length - 1 ? ' e ' : ', '));
    segments.push(...part);
  });
  if (counts.withSubcategories > 0) {
    segments.push(prose('; '), figure(String(counts.withSubcategories)), prose(' con sottocategorie.'));
  } else {
    segments.push(prose('.'));
  }
  return segments;
}

export type ImportReadingInput =
  | { phase: 'idle' }
  | { phase: 'preview'; fileName: string; validCount: number; skippedCount: number; newCategoriesCount: number }
  | { phase: 'done'; created: number };

/** Import CSV — the promise, the preview's three counts, the undoable outcome. */
export function describeImport(input: ImportReadingInput): Narrative {
  if (input.phase === 'idle') {
    return [
      prose(
        'Carichi un CSV e vedi cosa verrà importato, saltato e creato prima di confermare; ogni import si annulla in un tocco.'
      ),
    ];
  }
  if (input.phase === 'preview') {
    const segments: Narrative = [prose(`Da ${input.fileName}: `)];
    segments.push(
      figure(String(input.validCount)),
      prose(input.validCount === 1 ? ' voce da importare, ' : ' voci da importare, ')
    );
    if (input.skippedCount === 0) {
      segments.push(prose('nessuna riga scartata, '));
    } else {
      segments.push(
        figure(String(input.skippedCount)),
        prose(input.skippedCount === 1 ? ' riga scartata, ' : ' righe scartate, ')
      );
    }
    if (input.newCategoriesCount === 0) {
      segments.push(prose('nessuna categoria da creare.'));
    } else {
      segments.push(
        figure(String(input.newCategoriesCount)),
        prose(input.newCategoriesCount === 1 ? ' categoria da creare.' : ' categorie da creare.')
      );
    }
    return segments;
  }
  if (input.created === 1) {
    return [
      prose('Importata '),
      figure('1'),
      prose(' transazione: la trovi in Cashflow e Analisi; «Annulla import» la rimuove.'),
    ];
  }
  return [
    prose('Importate '),
    figure(String(input.created)),
    prose(' transazioni: le trovi in Cashflow e Analisi; «Annulla import» le rimuove tutte insieme.'),
  ];
}

// ─── Dividendi ────────────────────────────────────────────────────────────────

export interface DividendCategoryInput {
  categoryName?: string;
  subCategoryName?: string;
}

/** Entrate da dividendi — where a received dividend lands in the cashflow. */
export function describeDividendCategory({ categoryName, subCategoryName }: DividendCategoryInput): Narrative {
  if (!categoryName) {
    return [prose('Senza una categoria, gli incassi non diventano entrate nel cashflow.')];
  }
  const target = subCategoryName ? `${categoryName} › ${subCategoryName}` : categoryName;
  return [prose(`Ogni incasso registrato diventa un'entrata in ${target}, senza doppioni.`)];
}

/** BTP Italia — the FOI is announced per coupon, from the Dividendi calendar. */
export function describeBtpItalia(): Narrative {
  return [
    prose('Le cedole indicizzate attendono il FOI del periodo: lo annunci dal calendario di Dividendi, cedola per cedola.'),
  ];
}

// ─── Condivisione e Aspetto ───────────────────────────────────────────────────

export interface SharingInput {
  memberNames: string[];
}

/** Condivisione account — who sees what, in words. */
export function describeSharing({ memberNames }: SharingInput): Narrative {
  if (memberNames.length === 0) {
    return [prose('Nessun accesso condiviso: questi dati li vedi solo tu.')];
  }
  if (memberNames.length === 1) {
    return [prose(`${memberNames[0]} vede e modifica tutto — spese, asset, dividendi — con le sue credenziali.`)];
  }
  return [
    prose(`${joinNames(memberNames)} vedono e modificano tutto — spese, asset, dividendi — con le loro credenziali.`),
  ];
}

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Modalità — next-themes is per device, and before hydration the theme is unknown: the reading
 * is dropped (null) rather than guessed, the same guard ThemePicker uses for its highlight.
 */
export function describeThemeMode(mode: ThemeMode | undefined): Narrative | null {
  if (mode === undefined) return null;
  if (mode === 'system') {
    return [prose('Il tema segue il dispositivo; la scelta vale solo su questo browser.')];
  }
  return [
    prose(
      `Tema ${mode === 'dark' ? 'scuro' : 'chiaro'} su questo dispositivo; «Sistema» segue le impostazioni del dispositivo.`
    ),
  ];
}

/** Tema colori — the active palette, synced on the account. */
export function describeColorTheme(themeName: string): Narrative {
  return [prose(`${themeName} attivo, sincronizzato su tutti i dispositivi.`)];
}
