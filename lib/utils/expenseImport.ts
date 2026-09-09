/**
 * Pure parse / validate / plan layer for the historical expense-income CSV import.
 *
 * No Firestore here — everything is a pure function so it can be unit-tested.
 * The Firestore commit/undo lives in lib/services/expenseImportService.ts and the
 * wizard UI in components/settings/ExpenseImportSection.tsx.
 *
 * Design notes:
 * - Tolerant to Italian-locale CSVs: delimiter auto-detected (`;`/`,`/tab via Papa
 *   Parse), decimal separator handled for both `1.234,56` (IT) and `1234.56` (EN).
 * - Headers accepted in Italian (canonical) or English (alias), case-insensitive.
 * - `type` optional → inherits the type of the single existing same-named category
 *   when there is exactly one, falls back to `variable` when there is none, and is
 *   rejected as ambiguous when same-named categories of different types exist;
 *   `transfer` rows are skipped (a transfer needs origin/destination cash assets
 *   that a CSV cannot provide).
 * - Category identity is (name, type) — the same rule as the rest of the app
 *   (lib/utils/expenseGrouping.ts): "Casa" fissa and "Casa" variabile are two
 *   distinct categories, resolvable and creatable side by side. When two existing
 *   categories share BOTH name and type, rows attach to the OLDEST document
 *   (deterministic) and the plan carries a notice the preview must show.
 */

import Papa from 'papaparse';
import { ExpenseCategory, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  RawRow,
  PlannedExpenseRow,
  RowError,
  CategoryToCreate,
  SubCategoryToCreate,
  ImportNotice,
  ImportPlan,
  ImportSummary,
  ImportableExpenseType,
} from '@/types/expenseImport';

const IMPORTABLE_TYPES: ImportableExpenseType[] = ['fixed', 'variable', 'debt', 'income'];

// Header aliases → canonical Italian key. Matching is case-insensitive and trimmed.
const HEADER_ALIASES: Record<string, keyof Omit<RawRow, 'line'>> = {
  data: 'data',
  date: 'data',
  importo: 'importo',
  amount: 'importo',
  tipo: 'tipo',
  type: 'tipo',
  categoria: 'categoria',
  category: 'categoria',
  sottocategoria: 'sottocategoria',
  subcategoria: 'sottocategoria',
  subcategory: 'sottocategoria',
  'sub-category': 'sottocategoria',
  note: 'note',
  nota: 'note',
  notes: 'note',
  valuta: 'valuta',
  currency: 'valuta',
};

/** Template shown/downloaded to guide users. Excel-IT friendly (`;` + BOM). */
const TEMPLATE_HEADERS = ['data', 'importo', 'tipo', 'categoria', 'sottocategoria', 'note', 'valuta'] as const;
const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ['2024-01-15', '1200,00', 'fixed', 'Casa', 'Affitto', 'Canone gennaio', 'EUR'],
  ['2024-01-27', '2500,00', 'income', 'Stipendio', '', 'Busta paga', 'EUR'],
  ['2024-02-03', '54,90', 'variable', 'Spesa', 'Supermercato', '', 'EUR'],
];

/** Build the downloadable CSV template as a string (with UTF-8 BOM + `;` delimiter). */
export function buildTemplateCsv(): string {
  const rows = [TEMPLATE_HEADERS as unknown as string[], ...TEMPLATE_EXAMPLE_ROWS];
  const body = rows.map((r) => r.join(';')).join('\r\n');
  return '﻿' + body;
}

/**
 * Parse an Italian-locale number string into a JS number, or null if not parseable.
 *
 * Handles both `1.234,56` (IT: dot thousands, comma decimal) and `1234.56` (EN).
 * Heuristic when a single separator type is present: a separator followed by
 * exactly 3 digits is treated as a thousands group (e.g. `1.234` → 1234,
 * `1,234` → 1234); 1-2 trailing digits means it is the decimal separator.
 * The returned value is always the positive magnitude (sign comes from the type).
 */
