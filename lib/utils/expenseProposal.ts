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
 */
import { z } from 'zod';
import type { Asset, FamilyMember } from '@/types/assets';
import type { AssistantProposalState } from '@/types/assistant';
import type { CostCenter } from '@/types/costCenters';
import { EXPENSE_TYPE_LABELS, type ExpenseCategory, type ExpenseFormData } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { EXPENSE_BUDGET_EXCLUSION_CHIP } from '@/lib/utils/dialogNarrative';
import type { ExpenseFeeCategory } from '@/lib/utils/expenseFee';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

export const EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal';
/** The cards one message may carry: a block past the fifth renders as code (the prompt says so too). */
export const EXPENSE_PROPOSALS_MAX_PER_MESSAGE = 5;

/** A real calendar day: «2026-02-31» has the right shape and is refused, because `Date` would roll it into March. */
function isCalendarDate(dateIso: string): boolean {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const expenseProposalSchema = z
  .object({
    kind: z.enum(['expense', 'income']),
    type: z.enum(['fixed', 'variable', 'income']),
    // A magnitude in euro: the service signs it from the type.
    amount: z.number().positive().max(1_000_000),
    dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate),
    categoryId: z.string().min(1),
    subCategoryId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    costCenterId: z.string().min(1).optional(),
    memberId: z.string().min(1).optional(),
    excludeFromBudget: z.boolean().optional(),
    note: z.string().max(200).optional(),
    reason: z.string().min(1).max(240),
  })
  .refine((p) => (p.kind === 'income') === (p.type === 'income'), { message: 'kind/type disagree' });

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
          const block: FencedBlock = { language, offset: lineStart + match[1].length, index, end: content.length, nested };
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
 * the renderer finds a block's rank without counting anything while it renders.
 */
