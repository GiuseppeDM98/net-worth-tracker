/**
 * The ```expense-proposal protocol of the Assistente's Registra mode (2026-11), pure and client-safe.
 *
 * The model never writes: it emits up to five fenced blocks of JSON, each a row it proposes, and the
 * browser writes a row only on the user's «Conferma», through the services the expense form uses.
 * This module owns the three steps between the model's text and that write:
 *
 * 1. the block's ONE schema (`expenseProposalSchema`) — a block that fails it renders as code, so
 *    the user still reads what the model wrote;
 * 2. where the blocks ARE in a message (`listFencedBlocks`): a card's identity is its block's rank
 *    among the blocks of its language, derived from the stored text. The text never changes, so
 *    the key is the same after a reload — a counter kept while rendering would not be, and the
 *    React Compiler forbids one anyway;
 * 3. the proposal read against what the page holds (`resolveExpenseProposal`): the ids the model
 *    copied are checked against the categories, the accounts, the centres and the household, and
 *    what does not resolve disables «Conferma» with its reason instead of writing a broken row.
 *
 * Four kinds of row (2026-11): a spending row, an income, a transfer between two accounts (or an
 * account and a property) and a loan's instalment; spending rows and instalments may be a monthly
 * or yearly series, any row but a transfer out of a property may carry a fee, and a row may name a
 * category or subcategory that does not exist yet — written by the card before the row.
 */
import { z } from 'zod';
import type { Asset, FamilyMember } from '@/types/assets';
import type { AssistantProposalState } from '@/types/assistant';
import type { CostCenter } from '@/types/costCenters';
import { EXPENSE_TYPE_LABELS, type ExpenseCategory, type ExpenseFormData, type ExpenseType, type RecurrenceFrequency } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { describeDebtRepaymentField, describePropertyTransferRefusal, EXPENSE_BUDGET_EXCLUSION_CHIP, EXPENSE_FEE_NEEDS_CATEGORY } from '@/lib/utils/dialogNarrative';
import { describeExpenseFeeNote, type ExpenseFeeCategory } from '@/lib/utils/expenseFee';
import { categoryMatchKey } from '@/lib/utils/expenseCategoryMatching';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { debtBalanceOf, splitInstalment } from '@/lib/utils/mortgageRepayment';
import { exceedsPropertyValue, propertyValueAvailable } from '@/lib/utils/propertyTransfer';
import { buildRecurrenceDates, canTypeRecur, MAX_RECURRENCE_OCCURRENCES } from '@/lib/utils/recurrenceDates';

export const EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal';
/** The cards one message may carry: a block past the fifth renders as code (the prompt says so too). */
export const EXPENSE_PROPOSALS_MAX_PER_MESSAGE = 5;