export function parseItalianNumber(input: string): number | null {
  if (input == null) return null;
  // Keep only digits and separators (strips € spaces etc.), drop sign.
  const s = String(input).trim().replace(/[^\d.,]/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    // The separator that appears last is the decimal; the other is thousands.
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    normalized = s.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const parts = s.split(sep);
    const lastPart = parts[parts.length - 1];
    // Multiple occurrences, or a single one grouping exactly 3 digits → thousands.
    const isThousands = parts.length > 2 || (parts.length === 2 && lastPart.length === 3);
    normalized = isThousands ? parts.join('') : parts.join('.');
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

/**
 * Parse a date accepting `YYYY-MM-DD` (ISO) or `DD/MM/YYYY` (also `.`/`-` separated).
 * Returns a local Date at midday (avoids TZ/DST month shifts), or null if invalid.
 */
export function parseFlexibleDate(input: string): Date | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === '') return null;

  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const eu = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (iso) {
    y = +iso[1]; m = +iso[2]; d = +iso[3];
  } else if (eu) {
    d = +eu[1]; m = +eu[2]; y = +eu[3];
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  // Reject overflow (e.g. 31/02 rolling into March).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Tokenize a raw CSV string into normalized RawRows.
 *
 * Uses Papa Parse (delimiter auto-detection, RFC-4180 quoting so notes may
 * contain the delimiter). Header cells are matched against HEADER_ALIASES;
 * unknown columns are ignored. Throws if required columns are missing.
 */
export function parseImportCsv(raw: string): RawRow[] {
  const text = raw.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  });
  const table = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (table.length === 0) {
    throw new Error('Il file è vuoto.');
  }

  const header = table[0];
  const colIndex: Partial<Record<keyof Omit<RawRow, 'line'>, number>> = {};
  header.forEach((cell, idx) => {
    const key = HEADER_ALIASES[String(cell).trim().toLowerCase()];
    if (key && colIndex[key] === undefined) colIndex[key] = idx;
  });

  const missing = (['data', 'importo', 'categoria'] as const).filter((k) => colIndex[k] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Intestazioni obbligatorie mancanti: ${missing.join(', ')}. ` +
        `Attese: ${TEMPLATE_HEADERS.join(', ')}.`
    );
  }

  const get = (row: string[], key: keyof Omit<RawRow, 'line'>): string => {
    const i = colIndex[key];
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };

  const rows: RawRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    rows.push({
      line: i, // 1-based, excluding header
      data: get(row, 'data'),
      importo: get(row, 'importo'),
      tipo: get(row, 'tipo'),
      categoria: get(row, 'categoria'),
      sottocategoria: get(row, 'sottocategoria'),
      note: get(row, 'note'),
      valuta: get(row, 'valuta'),
    });
  }
  return rows;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * The category identity the import resolves against: (normalized name, type).
 * Shared with the commit layer (expenseImportService) so plan and write can never
 * disagree on which document a row attaches to.
 */
export function categoryMatchKey(name: string, type: string): string {
  return `${type}::${norm(name)}`;
}

/**
 * Turn raw rows into a full ImportPlan against the user's existing categories.
 *
 * Row-level validation produces PlannedExpenseRows or RowErrors. Categories are
 * resolved by (name, type): a same-named category of a different type is a
 * different document, never a conflict. Rows without a type inherit the single
 * existing namesake's type (ambiguous namesakes are rejected with the reason).
 * Two existing categories sharing BOTH name and type resolve to the oldest one,
 * and the plan carries a notice the preview must display. Finally it derives
 * which categories / subcategories must be created and a human-facing summary.
 */
export function buildImportPlan(rows: RawRow[], existingCategories: ExpenseCategory[]): ImportPlan {
  // (name, type) → existing categories, oldest first: [0] is the resolution target.
  const existingByKey = new Map<string, ExpenseCategory[]>();
  // name → importable types it exists under, for the untyped-row inheritance rule.
  const existingTypesByName = new Map<string, Set<ImportableExpenseType>>();
  for (const c of existingCategories) {
    if (!(IMPORTABLE_TYPES as string[]).includes(c.type)) continue; // transfer categories are not importable targets
    const key = categoryMatchKey(c.name, c.type);
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), c]);
    const nameKey = norm(c.name);
    if (!existingTypesByName.has(nameKey)) existingTypesByName.set(nameKey, new Set());
    existingTypesByName.get(nameKey)!.add(c.type as ImportableExpenseType);
  }
  for (const list of existingByKey.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  const errors: RowError[] = [];
  const validRows: PlannedExpenseRow[] = [];

  for (const row of rows) {
    if (!row.categoria) {
      errors.push({ line: row.line, reason: 'Categoria mancante.', raw: row });
      continue;
    }

    const date = parseFlexibleDate(row.data);
    if (!date) {
      errors.push({ line: row.line, reason: `Data non valida: "${row.data}".`, raw: row });
      continue;
    }

    const amount = parseItalianNumber(row.importo);
    if (amount === null || amount === 0) {
      errors.push({ line: row.line, reason: `Importo non valido: "${row.importo}".`, raw: row });
      continue;
    }

    const rawType = norm(row.tipo);
    if (rawType === 'transfer') {
      errors.push({ line: row.line, reason: "Tipo 'transfer' non supportato dall'import (riga saltata).", raw: row });
      continue;
    }
    let type: ImportableExpenseType;
    if (rawType === '') {
      // Untyped row: inherit the type of the single existing namesake — defaulting
      // blindly to 'variable' beside an existing fixed "Casa" would silently create
      // a same-named duplicate. Ambiguous namesakes need the user to say which.
      const namesakeTypes = existingTypesByName.get(norm(row.categoria)) ?? new Set<ImportableExpenseType>();
      if (namesakeTypes.size > 1) {
        const labels = [...namesakeTypes].map((t) => EXPENSE_TYPE_LABELS[t]).join(' e ');
        errors.push({
          line: row.line,
          reason: `Tipo mancante e ambiguo: "${row.categoria}" esiste sia come ${labels}. Specifica il tipo nella colonna "tipo".`,
          raw: row,
        });
        continue;
      }
      type = namesakeTypes.size === 1 ? [...namesakeTypes][0] : 'variable';
    } else if ((IMPORTABLE_TYPES as string[]).includes(rawType)) {
      type = rawType as ImportableExpenseType;
    } else {
      errors.push({ line: row.line, reason: `Tipo non valido: "${row.tipo}".`, raw: row });
      continue;
    }

    const resolved = existingByKey.get(categoryMatchKey(row.categoria, type))?.[0];
    validRows.push({
      line: row.line,
      date,
      amount,
      type,
      categoryName: row.categoria.trim(),
      categoryId: resolved?.id,
      subCategoryName: row.sottocategoria ? row.sottocategoria.trim() : undefined,
      notes: row.note || undefined,
      currency: (row.valuta || 'EUR').toUpperCase(),
    });
  }

  // Derive categories / subcategories to create from the valid rows — keyed by
  // (name, type), so "Casa" fissa and "Casa" variabile can be created side by side.
  const categoriesToCreate: CategoryToCreate[] = [];
  const subCategoriesToCreate: SubCategoryToCreate[] = [];
  const notices: ImportNotice[] = [];
  const newCatByKey = new Map<string, CategoryToCreate>();
  const subAddByKey = new Map<string, SubCategoryToCreate>();
  const noticedKeys = new Set<string>();

  for (const c of validRows) {
    const key = categoryMatchKey(c.categoryName, c.type);
    const existingList = existingByKey.get(key);
    const existing = existingList?.[0];

    // Two existing categories share this exact (name, type): the attachment to the
    // oldest is deterministic but must be DISCLOSED, not silent — the preview is
    // mandatory before any write, so this is where the user gets to see it.
    if (existingList && existingList.length > 1 && !noticedKeys.has(key)) {
      noticedKeys.add(key);
      notices.push({
        categoryName: existing!.name,
        type: c.type,
        duplicateCount: existingList.length,
        message: `Esistono ${existingList.length} categorie «${existing!.name}» (${EXPENSE_TYPE_LABELS[c.type]}): le righe importate verranno agganciate alla più vecchia.`,
      });
    }

    if (!existing) {
      let entry = newCatByKey.get(key);
      if (!entry) {
        entry = { name: c.categoryName, type: c.type, subCategories: [] };
        newCatByKey.set(key, entry);
        categoriesToCreate.push(entry);
      }
      if (c.subCategoryName && !entry.subCategories.some((s) => norm(s) === norm(c.subCategoryName!))) {
        entry.subCategories.push(c.subCategoryName);
      }
    } else if (c.subCategoryName) {
      const alreadyHas = existing.subCategories.some((s) => norm(s.name) === norm(c.subCategoryName!));
      if (!alreadyHas) {
        let entry = subAddByKey.get(key);
        if (!entry) {
          entry = { categoryId: existing.id, categoryName: existing.name, subCategoryNames: [] };
          subAddByKey.set(key, entry);
          subCategoriesToCreate.push(entry);
        }
        if (!entry.subCategoryNames.some((s) => norm(s) === norm(c.subCategoryName!))) {
          entry.subCategoryNames.push(c.subCategoryName);
        }
      }
    }
  }

  const summary = buildSummary(validRows, errors, categoriesToCreate.length);
  return { validRows, errors, categoriesToCreate, subCategoriesToCreate, notices, summary };
}

function buildSummary(validRows: PlannedExpenseRow[], errors: RowError[], newCategoriesCount: number): ImportSummary {
  let totalIncome = 0;
  let totalExpense = 0;
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  for (const r of validRows) {
    if (r.type === 'income') totalIncome += r.amount;
    else totalExpense += r.amount;
    if (!dateFrom || r.date < dateFrom) dateFrom = r.date;
    if (!dateTo || r.date > dateTo) dateTo = r.date;
  }

  return {
    validCount: validRows.length,
    skippedCount: errors.length,
    newCategoriesCount,
    totalIncome,
    totalExpense,
    dateFrom,
    dateTo,
  };
}
