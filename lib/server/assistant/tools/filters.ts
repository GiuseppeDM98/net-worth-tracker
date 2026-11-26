import 'server-only';
import { z } from 'zod';
import { foldName, unknownNames, type ExpenseQuery } from '@/lib/utils/assistantExpenseQueries';
import { AssistantToolError, UNREADABLE, type AssistantToolContext } from './define';

/**
 * What the three cashflow tools share: the day, the period, the filters by name, and the check
 * that every name asked exists. The model's input is untrusted: zod is its one gate, a name is
 * only ever compared, never used as a path or a query.
 */

/** «2026-02-30» matches the pattern and is no day: the round trip through `Date.UTC` refuses it. */
function isCalendarDay(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isoDay(description: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'scrivi la data come AAAA-MM-GG')
    .refine(isCalendarDay, 'non è un giorno del calendario')
    .describe(description);
}

export const kindField = z
  .enum(['spending', 'income'])
  .describe('«spending» per le spese (Spese Necessarie, Spese Non Necessarie, Debiti), «income» per le entrate.');

export const filterFields = {
  types: z
    .array(z.enum(['fixed', 'variable', 'debt']))
    .optional()
    .describe('Solo questi tipi di spesa: «fixed» = Spese Necessarie, «variable» = Spese Non Necessarie, «debt» = Debiti. Ignorato per le entrate.'),
  categories: z
    .array(z.string())
    .optional()
    .describe('Solo queste categorie, per nome, scritte come compaiono nei dati (maiuscole e accenti non contano).'),
  subCategories: z
    .array(z.string())
    .optional()
    .describe('Solo queste sottocategorie, per nome, scritte come compaiono nei dati.'),
  costCenters: z
    .array(z.string())
    .optional()
    .describe('Solo questi centri di costo, per nome, scritti come compaiono nei dati.'),
  text: z.string().optional().describe('Una parola o una frase cercata nelle note e nei nomi di categoria, sottocategoria e centro di costo.'),
  minAmount: z.number().min(0).optional().describe('Solo le righe di almeno questo importo, in euro, in valore assoluto.'),
  maxAmount: z.number().min(0).optional().describe('Solo le righe di al più questo importo, in euro, in valore assoluto.'),
  budgetOnly: z.boolean().optional().describe('Solo le righe che il Budget conta (esclude quelle segnate «Fuori dal budget»).'),
  includeScheduled: z.boolean().optional().describe('Includi anche le righe datate dopo oggi, già in calendario. Di default restano fuori.'),
};

export interface FilterInput {
  kind: 'spending' | 'income';
  types?: ('fixed' | 'variable' | 'debt')[];
  categories?: string[];
  subCategories?: string[];
  costCenters?: string[];
  text?: string;
  minAmount?: number;
  maxAmount?: number;
  budgetOnly?: boolean;
  includeScheduled?: boolean;
}

/** The query of a tool's input over one period. */
export function toExpenseQuery(input: FilterInput, period: { from: string; to: string }): ExpenseQuery {
  return {
    fromIso: period.from,
    toIso: period.to,
    kind: input.kind,
    types: input.types,
    categories: input.categories,
    subCategories: input.subCategories,
    costCenters: input.costCenters,
    text: input.text,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    budgetOnly: input.budgetOnly,
    includeScheduled: input.includeScheduled,
  };
}

export function assertPeriod(period: { from: string; to: string }): void {
  if (period.from > period.to) throw new AssistantToolError('Il periodo finisce prima di iniziare.');
}

/** How many existing names an error lists: enough to correct a name, short enough to read. */
const LISTED_NAMES_MAX = 40;

function describeUnknown(label: string, unknown: string[], existing: string[]): string {
  const byFold = new Map<string, string>();
  for (const name of existing) if (name.trim() && !byFold.has(foldName(name))) byFold.set(foldName(name), name.trim());
  const names = [...byFold.values()].sort((a, b) => a.localeCompare(b, 'it'));
  const listed = names.slice(0, LISTED_NAMES_MAX).join(', ');
  const more = names.length > LISTED_NAMES_MAX ? '…' : '';
  return `${label}: ${unknown.map((name) => `«${name}»`).join(', ')}. Esistono: ${listed || 'nessuno'}${more}.`;
}

/**
 * Refuses a filter that names what the account does not hold, listing what it does. The names are
 * the taxonomy's AND the ones written on the rows: a deleted category, a renamed one's old name,
 * still filter the rows that carry them.
 */
export function assertKnownNames(input: FilterInput, context: AssistantToolContext): void {
  const categoryNames = [...context.categories.map((category) => category.name), ...context.expenses.map((row) => row.categoryName)];
  const subCategoryNames = [
    ...context.categories.flatMap((category) => category.subCategories.map((sub) => sub.name)),
    ...context.expenses.map((row) => row.subCategoryName ?? ''),
  ];
  const centerNames = [
    ...(context.costCenters === UNREADABLE ? [] : context.costCenters.map((center) => center.name)),
    ...context.expenses.map((row) => row.costCenterName ?? ''),
  ];
  const checks: [string, string[] | undefined, string[]][] = [
    ['Categoria sconosciuta', input.categories, categoryNames],
    ['Sottocategoria sconosciuta', input.subCategories, subCategoryNames],
    ['Centro di costo sconosciuto', input.costCenters, centerNames],
  ];
  for (const [label, asked, existing] of checks) {
    const unknown = unknownNames(asked, existing);
    if (unknown.length > 0) throw new AssistantToolError(describeUnknown(label, unknown, existing));
  }
}