/** A real calendar day: «2026-02-31» has the right shape and is refused, because `Date` would roll it into March. */
function isCalendarDate(dateIso: string): boolean {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The row types each kind may carry: a spending row is necessary or not, the other three are one type each. */
const KIND_TYPES: Record<'expense' | 'income' | 'transfer' | 'debt', readonly ExpenseType[]> = {
  expense: ['fixed', 'variable'],
  income: ['income'],
  transfer: ['transfer'],
  debt: ['debt'],
};

export const expenseProposalSchema = z
  .object({
    kind: z.enum(['expense', 'income', 'transfer', 'debt']),
    type: z.enum(['fixed', 'variable', 'income', 'transfer', 'debt']),
    // A magnitude in euro: the service signs it from the type.
    amount: z.number().positive().max(1_000_000),
    dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate),
    // Required by the refine below, except on a transfer (the app picks its category) and with `newCategory`.
    categoryId: z.string().min(1).optional(),
    subCategoryId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    costCenterId: z.string().min(1).optional(),
    memberId: z.string().min(1).optional(),
    excludeFromBudget: z.boolean().optional(),
    note: z.string().max(200).optional(),
    reason: z.string().min(1).max(240),
    // A transfer's two ends: an id of the CONTI or IMMOBILI block, else a name as the user said it.
    fromAccount: z.string().min(1).max(80).optional(),
    toAccount: z.string().min(1).max(80).optional(),
    // An instalment's loan: an id of the PRESTITI block, else a name.
    loanName: z.string().min(1).max(80).optional(),
    payoff: z.boolean().optional(),
    // The amount alone: the fee's category is always Impostazioni's.
    fee: z.object({ amount: z.number().positive().max(1_000_000) }).optional(),
    recurring: z
      .object({
        frequency: z.enum(['monthly', 'yearly']),
        count: z.number().int().min(2),
        day: z.number().int().min(1).max(31).optional(),
      })
      .optional(),
    newCategory: z.object({ name: z.string().trim().min(1).max(60), type: z.enum(['fixed', 'variable', 'income', 'debt']) }).optional(),
    newSubCategory: z.object({ categoryId: z.string().min(1), name: z.string().trim().min(1).max(60) }).optional(),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!KIND_TYPES[p.kind].includes(p.type)) issue('kind/type disagree');
    if (p.kind === 'transfer' && (!p.fromAccount || !p.toAccount)) issue('a transfer needs fromAccount and toAccount');
    if (p.kind === 'transfer' && p.accountId) issue('a transfer names its accounts with fromAccount/toAccount');
    if (p.kind !== 'transfer' && (p.fromAccount || p.toAccount)) issue('only a transfer has fromAccount/toAccount');
    if (p.kind !== 'debt' && (p.loanName || p.payoff)) issue('only an instalment names a loan');
    if (p.payoff && !p.loanName) issue('a payoff names its loan');
    // THE rule of what recurs (lib/utils/recurrenceDates.ts), never a copy of it.
    if (p.recurring && !canTypeRecur(p.type)) issue('this type does not recur');
    if (p.recurring && p.payoff) issue('a payoff is one row');
    if (p.recurring && p.recurring.count > MAX_RECURRENCE_OCCURRENCES[p.recurring.frequency]) issue('too many occurrences');
    if (!p.categoryId && !p.newCategory && p.kind !== 'transfer') issue('a row needs a category');
    if (p.newCategory && (p.categoryId || p.subCategoryId || p.newSubCategory)) issue('a new category stands alone');
    if (p.newCategory && p.newCategory.type !== p.type) issue('a new category has the row type');
    if (p.newSubCategory && (p.newSubCategory.categoryId !== p.categoryId || p.subCategoryId)) issue('a new subcategory sits under the row category');
  });

export type ExpenseProposal = z.infer<typeof expenseProposalSchema>;

/**
 * Parses the body of an ```expense-proposal block. Null for anything that is not a valid proposal
 * (malformed JSON — an amount written with a comma —, a missing field, an impossible date): the
 * caller renders the block as ordinary code.
 */
export function parseExpenseProposal(raw: string): ExpenseProposal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  const result = expenseProposalSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** The key of a card's outcome on its message: the kind and the block's rank among its language's blocks. */
export function proposalKey(kind: 'expense' | 'goal' | 'question', index: number): string {
  return `${kind}:${index}`;
}

interface FencedBlock {
  language: string;
  offset: number;
  index: number;
  /** The offset just past the block's last character (its closing fence line, or the content's end). */
  end: number;
  /** The block's content: from the line after the opening fence to the start of the closing one (or where the block ends unclosed). */
  bodyStart: number;
  bodyEnd: number;
  /** Behind a quote marker or a list marker: never ranked with the top-level blocks. */
  nested: boolean;
}