export function listFencedBlocks(content: string): { language: string; offset: number; index: number }[] {
  return scanFencedBlocks(content)
    .filter((block) => !block.nested)
    .map(({ language, offset, index }) => ({ language, offset, index }));
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
 * What the page holds for a proposal to be read against. `properties`, `loans` and `feeCategory`
 * are the transfers', the instalments' and the fees': empty until those row kinds are proposed.
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

export interface ResolvedExpenseProposal {
  /** What «Conferma» writes and «Modifica» prefills: only the ids that resolved. */
  form: Partial<ExpenseFormData>;
  /** The row as the card prints it (see the keys in `resolveExpenseProposal`). */
  labels: Record<string, string>;
  /** Why the row cannot be written as proposed; any entry disables «Conferma». */
  problems: string[];
  /** The fields left out, each «ignorato: …»: the row is still writable without them. */
  dropped: string[];
}

export const PROPOSAL_NO_ACCOUNT_LABEL = 'nessun conto: il saldo non si muove';

const KIND_LABELS: Record<ExpenseProposal['kind'], string> = { expense: 'Spesa', income: 'Entrata' };

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

/**
 * Reads a proposal against the page's categories, accounts, centres and household.
 *
 * - A PROBLEM disables «Conferma»: a category that is not there or whose type is not the
 *   proposal's, a subcategory the category does not have, an account that is not a cash account,
 *   a member the household does not have (Divisione on), a centre unknown or archived (centres on).
 * - A DROP is left out and listed: a centre with the centres off, a member with Divisione off,
 *   «fuori budget» on an income (the form offers it on spending alone).
 * - The account is the one named, else the default of the kind (debit for a spending row, credit
 *   for an income); with neither, the row is written and moves no balance — the label says so.
 * - The date is the dialog's date field's: the browser's local midnight of the day, today included.
 *
 * `labels`: `kind`, `amount`, `category` («Cibo › Spesa»), `categoryName`, `subCategoryName`,
 * `date` («oggi», «ieri», DD/MM/YYYY), `settlement` (a future date with an account only),
 * `account`, `costCenter`, `member`, `budget`.
 */
export function resolveExpenseProposal(p: ExpenseProposal, refs: ExpenseProposalRefs, now: Date = new Date()): ResolvedExpenseProposal {
  const problems: string[] = [];
  const dropped: string[] = [];
  const labels: Record<string, string> = {};
  const form: Partial<ExpenseFormData> = {
    type: p.type,
    amount: roundToCents(p.amount),
    currency: 'EUR',
    date: new Date(`${p.dateIso}T00:00:00`),
  };
  if (p.note) form.notes = p.note;

  labels.kind = KIND_LABELS[p.kind];
  labels.amount = cachedFormatCurrencyEUR(roundToCents(p.amount));

  // ── Category and subcategory ──
  const category = refs.categories.find((c) => c.id === p.categoryId);
  if (!category) {
    problems.push('La categoria proposta non esiste più.');
    labels.category = 'categoria non trovata';
  } else if (category.type !== p.type) {
    problems.push(`La categoria «${category.name}» è di tipo ${EXPENSE_TYPE_LABELS[category.type]}, non ${EXPENSE_TYPE_LABELS[p.type]}.`);
    labels.category = category.name;
    labels.categoryName = category.name;
  } else {
    form.categoryId = category.id;
    labels.categoryName = category.name;
    labels.category = category.name;
    if (p.subCategoryId) {
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

  // ── Account ──
  const defaultAccountId = p.kind === 'income' ? refs.defaults.creditId : refs.defaults.debitId;
  const accountId = p.accountId ?? defaultAccountId;
  const account = accountId ? refs.cashAssets.find((a) => a.id === accountId) : undefined;
  if (p.accountId && !account) {
    problems.push('Il conto proposto non è fra i tuoi conti.');
    labels.account = 'conto non trovato';
  } else if (account) {
    form.linkedCashAssetId = account.id;
    labels.account = account.name;
  } else {
    labels.account = PROPOSAL_NO_ACCOUNT_LABEL;
  }

  // ── Date ──
  const todayIso = getItalyDateIso(now);
  if (p.dateIso === todayIso) labels.date = 'oggi';
  else if (p.dateIso === previousIsoDay(todayIso)) labels.date = 'ieri';
  else labels.date = formatIsoDay(p.dateIso);
  // A row dated after today waits for its day to move its account (lib/utils/cashSettlement.ts).
  if (p.dateIso > todayIso && account) labels.settlement = `si applica al saldo il ${formatIsoDay(p.dateIso)}`;

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
    if (!refs.settings.expenseSplitEnabled) {
      dropped.push("ignorato: l'intestatario (la Divisione non è attiva)");
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
    if (p.kind === 'income') {
      dropped.push('ignorato: «fuori budget» (vale solo per le spese)');
    } else {
      form.excludeFromBudget = true;
      labels.budget = EXPENSE_BUDGET_EXCLUSION_CHIP;
    }
  }

  return { form, labels, problems, dropped };
}

export interface ExpenseProposalCardState {
  status: 'idle' | 'saving' | 'written' | 'ignored' | 'interrupted';
  /** The line that replaces the buttons; null while the buttons are shown. */
  line: string | null;
  canConfirm: boolean;
  canEdit: boolean;
  canIgnore: boolean;
}

export const PROPOSAL_INTERRUPTED_LINE = 'Risposta interrotta: chiedi di riproporla';

/**
 * What the card shows under the row: the outcome saved on the message wins (a reload never offers
 * «Conferma» again); a message that never received its server id — stopped or failed before the
 * stream's `done` — has nowhere to save an outcome, so it offers no button at all; otherwise the
 * three buttons, «Conferma» only for a proposal with no problem, on reads that answered, outside
 * the demo.
 */
export function describeExpenseProposalState(
  resolved: ResolvedExpenseProposal,
  persisted: AssistantProposalState | undefined,
  local: { messageId: string; saving: boolean; readFailed: boolean; isDemo: boolean },
): ExpenseProposalCardState {
  const closed = { canConfirm: false, canEdit: false, canIgnore: false };
  if (persisted?.status === 'written') return { status: 'written', line: 'Registrata', ...closed };
  if (persisted?.status === 'ignored') return { status: 'ignored', line: 'Ignorata', ...closed };
  if (local.messageId.startsWith('local-')) return { status: 'interrupted', line: PROPOSAL_INTERRUPTED_LINE, ...closed };
  if (local.saving) return { status: 'saving', line: null, ...closed };
  const writable = !local.readFailed && !local.isDemo;
  return {
    status: 'idle',
    line: null,
    canConfirm: writable && resolved.problems.length === 0,
    canEdit: writable,
    canIgnore: true,
  };
}
