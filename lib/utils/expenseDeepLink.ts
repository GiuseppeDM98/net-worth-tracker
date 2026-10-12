/**
 * Expense deep link — the Shortcut capture for Apple Pay purchases.
 *
 * A Comandi Rapidi automation (Transaction trigger) cannot write to the app: a webapp
 * exposes no Shortcuts action. What it CAN do is open the app with the purchase already
 * described in the URL, so the dialog opens prefilled and the user only presses Salva:
 *
 *   /dashboard/cashflow?tab=tracking&nuova-spesa=1&importo=12.50&nota=Bar&categoria=Alimentari
 *
 * This module owns the parsing (pure, tested): presence of `nuova-spesa=1` is the request;
 * every other param is a hint that may be missing or malformed — a bad hint leaves its
 * field empty, never a wrong figure. Category identity is by document id (expenseGrouping):
 * the name resolves only when it names exactly one outflow category, otherwise it is
 * dropped and the user picks.
 */

import type { ExpenseCategory, ExpenseType } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';

/** The query params the Shortcut builds. All Italian, like the UI text around them. */
export const EXPENSE_DEEP_LINK_PARAMS = {
  request: 'nuova-spesa',
  amount: 'importo',
  notes: 'nota',
  category: 'categoria',
} as const;

/** A parsed deep-link request: every hint optional, absent when unusable. */
export interface ExpenseDeepLinkRequest {
  amount?: number;
  notes?: string;
  categoryName?: string;
}

/** The draft the dialog opens with: ids and a valid type, resolved by the caller. */
export interface ExpenseDeepLinkDraft {
  amount?: number;
  notes?: string;
  categoryId?: string;
  type?: ExpenseType;
  /**
   * The category hint as typed, kept ONLY when it resolved to nothing: the dialog offers
   * it as a one-tap «create». Never a second identity beside categoryId — when the id is
   * set this is absent.
   */
  categoryName?: string;
}

/** Outflow types a Shortcut capture can land in — never income, transfer or debt. */
const DEEP_LINK_TYPES: readonly ExpenseType[] = ['variable', 'fixed'];

/**
 * Parse the deep-link request out of a query reader (`searchParams.get`).
 * Returns null when `nuova-spesa=1` is absent — every other entry point is unaffected.
 */
export function parseExpenseDeepLinkRequest(
  get: (name: string) => string | null,
): ExpenseDeepLinkRequest | null {
  if (get(EXPENSE_DEEP_LINK_PARAMS.request) !== '1') return null;
  const request: ExpenseDeepLinkRequest = {};
  const amount = parseDeepLinkAmount(get(EXPENSE_DEEP_LINK_PARAMS.amount));
  if (amount !== undefined) request.amount = amount;
  const notes = (get(EXPENSE_DEEP_LINK_PARAMS.notes) ?? '').trim();
  if (notes) request.notes = notes.slice(0, 200);
  const categoryName = (get(EXPENSE_DEEP_LINK_PARAMS.category) ?? '').trim();
  if (categoryName) request.categoryName = categoryName;
  return request;
}

/**
 * A plain decimal with `.` or `,` — the two ways a Shortcut writes a number — with
 * optional spaces and a trailing €. Anything else (thousands separators, words, a
 * second separator, zero or negative) is not an amount: undefined, so the field
 * stays empty instead of saving a wrong figure.
 */
export function parseDeepLinkAmount(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const cleaned = raw.replace(/[\s €]/g, '').trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return undefined;
  const value = roundToCents(Number(cleaned.replace(',', '.')));
  return value > 0 ? value : undefined;
}

/**
 * Resolve the category hint to a document id. Matches by trimmed name,
 * case-insensitive, over the outflow types only; anything ambiguous (two documents
 * sharing the name, even across types) resolves to null and the user picks by hand.
 */
export function resolveDeepLinkCategory(
  categories: ExpenseCategory[],
  categoryName: string | undefined,
): { categoryId: string; type: ExpenseType } | null {
  if (!categoryName) return null;
  const wanted = categoryName.trim().toLowerCase();
  const matches = categories.filter(
    (c) => c.name.trim().toLowerCase() === wanted && DEEP_LINK_TYPES.includes(c.type),
  );
  if (matches.length !== 1) return null;
  return { categoryId: matches[0].id, type: matches[0].type };
}

/** Turn a parsed request into the dialog's draft, resolving the category by name. */
export function toExpenseDeepLinkDraft(
  request: ExpenseDeepLinkRequest,
  categories: ExpenseCategory[],
): ExpenseDeepLinkDraft {
  const draft: ExpenseDeepLinkDraft = {};
  if (request.amount !== undefined) draft.amount = request.amount;
  if (request.notes !== undefined) draft.notes = request.notes;
  const resolved = resolveDeepLinkCategory(categories, request.categoryName);
  if (resolved) {
    draft.categoryId = resolved.categoryId;
    draft.type = resolved.type;
  } else if (request.categoryName) {
    draft.categoryName = request.categoryName;
  }
  return draft;
}