// Up to three spaces of indentation, then three or more backticks or tildes, then the info string.
const FENCE_LINE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
// The same fence behind a quote marker (`> `) or a list marker (`- `, `1. `) on its line.
const NESTED_FENCE_LINE = /^( {0,3}(?:>[ \t]?|(?:[-*+]|\d{1,9}[.)])[ \t]{1,4}))(`{3,}|~{3,})(.*)$/;
const QUOTE_PREFIX = /^ {0,3}>[ \t]?/;

interface OpenFence {
  marker: string;
  length: number;
  block: FencedBlock;
  /** A nested block's container: a quote ends at a line with no `>`, a list item at a line indented less than its content. */
  container: { kind: 'quote' } | { kind: 'list'; indent: number } | null;
}

/**
 * The fenced blocks of a message, as CommonMark opens and closes them: an opening fence is three
 * or more backticks or tildes after at most three spaces, a block closes at a line of the same
 * character at least as long, or at the end of the content, and a fence line inside an open block
 * is content. A fence that follows `>` or a list marker on its line opens a NESTED block, which
 * closes at its fence or where its quote or list item ends: it is scanned so that its closing
 * fence is never read as a top-level opening one, and it is never ranked with the top-level
 * blocks (a quoted or listed expense block is not a card: the prompt asks for blocks on lines of
 * their own).
 */
function scanFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const ranks = new Map<string, number>();
  let open: OpenFence | null = null;
  let lineStart = 0;

  while (lineStart <= content.length) {
    const newline = content.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    const raw = content.slice(lineStart, lineEnd).replace(/\r$/, '');

    // A nested block ends, unclosed, where its container does; the line is then read afresh.
    if (open?.container) {
      const leaves =
        open.container.kind === 'quote'
          ? !QUOTE_PREFIX.test(raw)
          : raw.trim() !== '' && raw.length - raw.trimStart().length < open.container.indent;
      if (leaves) {
        open.block.end = lineStart;
        open.block.bodyEnd = lineStart;
        open = null;
      }
    }

    if (open) {
      // Inside a container the fence is looked for past the container's own prefix.
      const line =
        open.container?.kind === 'quote' ? raw.replace(QUOTE_PREFIX, '') : open.container?.kind === 'list' ? raw.slice(open.container.indent) : raw;
      const match = FENCE_LINE.exec(line);
      // A closing fence carries nothing after its run but spaces.
      const closes = match !== null && match[2][0] === open.marker && match[2].length >= open.length && match[3].trim() === '';
      if (closes) {
        open.block.end = lineEnd;
        open.block.bodyEnd = lineStart;
        open = null;
      }
    } else {
      const top = FENCE_LINE.exec(raw);
      const match = top ?? NESTED_FENCE_LINE.exec(raw);
      if (match) {
        const marker = match[2][0];
        const info = match[3].trim();
        // A backtick fence whose info string holds a backtick is inline code, not a fence.
        if (marker !== '`' || !info.includes('`')) {
          const language = info.split(/\s+/)[0] ?? '';
          const nested = top === null;
          const index = nested ? -1 : (ranks.get(language) ?? 0);
          if (!nested) ranks.set(language, index + 1);
          // The body opens on the next line; an opening fence on the last line holds nothing.
          const bodyStart = newline === -1 ? content.length : newline + 1;
          const block: FencedBlock = { language, offset: lineStart + match[1].length, index, end: content.length, nested, bodyStart, bodyEnd: content.length };
          blocks.push(block);
          const container = !nested ? null : match[1].includes('>') ? ({ kind: 'quote' } as const) : ({ kind: 'list', indent: match[1].length } as const);
          open = { marker, length: match[2].length, block, container };
        }
      }
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return blocks;
}

/**
 * Every top-level fenced block of a message: its language, the offset of its opening fence, its
 * rank among its language's blocks. `offset` is the fence's first backtick or tilde — the offset
 * react-markdown's hast `pre` node carries in `position.start.offset` for that block, which is how
 * the renderer finds a block's rank without counting anything while it renders. `bodyStart` and
 * `bodyEnd` bound the block's content as the scanner closed it — a reader of the body takes it
 * from here, never from a second search for «the next closing fence», which would disagree with
 * the scanner on a longer fence, a tilde one, or a fence written inside a JSON string.
 */
export function listFencedBlocks(content: string): { language: string; offset: number; index: number; bodyStart: number; bodyEnd: number }[] {
  return scanFencedBlocks(content)
    .filter((block) => !block.nested)
    .map(({ language, offset, index, bodyStart, bodyEnd }) => ({ language, offset, index, bodyStart, bodyEnd }));
}

/**
 * The blocks of ONE language that sit behind a quote marker or a list marker, ranked AFTER that
 * language's top-level blocks, in document order — so the top-level keys never move. For a card
 * that must not turn into code because the model quoted or listed its block: the goal proposal,
 * whose protocol never asked for a line of its own (2026-11-11). Derived from the text, so the
 * keys are the same after a reload.
 */
export function listNestedFencedBlocks(content: string, language: string): { language: string; offset: number; index: number }[] {
  const ofLanguage = scanFencedBlocks(content).filter((block) => block.language === language);
  const topLevel = ofLanguage.filter((block) => !block.nested).length;
  return ofLanguage.filter((block) => block.nested).map(({ offset }, rank) => ({ language, offset, index: topLevel + rank }));
}

/** The message without its fenced blocks (the thread list's preview): a JSON block is not a preview. */
export function stripFencedBlocks(content: string): string {
  let stripped = '';
  let cursor = 0;
  for (const block of scanFencedBlocks(content)) {
    if (block.nested) continue;
    stripped += content.slice(cursor, block.offset);
    cursor = block.end;
  }
  return (stripped + content.slice(cursor)).trim();
}

/**
 * What the page holds for a proposal to be read against: the expense form's reads. `properties`
 * are the assets a transfer may land on or leave (`isTransferableProperty`), `loans` those an
 * instalment may repay (`isRepayableDebt`), `feeCategory` Impostazioni's (`resolveExpenseFeeCategory`).
 */
export interface ExpenseProposalRefs {
  categories: ExpenseCategory[];
  cashAssets: Asset[];
  properties: Asset[];
  costCenters: CostCenter[];
  members: FamilyMember[];
  /** The two default accounts of the expense form; null when unset or not a listed account. */
  defaults: { debitId: string | null; creditId: string | null };
  loans: Asset[];
  feeCategory: ExpenseFeeCategory | null;
  settings: { costCentersEnabled: boolean; expenseSplitEnabled: boolean };
}

/** What «Conferma» must write before the row (2026-11): a subcategory, a category, or the transfers' category. */
export interface ExpenseProposalCreate {
  subCategory?: { categoryId: string; name: string };
  category?: { name: string; type: Exclude<ExpenseType, 'transfer'> };
  transferCategory?: true;
}

/** The fee the row carries, as `createExpenseSettledOnDate` takes it (`ExpenseFee`, lib/services/expenseService.ts). */
export interface ResolvedExpenseFee {
  amount: number;
  category: ExpenseFeeCategory;
  notes: string;
}

export interface ResolvedExpenseProposal {
  /** What «Conferma» writes and «Modifica» prefills: only the ids that resolved. */
  form: Partial<ExpenseFormData>;
  /** The row as the card prints it (see the keys in `resolveExpenseProposal`). */
  labels: Record<string, string>;
  /** Why the row cannot be written as proposed; any entry disables «Conferma». */
  problems: string[];
  /** The fields left out, each «ignorato: …»: the row is still writable without them. */
  dropped: string[];
  /** What «Conferma» writes first; null when nothing is created. */
  create: ExpenseProposalCreate | null;
  /** The fee row written beside the row (every occurrence of a series), or null. */
  fee: ResolvedExpenseFee | null;
}

export const PROPOSAL_NO_ACCOUNT_LABEL = 'nessun conto: il saldo non si muove';
/** The line of an instalment that names no loan: written as the form's «nessun prestito». */
export const PROPOSAL_UNLINKED_INSTALMENT_LABEL = 'Rata non collegata a un prestito';
/** The problem of a row whose category the account does not have, when it has none at all (not a failed read). */
export const PROPOSAL_NO_CATEGORIES = 'nessuna categoria configurata';
/** A category the model copied whose type is not the row's: a spending category on an income, a debt one on a transfer. */
const describeOtherTypeCategory = (name: string) => `categoria di un altro tipo: ${name}`;
/** The fields the expense form drops on save, left out by the card the same way (AGENTS.md: the form's rules hold on the card). */
export const PROPOSAL_DROPPED_MEMBER = 'ignorato: intestatario';
export const PROPOSAL_DROPPED_BUDGET = 'ignorato: fuori budget';
export const PROPOSAL_DROPPED_FEE = 'ignorato: commissione';
/** The transfers' category the card creates when the account has none (`ensureTransferCategory`). */
const TRANSFER_CATEGORY_NAME = 'Trasferimenti';

const KIND_LABELS: Record<ExpenseProposal['kind'], string> = { expense: 'Spesa', income: 'Entrata', transfer: 'Trasferimento', debt: 'Rata' };
const SERIES_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = { monthly: 'mensili', yearly: 'annuali' };

/** DD/MM/YYYY from an ISO day, without a Date in between (no zone can move it). */
function formatIsoDay(dateIso: string): string {
  const [year, month, day] = dateIso.split('-');
  return `${day}/${month}/${year}`;
}

/** The ISO day before `dateIso`, on the calendar (UTC arithmetic: a day is a day, no DST). */
function previousIsoDay(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** A name as the matcher compares it: lower-case, accents stripped, trimmed, runs of whitespace as one space. */
function normalizeName(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');
}

type NameMatch<T> = { kind: 'one'; item: T } | { kind: 'many'; items: T[] } | { kind: 'none' };

/**
 * An entity the model named by id or by name (2026-11): the exact id first, then the normalised
 * name in three stages — equal, starts with, contains —; the FIRST stage with hits decides, so
 * «conto a» is «Conto A» and not ambiguous with «Conto Arancio». One hit resolves, two or more
 * are ambiguous, none is unknown.
 */
function matchByIdOrName<T extends { id: string; name: string }>(text: string, items: readonly T[]): NameMatch<T> {
  const byId = items.find((item) => item.id === text);
  if (byId) return { kind: 'one', item: byId };
  const wanted = normalizeName(text);
  if (wanted === '') return { kind: 'none' };
  const stages: ((name: string) => boolean)[] = [(name) => name === wanted, (name) => name.startsWith(wanted), (name) => name.includes(wanted)];
  for (const stage of stages) {
    const hits = items.filter((item) => stage(normalizeName(item.name ?? '')));
    if (hits.length === 1) return { kind: 'one', item: hits[0] };
    if (hits.length > 1) return { kind: 'many', items: hits };
  }
  return { kind: 'none' };
}

const namesOf = (items: readonly { name: string }[]) => items.map((item) => item.name).join(', ');

/**
 * Reads a proposal against the page's categories, accounts, properties, loans, centres and household.
 *
 * - A PROBLEM disables «Conferma»: a category that is not there or whose type is not the
 *   proposal's, a subcategory the category does not have, an account that is not a cash account,
 *   a transfer end or a loan unknown or ambiguous, a property on both ends, a sale above the
 *   property's value, a fee with no fee category in Impostazioni, a member the household does not
 *   have (Divisione on), a centre unknown or archived (centres on).
 * - A DROP is left out and listed, as the expense form's save drops it: a centre with the centres
 *   off, a member with Divisione off or on a transfer, «fuori budget» on an income or a transfer,
 *   the fee of a transfer out of a property.
 * - The account is the one named, else the default of the kind (debit for a spending row and an
 *   instalment, credit for an income); with neither, the row is written and moves no balance. A
 *   transfer names both its ends (`fromAccount` → `linkedCashAssetId`, `toAccount` →
 *   `transferCashAssetId`), among the cash accounts AND the properties.
 * - A category or subcategory named but not there is created by «Conferma» first (`create`),
 *   unless one of that name already exists — then it is that one.
 * - The date is the dialog's date field's: the browser's local midnight of the day, today included.
 *
 * `labels`: `kind`, `amount`, `category` («Cibo › Spesa», «Nuova sottocategoria: …», «Nuova
 * categoria: …», «Trasferimenti (nuova)»), `categoryName`, `subCategoryName`, `date` («oggi»,
 * «ieri», DD/MM/YYYY), `settlement` (a future date with an account only), `account` (the two ends
 * of a transfer), `accounts`, `property`, `debt`, `series`, `fee`, `costCenter`, `member`, `budget`.
 */
export function resolveExpenseProposal(p: ExpenseProposal, refs: ExpenseProposalRefs, now: Date = new Date()): ResolvedExpenseProposal {
  const problems: string[] = [];
  const dropped: string[] = [];
  const labels: Record<string, string> = {};
  const create: ExpenseProposalCreate = {};
  const amount = roundToCents(p.amount);
  const form: Partial<ExpenseFormData> = {
    type: p.type,
    amount,
    currency: 'EUR',
    date: new Date(`${p.dateIso}T00:00:00`),
  };
  if (p.note) form.notes = p.note;

  labels.kind = KIND_LABELS[p.kind];
  labels.amount = cachedFormatCurrencyEUR(amount);

  // ── Category and subcategory ──
  if (p.kind === 'transfer') {
    // The app's own category: the one named if it is a transfer one, else the account's first, else a new «Trasferimenti».
    const named = p.categoryId ? refs.categories.find((c) => c.id === p.categoryId) : undefined;
    const category = named?.type === 'transfer' ? named : refs.categories.find((c) => c.type === 'transfer');
    if (named && named.type !== 'transfer') problems.push(describeOtherTypeCategory(named.name));
    if (category) {
      form.categoryId = category.id;
      labels.categoryName = category.name;
      labels.category = category.name;
    } else {
      create.transferCategory = true;
      labels.categoryName = TRANSFER_CATEGORY_NAME;
      labels.category = `${TRANSFER_CATEGORY_NAME} (nuova)`;
    }
  } else if (p.newCategory) {
    // A category of that name and type already there is that one: nothing is written twice.
    const existing = refs.categories.find((c) => categoryMatchKey(c.name, c.type) === categoryMatchKey(p.newCategory!.name, p.newCategory!.type));
    if (existing) {
      form.categoryId = existing.id;
      labels.categoryName = existing.name;
      labels.category = existing.name;
    } else {
      create.category = { name: p.newCategory.name, type: p.newCategory.type };
      labels.categoryName = p.newCategory.name;
      labels.category = `Nuova categoria: ${p.newCategory.name} (${EXPENSE_TYPE_LABELS[p.newCategory.type]})`;
    }
  } else {
    const category = refs.categories.find((c) => c.id === p.categoryId);
    if (!category) {
      // An account with no category at all is told so — not «not found», and never the failed read.
      problems.push(refs.categories.length === 0 ? PROPOSAL_NO_CATEGORIES : 'La categoria proposta non esiste più.');
      labels.category = 'categoria non trovata';
    } else if (category.type !== p.type) {
      problems.push(describeOtherTypeCategory(category.name));
      labels.category = category.name;
      labels.categoryName = category.name;
    } else {
      form.categoryId = category.id;
      labels.categoryName = category.name;
      labels.category = category.name;
      if (p.newSubCategory) {
        const wanted = p.newSubCategory.name.trim().toLowerCase();
        const existing = category.subCategories.find((s) => s.name.trim().toLowerCase() === wanted);
        if (existing) {
          form.subCategoryId = existing.id;
          labels.subCategoryName = existing.name;
          labels.category = `${category.name} › ${existing.name}`;
        } else {
          create.subCategory = { categoryId: category.id, name: p.newSubCategory.name.trim() };
          labels.subCategoryName = p.newSubCategory.name.trim();
          labels.category = `Nuova sottocategoria: ${category.name} › ${p.newSubCategory.name.trim()}`;
        }
      } else if (p.subCategoryId) {
        const subCategory = category.subCategories.find((s) => s.id === p.subCategoryId);
        if (subCategory) {
          form.subCategoryId = subCategory.id;
          labels.subCategoryName = subCategory.name;
          labels.category = `${category.name} › ${subCategory.name}`;
        } else {
          problems.push(`La sottocategoria proposta non esiste in «${category.name}».`);
        }
      }
    }
  }

  // ── Account(s) ──
  let account: Asset | undefined;
  let originProperty: Asset | undefined;
  let destination: Asset | undefined;
  if (p.kind === 'transfer') {
    const endpoints = [...refs.cashAssets, ...refs.properties];
    const isProperty = (asset: Asset) => refs.properties.some((property) => property.id === asset.id);
    const resolveEnd = (text: string): Asset | undefined => {
      const match = matchByIdOrName(text, endpoints);
      if (match.kind === 'one') return match.item;
      problems.push(match.kind === 'many' ? `ambiguo: ${namesOf(match.items)}` : `conto sconosciuto: ${text}`);
      return undefined;
    };
    const origin = resolveEnd(p.fromAccount!);
    destination = resolveEnd(p.toAccount!);
    if (origin && destination) {
      if (origin.id === destination.id) problems.push('origine e destinazione sono lo stesso conto');
      else if (isProperty(origin) && isProperty(destination)) problems.push('un trasferimento tocca un immobile su un lato solo');
    }
    if (origin) form.linkedCashAssetId = origin.id;
    if (destination) form.transferCashAssetId = destination.id;
    labels.accounts = `${origin?.name ?? 'conto non trovato'} → ${destination?.name ?? 'conto non trovato'}`;
    labels.account = labels.accounts;
    if (origin && destination && origin.id !== destination.id) {
      if (isProperty(destination)) {
        labels.property = `verso l'immobile ${destination.name}: il valore della casa sale di ${labels.amount}`;
      } else if (isProperty(origin)) {
        labels.property = `dall'immobile ${origin.name}: il valore della casa scende di ${labels.amount}`;
        originProperty = origin;
      }
    }
    // A property never gives more than it is worth: the dialog's refusal, in its words.
    if (originProperty) {
      const available = propertyValueAvailable(originProperty, null);
      if (exceedsPropertyValue(amount, available)) problems.push(describePropertyTransferRefusal(originProperty.name, available));
    }
    account = origin;
  } else {
    const defaultAccountId = p.kind === 'income' ? refs.defaults.creditId : refs.defaults.debitId;
    const accountId = p.accountId ?? defaultAccountId;
    account = accountId ? refs.cashAssets.find((a) => a.id === accountId) : undefined;
    if (p.accountId && !account) {
      problems.push('Il conto proposto non è fra i tuoi conti.');
      labels.account = 'conto non trovato';
    } else if (account) {
      form.linkedCashAssetId = account.id;
      labels.account = account.name;
    } else {
      labels.account = PROPOSAL_NO_ACCOUNT_LABEL;
    }
  }

  // ── Loan ──
  if (p.kind === 'debt') {
    if (!p.loanName) {
      labels.debt = PROPOSAL_UNLINKED_INSTALMENT_LABEL;
    } else {
      const match = matchByIdOrName(p.loanName, refs.loans);
      if (match.kind === 'one') {
        const loan = match.item;
        const isPayoff = p.payoff === true;
        const debt = debtBalanceOf(loan);
        form.debtAssetId = loan.id;
        if (isPayoff) form.isDebtPayoff = true;
        labels.debt = describeDebtRepaymentField({
          loanName: loan.name,
          debt,
          annualRatePct: loan.debtInterestRate,
          instalment: amount,
          split: splitInstalment(amount, debt, loan.debtInterestRate, isPayoff),
          isPayoff,
        });
      } else {
        problems.push(match.kind === 'many' ? `prestito ambiguo: ${namesOf(match.items)}` : `prestito sconosciuto: ${p.loanName}`);
      }
    }
  }

  // ── Date ──
  const todayIso = getItalyDateIso(now);
  if (p.dateIso === todayIso) labels.date = 'oggi';
  else if (p.dateIso === previousIsoDay(todayIso)) labels.date = 'ieri';
  else labels.date = formatIsoDay(p.dateIso);
  // A row dated after today waits for its day to move its account (lib/utils/cashSettlement.ts).
  if (p.dateIso > todayIso && account) labels.settlement = `si applica al saldo il ${formatIsoDay(p.dateIso)}`;

  // ── Series ──
  if (p.recurring) {
    const recurringDay = p.recurring.day ?? Number(p.dateIso.slice(8, 10));
    form.isRecurring = true;
    form.recurringFrequency = p.recurring.frequency;
    form.recurringCount = p.recurring.count;
    form.recurringDay = recurringDay;
    // Where the series REALLY starts: in the date's month, on the day asked (clamped), as the service writes it.
    const dates = buildRecurrenceDates({ start: new Date(`${p.dateIso}T00:00:00`), frequency: p.recurring.frequency, count: p.recurring.count, dayOfMonth: p.recurring.day });
    labels.series = `${p.recurring.count} occorrenze ${SERIES_FREQUENCY_LABELS[p.recurring.frequency]}, dal ${formatDate(dates[0])} al ${formatDate(dates[dates.length - 1])}`;
  }

  // ── Cost centre ──
  if (p.costCenterId) {
    if (!refs.settings.costCentersEnabled) {
      dropped.push('ignorato: il centro di costo (i centri di costo non sono attivi)');
    } else {
      const center = refs.costCenters.find((c) => c.id === p.costCenterId && !c.archivedAt);
      if (center) {
        form.costCenterId = center.id;
        form.costCenterName = center.name;
        labels.costCenter = center.name;
      } else {
        problems.push('Il centro di costo proposto non esiste o è archiviato.');
      }
    }
  }

  // ── Member ──
  if (p.memberId) {
    if (!refs.settings.expenseSplitEnabled || p.type === 'transfer') {
      // Divisione off, or a transfer — the household's plumbing, nobody's column: the form drops it the same way.
      dropped.push(PROPOSAL_DROPPED_MEMBER);
    } else {
      const member = refs.members.find((m) => m.id === p.memberId);
      if (member) {
        form.personalMemberId = member.id;
        labels.member = member.name;
      } else {
        problems.push("L'intestatario proposto non è fra i componenti della famiglia.");
      }
    }
  }

  // ── Fuori budget ──
  if (p.excludeFromBudget) {
    if (p.type === 'income' || p.type === 'transfer') {
      // `countsTowardBudget` reads it on spending rows and instalments only.
      dropped.push(PROPOSAL_DROPPED_BUDGET);
    } else {
      form.excludeFromBudget = true;
      labels.budget = EXPENSE_BUDGET_EXCLUSION_CHIP;
    }
  }

  // ── Fee ──
  let fee: ResolvedExpenseFee | null = null;
  if (p.fee) {
    if (originProperty) {
      // A sale's proceeds are not a payment: a transfer out of a property carries no fee (doc/guide/cashflow.md).
      dropped.push(PROPOSAL_DROPPED_FEE);
    } else if (!refs.feeCategory) {
      problems.push(EXPENSE_FEE_NEEDS_CATEGORY);
    } else {
      const feeAmount = roundToCents(p.fee.amount);
      fee = {
        amount: feeAmount,
        category: refs.feeCategory,
        notes: describeExpenseFeeNote({ type: p.type, destinationName: destination?.name, label: p.note?.trim() || labels.categoryName }),
      };
      labels.fee = `commissione ${cachedFormatCurrencyEUR(feeAmount)}${p.recurring ? ' su ogni occorrenza' : ''}`;
    }
  }

  const hasCreate = Boolean(create.subCategory || create.category || create.transferCategory);
  return { form, labels, problems, dropped, create: hasCreate ? create : null, fee };
}

export interface ExpenseProposalCardState {
  status: 'idle' | 'saving' | 'written' | 'ignored' | 'interrupted';
  /** The line that replaces the buttons; null while the buttons are shown. */
  line: string | null;
  /** On a written row with fees: «+ 1 commissione», «+ 12 commissioni». */
  feeLine: string | null;
  /** Beside the buttons, why «Conferma» waits (a question in the same message); null otherwise. */
  waitLine: string | null;
  canConfirm: boolean;
  canEdit: boolean;
  canIgnore: boolean;
}

export const PROPOSAL_INTERRUPTED_LINE = 'Risposta interrotta: chiedi di riproporla';
/** A proposal beside a question (the contract forbids it): the answer comes first. */
export const PROPOSAL_WAITS_FOR_ANSWER_LINE = 'Rispondi prima alla domanda';
export const PROPOSAL_WRITTEN_BY_EDIT_LINE = 'registrata da Modifica';

/**
 * What a written card says: «Registrata», «12 righe registrate» for a series, «registrata da
 * Modifica» when the form wrote it (only that path records the row's `month`), and the fees beside.
 * The counts come from the ids written — the parents first, then the fees, one fee per parent.
 */
function describeWritten(resolved: ResolvedExpenseProposal, persisted: AssistantProposalState): { line: string; feeLine: string | null } {
  if (persisted.month !== undefined) return { line: PROPOSAL_WRITTEN_BY_EDIT_LINE, feeLine: null };
  const ids = persisted.writtenIds?.length ?? 0;
  const fees = resolved.fee ? Math.floor(ids / 2) : 0;
  const parents = ids - fees;
  const feeLine = fees === 0 ? null : fees === 1 ? '+ 1 commissione' : `+ ${fees} commissioni`;
  return { line: resolved.form.isRecurring ? `${parents} righe registrate` : 'Registrata', feeLine };
}

/**
 * What the card shows under the row: the outcome saved on the message wins (a reload never offers
 * «Conferma» again); a message that never received its server id — stopped or failed before the
 * stream's `done` — has nowhere to save an outcome, so it offers no button at all; otherwise the
 * three buttons, «Conferma» only for a proposal with no problem, on reads that answered, outside
 * the demo, and not while the message also asks a question (the answer may change the row).
 */
export function describeExpenseProposalState(
  resolved: ResolvedExpenseProposal,
  persisted: AssistantProposalState | undefined,
  local: { messageId: string; saving: boolean; readFailed: boolean; isDemo: boolean; hasQuestionBlock: boolean },
): ExpenseProposalCardState {
  const closed = { canConfirm: false, canEdit: false, canIgnore: false, waitLine: null };
  if (persisted?.status === 'written') return { status: 'written', ...describeWritten(resolved, persisted), ...closed };
  if (persisted?.status === 'ignored') return { status: 'ignored', line: 'Ignorata', feeLine: null, ...closed };
  if (local.messageId.startsWith('local-')) return { status: 'interrupted', line: PROPOSAL_INTERRUPTED_LINE, feeLine: null, ...closed };
  if (local.saving) return { status: 'saving', line: null, feeLine: null, ...closed };
  const writable = !local.readFailed && !local.isDemo;
  return {
    status: 'idle',
    line: null,
    feeLine: null,
    waitLine: local.hasQuestionBlock ? PROPOSAL_WAITS_FOR_ANSWER_LINE : null,
    canConfirm: writable && resolved.problems.length === 0 && !local.hasQuestionBlock,
    canEdit: writable,
    canIgnore: true,
  };
}
