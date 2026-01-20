/**
 * Cashflow Sankey Diagram Component with Budget Flow and Drill-down
 *
 * THREE MODES:
 * 1. Budget View (default): Income Categories → Budget → Expense Types → Expense Categories + Savings
 * 2. Type Drill-down: Expense Type → Categories (for that type)
 * 3. Category Drill-down: Category → Subcategories
 *
 * Data Flow (Budget View - 4-layer):
 * - Layer 1 (Left): Income categories (Stipendio, Bonus, etc.)
 * - Layer 2 (Center-left): Budget node (total income)
 * - Layer 3 (Center-right): Expense types (Spese Fisse, Variabili, Debiti)
 * - Layer 4 (Right): Expense categories (grouped by type) + Savings
 *
 * Interaction:
 * - Click on expense type → drill down to type → categories
 * - Click on any category → drill down to category → subcategories
 * - Click Budget/Risparmi → no action
 * - Back button → return to budget view
 *
 * Used by: CurrentYearTab and TotalHistoryTab cashflow pages
 */
'use client';

import { useState, useMemo } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { formatCurrency, formatCurrencyForSankey } from '@/lib/services/chartService';
import { toDate } from '@/lib/utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ExternalLink } from 'lucide-react';

// Color palette for categories (matches existing COLORS array in CurrentYearTab/TotalHistoryTab)
const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
];

interface CashflowSankeyChartProps {
  expenses: Expense[];    // All expenses for the period (income + expenses)
  isMobile: boolean;      // Responsive flag (computed in parent)
  title?: string;         // Optional custom title
}

interface SankeyNode {
  id: string;
  nodeColor: string;
  label?: string; // Optional display label (if different from id)
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

/**
 * Derive subcategory colors from parent category color
 *
 * Algorithm: Brightness-based variation from base color
 * - Parse hex to RGB
 * - Apply brightness factor (1.0 → 0.55) for gradual darkening
 * - Convert back to hex
 */
const deriveSubcategoryColors = (baseColor: string, count: number): string[] => {
  // Parse hex color to RGB
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    // Create variations by adjusting brightness (gradually darken)
    const factor = 1 - (i * 0.15);
    const newR = Math.round(Math.max(0, Math.min(255, r * factor)));
    const newG = Math.round(Math.max(0, Math.min(255, g * factor)));
    const newB = Math.round(Math.max(0, Math.min(255, b * factor)));
    colors.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
  }
  return colors;
};

/**
 * Build Budget Flow Sankey: Income Categories → Budget → Expense Types → Expense Categories + Savings
 *
 * Algorithm:
 * 1. Aggregate income by category (left side)
 * 2. Aggregate expenses by TYPE (Spese Fisse, Variabili, Debiti)
 * 3. Aggregate expenses by TYPE+CATEGORY (Map<ExpenseType, Map<category, amount>>)
 * 4. Calculate savings (income - expenses)
 * 5. Create Budget node (center) with total income value
 * 6. Build links: Income → Budget, Budget → Types, Types → Categories, Budget → Savings
 * 7. Apply mobile filtering (top N categories per type)
 *
 * Structure (4-layer):
 * - Left nodes: Income categories
 * - Center-left node: "Budget" (total income)
 * - Center-right nodes: Expense types (Spese Fisse, Variabili, Debiti)
 * - Right nodes: Expense categories (grouped by type) + "Risparmi" (if positive)
 *
 * @param expenses - All expenses for period (income + expenses)
 * @param isMobile - Apply mobile optimizations (top N filtering)
 * @returns Nivo Sankey data structure { nodes, links }
 */
const buildBudgetFlowData = (expenses: Expense[], isMobile: boolean): SankeyData => {
  // Step 1: Aggregate income by category
  const incomeMap = new Map<string, number>();

  // Step 2: Aggregate expenses by TYPE
  const expenseTypeMap = new Map<ExpenseType, number>();

  // Step 3: Aggregate expenses by TYPE+CATEGORY
  const typeAndCategoryMap = new Map<ExpenseType, Map<string, number>>();

  let totalIncome = 0;
  let totalExpenses = 0;

  expenses.forEach(expense => {
    const amount = Math.abs(expense.amount);
    const category = expense.categoryName;
    const type = expense.type;

    if (type === 'income') {
      incomeMap.set(category, (incomeMap.get(category) || 0) + amount);
      totalIncome += amount;
    } else {
      // Aggregate by expense type
      expenseTypeMap.set(type, (expenseTypeMap.get(type) || 0) + amount);
      totalExpenses += amount;

      // Aggregate by type+category
      if (!typeAndCategoryMap.has(type)) {
        typeAndCategoryMap.set(type, new Map<string, number>());
      }
      const categoryMap = typeAndCategoryMap.get(type)!;
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    }
  });

  // Step 4: Calculate savings (can be negative if spending > income)
  const savings = totalIncome - totalExpenses;

  // Step 5: Mobile filtering - keep top N categories
  let incomeCategories = Array.from(incomeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  if (isMobile) {
    // Mobile: top 5 income categories
    incomeCategories = incomeCategories.slice(0, 5);
  }

  // Step 6: Extract expense types and filter categories per type
  const expenseTypes: ExpenseType[] = ['fixed', 'variable', 'debt'];
  const typeColors: Record<ExpenseType, string> = {
    fixed: '#3b82f6',     // blue
    variable: '#8b5cf6',  // violet
    debt: '#f59e0b',      // amber
    income: '#10b981',    // green (not used in expense flow)
  };

  // Build category list per type with mobile filtering
  const categoriesPerType = new Map<ExpenseType, Array<{ name: string; value: number }>>();

  expenseTypes.forEach(type => {
    const categoryMap = typeAndCategoryMap.get(type);
    if (!categoryMap) {
      categoriesPerType.set(type, []);
      return;
    }

    let categories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    if (isMobile) {
      // Mobile: top 3-4 categories per type
      categories = categories.slice(0, 3);
    }

    categoriesPerType.set(type, categories);
  });

  // Step 7: Assign colors to income categories
  const incomeColorMap = new Map<string, string>();
  incomeCategories.forEach((cat, index) => {
    incomeColorMap.set(cat.name, COLORS[index % COLORS.length]);
  });

  // Step 8: Build nodes
  const nodes: SankeyNode[] = [
    // Left: Income categories
    ...incomeCategories.map(cat => ({
      id: cat.name,
      nodeColor: incomeColorMap.get(cat.name)!
    })),
    // Center-left: Budget node (green color)
    {
      id: 'Budget',
      nodeColor: '#10b981' // green
    },
    // Center-right: Expense type nodes (only if they have expenses)
    ...expenseTypes
      .filter(type => expenseTypeMap.has(type) && expenseTypeMap.get(type)! > 0)
      .map(type => ({
        id: EXPENSE_TYPE_LABELS[type],
        nodeColor: typeColors[type]
      })),
    // Right: Expense categories (grouped by type, with derived colors)
    ...expenseTypes.flatMap(type => {
      const categories = categoriesPerType.get(type) || [];
      const typeColor = typeColors[type];
      const derivedColors = deriveSubcategoryColors(typeColor, categories.length);

      return categories.map((cat, index) => ({
        id: cat.name,
        nodeColor: derivedColors[index]
      }));
    }),
    // Right: Savings (only if positive)
    ...(savings > 0 ? [{
      id: 'Risparmi',
      nodeColor: '#3b82f6' // blue
    }] : [])
  ];

  // Step 9: Build links
  const links: SankeyLink[] = [
    // Income → Budget
    ...incomeCategories.map(cat => ({
      source: cat.name,
      target: 'Budget',
      value: cat.value
    })),
    // Budget → Expense Types
    ...expenseTypes
      .filter(type => expenseTypeMap.has(type) && expenseTypeMap.get(type)! > 0)
      .map(type => ({
        source: 'Budget',
        target: EXPENSE_TYPE_LABELS[type],
        value: expenseTypeMap.get(type)!
      })),
    // Expense Types → Categories (per type)
    ...expenseTypes.flatMap(type => {
      const categories = categoriesPerType.get(type) || [];
      return categories.map(cat => ({
        source: EXPENSE_TYPE_LABELS[type],
        target: cat.name,
        value: cat.value
      }));
    }),
    // Budget → Savings (only if positive)
    ...(savings > 0 ? [{
      source: 'Budget',
      target: 'Risparmi',
      value: savings
    }] : [])
  ];

  return { nodes, links };
};

/**
 * Build 5-layer Budget Flow Sankey with subcategories layer
 *
 * Extends buildBudgetFlowData by adding granular subcategory breakdown.
 * Architecture: Income → Budget → Types → Categories → Subcategories + Savings
 *
 * Algorithm:
 * 1. Aggregate expenses in triple-nested Map (Type → Category → Subcategory → Amount)
 * 2. Build 5-layer node structure with color derivation chain:
 *    - Type colors (fixed)
 *    - Category colors (derived from type, -15% brightness per item)
 *    - Subcategory colors (derived from category, -15% brightness per item)
 * 3. Apply mobile filtering (top 4 subcategories per category)
 * 4. Map expenses without subCategoryName to "Altro" fallback
 *
 * Why 5 layers? Provides granular expense breakdown while maintaining visual hierarchy.
 * Trade-off: More nodes (~40-50 typical) but within Nivo Sankey capacity.
 *
 * @param expenses - All expenses for period
 * @param isMobile - Apply mobile optimizations (top N filtering)
 * @returns Nivo Sankey data structure { nodes, links }
 */
const buildBudgetFlowDataWithSubcategories = (expenses: Expense[], isMobile: boolean): SankeyData => {
  // Step 1: Aggregate income by category
  const incomeMap = new Map<string, number>();

  // Step 2: Aggregate expenses by TYPE
  const expenseTypeMap = new Map<ExpenseType, number>();

  // Step 3: Aggregate expenses by TYPE+CATEGORY+SUBCATEGORY (triple-nested Map)
  const typeAndCategoryAndSubcategoryMap = new Map<ExpenseType, Map<string, Map<string, number>>>();

  let totalIncome = 0;
  let totalExpenses = 0;

  expenses.forEach(expense => {
    const amount = Math.abs(expense.amount);
    const category = expense.categoryName;
    const type = expense.type;

    if (type === 'income') {
      incomeMap.set(category, (incomeMap.get(category) || 0) + amount);
      totalIncome += amount;
    } else {
      // Aggregate by expense type
      expenseTypeMap.set(type, (expenseTypeMap.get(type) || 0) + amount);
      totalExpenses += amount;

      // Aggregate by type+category+subcategory (triple-nested)
      const subcategory = expense.subCategoryName || 'Altro'; // Fallback for expenses without subcategory

      if (!typeAndCategoryAndSubcategoryMap.has(type)) {
        typeAndCategoryAndSubcategoryMap.set(type, new Map<string, Map<string, number>>());
      }
      const categoryMap = typeAndCategoryAndSubcategoryMap.get(type)!;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map<string, number>());
      }
      const subcategoryMap = categoryMap.get(category)!;

      subcategoryMap.set(subcategory, (subcategoryMap.get(subcategory) || 0) + amount);
    }
  });

  // Step 4: Calculate savings
  const savings = totalIncome - totalExpenses;

  // Step 5: Mobile filtering - income categories
  let incomeCategories = Array.from(incomeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  if (isMobile) {
    incomeCategories = incomeCategories.slice(0, 5);
  }

  // Step 6: Extract expense types
  const expenseTypes: ExpenseType[] = ['fixed', 'variable', 'debt'];
  const typeColors: Record<ExpenseType, string> = {
    fixed: '#3b82f6',     // blue
    variable: '#8b5cf6',  // violet
    debt: '#f59e0b',      // amber
    income: '#10b981',    // green (not used in expense flow)
  };

  // Step 7: Build category and subcategory lists per type with mobile filtering
  const categoriesPerType = new Map<ExpenseType, Array<{ name: string; value: number; color: string }>>();
  const subcategoriesPerCategory = new Map<string, Array<{ name: string; value: number; color: string }>>();

  expenseTypes.forEach(type => {
    const categoryMap = typeAndCategoryAndSubcategoryMap.get(type);
    if (!categoryMap) {
      categoriesPerType.set(type, []);
      return;
    }

    // Calculate category totals (sum of all subcategories)
    let categories = Array.from(categoryMap.entries())
      .map(([categoryName, subcategoryMap]) => {
        const total = Array.from(subcategoryMap.values()).reduce((sum, val) => sum + val, 0);
        return { name: categoryName, value: total };
      })
      .sort((a, b) => b.value - a.value);

    // Mobile filtering for categories
    if (isMobile) {
      categories = categories.slice(0, 3);
    }

    // Derive colors for categories from type color
    const typeColor = typeColors[type];
    const categoryColors = deriveSubcategoryColors(typeColor, categories.length);

    // Assign colors to categories and build subcategory lists
    const categoriesWithColors = categories.map((cat, catIndex) => {
      const categoryColor = categoryColors[catIndex];

      // Get subcategories for this category
      const subcategoryMap = categoryMap.get(cat.name)!;
      let subcategories = Array.from(subcategoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));

      // Mobile filtering for subcategories
      if (isMobile) {
        subcategories = subcategories.slice(0, 4);
      }

      // Derive colors for subcategories from category color
      const subcategoryColors = deriveSubcategoryColors(categoryColor, subcategories.length);
      const subcategoriesWithColors = subcategories.map((subcat, subcatIndex) => ({
        name: subcat.name,
        value: subcat.value,
        color: subcategoryColors[subcatIndex]
      }));

      // Store subcategories for later link building
      subcategoriesPerCategory.set(cat.name, subcategoriesWithColors);

      return {
        name: cat.name,
        value: cat.value,
        color: categoryColor
      };
    });

    categoriesPerType.set(type, categoriesWithColors);
  });

  // Step 8: Assign colors to income categories
  const incomeColorMap = new Map<string, string>();
  incomeCategories.forEach((cat, index) => {
    incomeColorMap.set(cat.name, COLORS[index % COLORS.length]);
  });

  // Step 9: Build nodes (5 layers)
  const nodes: SankeyNode[] = [
    // Layer 1 (Left): Income categories
    ...incomeCategories.map(cat => ({
      id: cat.name,
      nodeColor: incomeColorMap.get(cat.name)!
    })),
    // Layer 2 (Center-left): Budget node
    {
      id: 'Budget',
      nodeColor: '#10b981' // green
    },
    // Layer 3 (Center): Expense type nodes
    ...expenseTypes
      .filter(type => expenseTypeMap.has(type) && expenseTypeMap.get(type)! > 0)
      .map(type => ({
        id: EXPENSE_TYPE_LABELS[type],
        nodeColor: typeColors[type]
      })),
    // Layer 4 (Center-right): Expense categories (grouped by type, with derived colors)
    // Why: Prevent dangling category nodes in 5-layer view
    // Categories with only "Altro" subcategories are filtered here to match
    // the subcategory filtering logic (lines 465-468). This prevents Nivo Sankey
    // "circular link" errors caused by nodes without incoming/outgoing links.
    ...expenseTypes.flatMap(type => {
      const categories = categoriesPerType.get(type) || [];
      return categories
        .filter(cat => {
          const subcategories = subcategoriesPerCategory.get(cat.name) || [];
          return !(subcategories.length === 1 && subcategories[0].name === 'Altro');
        })
        .map(cat => ({
          id: cat.name,
          nodeColor: cat.color
        }));
    }),
    // Layer 5 (Right): Subcategories (grouped by category, with derived colors)
    ...Array.from(subcategoriesPerCategory.entries()).flatMap(([categoryName, subcategories]) => {
      // Skip subcategories if only "Altro" exists (no real subcategories)
      if (subcategories.length === 1 && subcategories[0].name === 'Altro') {
        return [];
      }
      return subcategories.map(subcat => ({
        id: `${categoryName}__${subcat.name}`, // Unique ID to prevent collisions
        label: subcat.name, // Display only subcategory name, not "Category_Subcategory"
        nodeColor: subcat.color
      }));
    }),
    // Layer 5 (Right): Savings (only if positive)
    ...(savings > 0 ? [{
      id: 'Risparmi',
      nodeColor: '#3b82f6' // blue
    }] : [])
  ];

  // Step 10: Build links (5-layer flow)
  const links: SankeyLink[] = [
    // Income → Budget
    ...incomeCategories.map(cat => ({
      source: cat.name,
      target: 'Budget',
      value: cat.value
    })),
    // Budget → Expense Types
    ...expenseTypes
      .filter(type => expenseTypeMap.has(type) && expenseTypeMap.get(type)! > 0)
      .map(type => ({
        source: 'Budget',
        target: EXPENSE_TYPE_LABELS[type],
        value: expenseTypeMap.get(type)!
      })),
    // Expense Types → Categories (per type)
    // Filter links to match filtered category nodes (categories with only "Altro" are excluded)
    ...expenseTypes.flatMap(type => {
      const categories = categoriesPerType.get(type) || [];
      return categories
        .filter(cat => {
          const subcategories = subcategoriesPerCategory.get(cat.name) || [];
          return !(subcategories.length === 1 && subcategories[0].name === 'Altro');
        })
        .map(cat => ({
          source: EXPENSE_TYPE_LABELS[type],
          target: cat.name,
          value: cat.value
        }));
    }),
    // Categories → Subcategories (NEW LAYER)
    ...Array.from(subcategoriesPerCategory.entries()).flatMap(([categoryName, subcategories]) => {
      // Skip link if only "Altro" exists (no real subcategories)
      if (subcategories.length === 1 && subcategories[0].name === 'Altro') {
        return [];
      }
      return subcategories.map(subcat => ({
        source: categoryName,
        target: `${categoryName}__${subcat.name}`, // Match unique ID from nodes
        value: subcat.value
      }));
    }),
    // Budget → Savings (only if positive)
    ...(savings > 0 ? [{
      source: 'Budget',
      target: 'Risparmi',
      value: savings
    }] : [])
  ];

  return { nodes, links };
};

/**
 * Build Type Drill-down Sankey: Expense Type → Categories
 *
 * Algorithm:
 * 1. Filter expenses for selected type (fixed, variable, or debt)
 * 2. Aggregate by category within that type
 * 3. Apply mobile filtering (top N categories)
 * 4. Build nodes: Type + Categories
 * 5. Build links: Type → Categories
 * 6. Derive category colors from type color
 *
 * @param expenses - All expenses for period
 * @param typeName - Selected expense type label (e.g., "Spese Fisse")
 * @param typeColor - Color of selected type
 * @param isMobile - Apply mobile optimizations
 * @returns Nivo Sankey data structure { nodes, links }
 */
const buildTypeDrillDownData = (
  expenses: Expense[],
  typeName: string,
  typeColor: string,
  isMobile: boolean
): SankeyData => {
  // Find the ExpenseType enum value from the label
  const typeEntry = Object.entries(EXPENSE_TYPE_LABELS).find(([_, label]) => label === typeName);
  if (!typeEntry) {
    return { nodes: [], links: [] };
  }
  const expenseType = typeEntry[0] as ExpenseType;

  // Step 1: Filter expenses for selected type
  const filteredExpenses = expenses.filter(e => e.type === expenseType);

  if (filteredExpenses.length === 0) {
    return { nodes: [], links: [] };
  }

  // Step 2: Aggregate by category
  const categoryMap = new Map<string, number>();

  filteredExpenses.forEach(expense => {
    const category = expense.categoryName;
    const amount = Math.abs(expense.amount);
    categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
  });

  // Step 3: Sort and filter
  let categories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  if (isMobile && categories.length > 8) {
    // Mobile: top 8 categories
    categories = categories.slice(0, 8);
  }

  // Step 4: Derive colors from type color
  const derivedColors = deriveSubcategoryColors(typeColor, categories.length);
  const categoryColorMap = new Map<string, string>();
  categories.forEach((cat, index) => {
    categoryColorMap.set(cat.name, derivedColors[index]);
  });

  // Step 5: Build nodes
  const nodes: SankeyNode[] = [
    // Left: Type node
    {
      id: typeName,
      nodeColor: typeColor
    },
    // Right: Category nodes
    ...categories.map(cat => ({
      id: cat.name,
      nodeColor: categoryColorMap.get(cat.name)!
    }))
  ];

  // Step 6: Build links
  const links: SankeyLink[] = categories.map(cat => ({
    source: typeName,
    target: cat.name,
    value: cat.value
  }));

  return { nodes, links };
};

/**
 * Build Drill-down Sankey: Category → Subcategories
 *
 * Algorithm:
 * 1. Filter expenses for selected category
 * 2. Aggregate by subcategory (map missing to "Altro")
 * 3. Apply mobile filtering (top N subcategories)
 * 4. Build nodes: Category + Subcategories
 * 5. Build links: Category → Subcategories
 * 6. Derive subcategory colors from category color
 *
 * @param expenses - All expenses for period
 * @param categoryName - Selected category name
 * @param categoryColor - Color of selected category
 * @param isIncome - Whether this is an income category
 * @param isMobile - Apply mobile optimizations
 * @returns Nivo Sankey data structure { nodes, links }
 */
const buildDrillDownData = (
  expenses: Expense[],
  categoryName: string,
  categoryColor: string,
  isIncome: boolean,
  isMobile: boolean
): SankeyData => {
  // Step 1: Filter expenses for selected category
  const filteredExpenses = expenses.filter(e =>
    e.categoryName === categoryName &&
    (isIncome ? e.type === 'income' : e.type !== 'income')
  );

  if (filteredExpenses.length === 0) {
    return { nodes: [], links: [] };
  }

  // Step 2: Aggregate by subcategory
  const subcategoryMap = new Map<string, number>();

  filteredExpenses.forEach(expense => {
    // Map undefined subcategories to "Altro"
    const subcategory = expense.subCategoryName || 'Altro';
    const amount = Math.abs(expense.amount);
    subcategoryMap.set(subcategory, (subcategoryMap.get(subcategory) || 0) + amount);
  });

  // Step 3: Sort and filter
  let subcategories = Array.from(subcategoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  if (isMobile && subcategories.length > 8) {
    // Mobile: top 8 subcategories
    subcategories = subcategories.slice(0, 8);
  }

  // Step 4: Derive colors from category color
  const derivedColors = deriveSubcategoryColors(categoryColor, subcategories.length);
  const subcategoryColorMap = new Map<string, string>();
  subcategories.forEach((subcat, index) => {
    subcategoryColorMap.set(subcat.name, derivedColors[index]);
  });

  // Step 5: Build nodes
  const nodes: SankeyNode[] = [
    // Left: Category node
    {
      id: categoryName,
      nodeColor: categoryColor
    },
    // Right: Subcategory nodes
    ...subcategories.map(subcat => ({
      id: subcat.name,
      nodeColor: subcategoryColorMap.get(subcat.name)!
    }))
  ];

  // Step 6: Build links
  const links: SankeyLink[] = subcategories.map(subcat => ({
    source: categoryName,
    target: subcat.name,
    value: subcat.value
  }));

  return { nodes, links };
};

export function CashflowSankeyChart({
  expenses,
  isMobile,
  title
}: CashflowSankeyChartProps) {
  // Drill-down state: tracks selected item for drill-down view
  // mode: 'type' for Type→Categories, 'category' for Category→Subcategories, 'transactions' for transaction list
  const [selectedCategory, setSelectedCategory] = useState<{
    name: string;
    color: string;
    isIncome: boolean;
    mode?: 'type' | 'category' | 'transactions';
    parentType?: string;             // Expense type name for breadcrumb (e.g., "Variabili")
    parentCategory?: string;         // Category name for transaction filtering
    selectedSubcategory?: string;    // Subcategory name for transaction filtering
  } | null>(null);

  // Toggle for showing subcategories in budget view (5-layer vs 4-layer)
  const [showSubcategories, setShowSubcategories] = useState(false);

  // Build Sankey data based on current mode (budget view vs drill-down modes vs transactions)
  const sankeyData = useMemo(() => {
    if (selectedCategory) {
      if (selectedCategory.mode === 'type') {
        // Type drill-down mode: show expense type → categories
        return buildTypeDrillDownData(
          expenses,
          selectedCategory.name,
          selectedCategory.color,
          isMobile
        );
      } else if (selectedCategory.mode === 'category') {
        // Category drill-down mode: show category → subcategories
        return buildDrillDownData(
          expenses,
          selectedCategory.name,
          selectedCategory.color,
          selectedCategory.isIncome,
          isMobile
        );
      } else if (selectedCategory.mode === 'transactions') {
        // Transaction list mode: don't render Sankey, render table instead
        return { nodes: [], links: [] };
      }
    }
    // Budget mode: conditional invocation based on subcategories toggle
    if (showSubcategories) {
      // 5-layer mode: show income → budget → types → categories → subcategories + savings
      return buildBudgetFlowDataWithSubcategories(expenses, isMobile);
    }
    // 4-layer mode: show income → budget → types → categories + savings
    return buildBudgetFlowData(expenses, isMobile);
  }, [expenses, selectedCategory, isMobile, showSubcategories]);

  // Calculate total amount for percentage display in tooltips
  const totalAmount = useMemo(() => {
    return sankeyData.links.reduce((sum, link) => {
      // Avoid double-counting by only summing links from source nodes
      // In budget view: sum income links (to Budget)
      // In drill-down: sum all links (they're all from category to subcategories)
      if (selectedCategory || link.target === 'Budget') {
        return sum + link.value;
      }
      return sum;
    }, 0);
  }, [sankeyData, selectedCategory]);

  // Responsive configuration
  const chartConfig = isMobile
    ? {
        // Mobile: compact layout, labels inside, simplified
        height: 400,
        margin: { top: 20, right: 60, bottom: 20, left: 60 },
        nodeThickness: 15,
        nodeSpacing: 8,
        nodeBorderWidth: 1,
        enableLinkGradient: false, // Performance optimization
        labelPosition: 'inside' as const,
        labelOffset: 0,
      }
    : {
        // Desktop: spacious layout, labels outside, full detail
        height: 500,
        margin: { top: 40, right: 160, bottom: 40, left: 160 },
        nodeThickness: 20,
        nodeSpacing: 10,
        nodeBorderWidth: 2,
        enableLinkGradient: true,
        labelPosition: 'outside' as const,
        labelOffset: 12,
      };

  // Check if a category has actual subcategories (not just "Altro")
  // Used to decide whether to show subcategory drill-down or transaction list
  const checkIfCategoryHasSubcategories = (categoryName: string): boolean => {
    const categoryExpenses = expenses.filter(e => e.categoryName === categoryName);
    // Has subcategories if at least one expense has a non-null subCategoryName
    return categoryExpenses.some(e => e.subCategoryName);
  };

  // Handle node click for multi-level drill-down navigation
  const handleNodeClick = (node: any) => {
    // Don't drill down into Budget or Risparmi nodes
    if (node.id === 'Budget' || node.id === 'Risparmi') {
      return;
    }

    // Handle subcategory click in 5-layer view (when showSubcategories is ON)
    // Subcategory IDs are in format "CategoryName__SubcategoryName"
    if (node.id.includes('__')) {
      const [categoryName, subcategoryName] = node.id.split('__');
      const isIncome = expenses.some(e => e.categoryName === categoryName && e.type === 'income');

      setSelectedCategory({
        name: categoryName,
        color: node.color,
        isIncome,
        mode: 'transactions',
        parentCategory: categoryName,
        selectedSubcategory: subcategoryName,
      });
      return;
    }

    // Check if this is an expense type node (Spese Fisse, Variabili, Debiti)
    const expenseTypeLabels = Object.values(EXPENSE_TYPE_LABELS).filter(label => label !== 'Entrate');
    const isExpenseType = expenseTypeLabels.includes(node.id);

    // BUDGET VIEW: drill into type or category
    if (!selectedCategory) {
      if (isExpenseType) {
        // Type drill-down: show expense type → categories
        setSelectedCategory({
          name: node.id,
          color: node.color,
          isIncome: false,
          mode: 'type'
        });
      } else {
        // Category drill-down or transactions: depends on whether category has subcategories
        const hasSubcategories = checkIfCategoryHasSubcategories(node.id);
        const isIncome = expenses.some(e => e.categoryName === node.id && e.type === 'income');

        setSelectedCategory({
          name: node.id,
          color: node.color,
          isIncome,
          mode: hasSubcategories ? 'category' : 'transactions',
          parentCategory: node.id,
        });
      }
    }
    // TYPE DRILL-DOWN: drill into category
    else if (selectedCategory.mode === 'type') {
      // Check if category has subcategories to decide next mode
      const hasSubcategories = checkIfCategoryHasSubcategories(node.id);
      const isIncome = expenses.some(e => e.categoryName === node.id && e.type === 'income');

      setSelectedCategory({
        name: node.id,
        color: node.color,
        isIncome,
        mode: hasSubcategories ? 'category' : 'transactions',
        parentType: selectedCategory.name,  // Track the expense type for breadcrumb
        parentCategory: node.id,
      });
    }
    // CATEGORY DRILL-DOWN: drill into subcategory (show transactions)
    else if (selectedCategory.mode === 'category') {
      setSelectedCategory({
        ...selectedCategory,
        mode: 'transactions',
        selectedSubcategory: node.id,
      });
    }
  };

  // Filter expenses for transaction list view
  // Returns expenses matching the selected category/subcategory
  const getFilteredExpenses = (): Expense[] => {
    if (!selectedCategory || selectedCategory.mode !== 'transactions') {
      return [];
    }

    return expenses.filter(expense => {
      // Match category
      const matchesCategory = expense.categoryName ===
        (selectedCategory.parentCategory || selectedCategory.name);

      // Match income/expense type
      const matchesType = selectedCategory.isIncome
        ? expense.type === 'income'
        : expense.type !== 'income';

      if (!matchesCategory || !matchesType) return false;

      // If subcategory selected, filter by it
      if (selectedCategory.selectedSubcategory) {
        if (selectedCategory.selectedSubcategory === 'Altro') {
          // "Altro" matches null subcategoryName
          return !expense.subCategoryName;
        }
        return expense.subCategoryName === selectedCategory.selectedSubcategory;
      }

      return true;
    });
  };

  // Handle back button click for multi-level navigation
  const handleBack = () => {
    if (selectedCategory?.mode === 'transactions') {
      // Check if we came from 5-layer view (direct subcategory click)
      const cameFrom5LayerView = !selectedCategory.parentType && selectedCategory.selectedSubcategory;

      if (cameFrom5LayerView) {
        // Return directly to budget view (skip category drill-down)
        setSelectedCategory(null);
      } else {
        // Why: Prevent back navigation to empty category drill-down
        // Before returning to 'category' mode, verify the category has real subcategories.
        // Without this check, categories with only "Altro" would show a drill-down with
        // a single "Altro" node instead of returning to budget/type view.
        const categoryName = selectedCategory.parentCategory || selectedCategory.name;
        const hasSubcategories = checkIfCategoryHasSubcategories(categoryName);

        if (hasSubcategories) {
          // Return to category drill-down view
          setSelectedCategory(prev => prev ? {
            ...prev,
            mode: 'category',
            selectedSubcategory: undefined
          } : null);
        } else {
          // No real subcategories → return to budget or type view
          if (selectedCategory.parentType) {
            // Came from type drill-down → return to type view
            setSelectedCategory(prev => prev ? {
              name: prev.parentType!,
              color: prev.color,
              isIncome: false,
              mode: 'type'
            } : null);
          } else {
            // Came from budget view → return to budget view
            setSelectedCategory(null);
          }
        }
      }
    } else {
      // Return to budget view
      setSelectedCategory(null);
    }
  };

  // Build breadcrumb title based on navigation path
  const getBreadcrumbTitle = (): string => {
    const baseTitle = title || 'Flusso Cashflow';

    if (!selectedCategory) {
      // Budget view
      return baseTitle;
    }

    if (selectedCategory.mode === 'type') {
      // Type drill-down: Base - Type
      return `${baseTitle} - ${selectedCategory.name}`;
    }

    if (selectedCategory.mode === 'category') {
      // Category drill-down
      if (selectedCategory.parentType) {
        // From type drill-down: Base - Type - Category
        return `${baseTitle} - ${selectedCategory.parentType} - ${selectedCategory.name}`;
      } else {
        // Direct category drill-down: Base - Category
        return `${baseTitle} - ${selectedCategory.name}`;
      }
    }

    if (selectedCategory.mode === 'transactions') {
      // Transaction list
      const categoryName = selectedCategory.parentCategory || selectedCategory.name;

      if (selectedCategory.parentType) {
        // From type → category → subcategory: Base - Type - Category - Subcategory
        if (selectedCategory.selectedSubcategory) {
          return `${baseTitle} - ${selectedCategory.parentType} - ${categoryName} - ${selectedCategory.selectedSubcategory}`;
        }
        // From type → category (no subs): Base - Type - Category
        return `${baseTitle} - ${selectedCategory.parentType} - ${categoryName}`;
      } else {
        // Direct category → subcategory: Base - Category - Subcategory
        if (selectedCategory.selectedSubcategory) {
          return `${baseTitle} - ${categoryName} - ${selectedCategory.selectedSubcategory}`;
        }
        // Direct category (no subs): Base - Category
        return `${baseTitle} - ${categoryName}`;
      }
    }

    return baseTitle;
  };

  // Empty state: no data to visualize (but allow transactions mode to render table)
  if ((sankeyData.nodes.length === 0 || sankeyData.links.length === 0) &&
      selectedCategory?.mode !== 'transactions') {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>{getBreadcrumbTitle()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Nessun dato disponibile per questo periodo
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {selectedCategory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Indietro
              </Button>
            )}
            <CardTitle>
              {getBreadcrumbTitle()}
            </CardTitle>
          </div>
          {!selectedCategory && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSubcategories(!showSubcategories)}
            >
              {showSubcategories ? 'Nascondi sottocategorie' : 'Mostra sottocategorie'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Render Sankey chart only when NOT in transactions mode */}
        {selectedCategory?.mode !== 'transactions' && (
          <div style={{ height: chartConfig.height }}>
            <ResponsiveSankey
            data={sankeyData}
            margin={chartConfig.margin}
            align="justify"
            colors={{ datum: 'nodeColor' }}
            valueFormat={(value) => formatCurrencyForSankey(value)}
            nodeOpacity={1}
            nodeHoverOpacity={0.8}
            nodeThickness={chartConfig.nodeThickness}
            nodeSpacing={chartConfig.nodeSpacing}
            nodeBorderWidth={chartConfig.nodeBorderWidth}
            nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}
            nodeBorderRadius={3}
            linkOpacity={0.4}
            linkHoverOpacity={0.6}
            linkContract={3}
            enableLinkGradient={chartConfig.enableLinkGradient}
            label={(node: any) => node.label || node.id}
            labelPosition={chartConfig.labelPosition}
            labelPadding={chartConfig.labelOffset}
            labelOrientation="horizontal"
            labelTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            // Click handler for drill-down
            onClick={(node: any) => {
              // Only handle node clicks, not link clicks
              if (node.id) {
                handleNodeClick(node);
              }
            }}
            // Custom tooltip to match existing chart tooltip style
            nodeTooltip={({ node }) => {
              return (
                <div
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px',
                  }}
                >
                  {/* Display label if available (subcategory nodes use label), fallback to id */}
                  <strong>{node.label || node.id}</strong>
                  <br />
                  {formatCurrencyForSankey(node.value || 0)}
                  <br />
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    {totalAmount > 0
                      ? ((node.value || 0) / totalAmount * 100).toFixed(1)
                      : '0.0'}%
                  </span>
                  {!selectedCategory && node.id !== 'Budget' && node.id !== 'Risparmi' && (
                    <>
                      <br />
                      <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                        Click per dettagli
                      </span>
                    </>
                  )}
                </div>
              );
            }}
            theme={{
              tooltip: {
                container: {
                  background: 'white',
                  fontSize: '14px',
                },
              },
            }}
          />
          </div>
        )}

        {/* Transaction list view: shown when mode='transactions' */}
        {selectedCategory?.mode === 'transactions' && (() => {
          const filteredExpenses = getFilteredExpenses();

          return (
            <div className="mt-6">
              {/* Transaction count */}
              <div className="mb-4 text-sm text-muted-foreground">
                Totale: {filteredExpenses.length} {filteredExpenses.length === 1 ? 'voce' : 'voci'}
              </div>

              {/* Empty state */}
              {filteredExpenses.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  Nessuna transazione trovata
                </div>
              )}

              {/* Desktop table view (sm and above) */}
              {filteredExpenses.length > 0 && (
                <>
                  <div className="hidden rounded-md border sm:block">
                    <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-muted/50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium">Data</th>
                            <th className="px-4 py-3 text-right text-sm font-medium">Importo</th>
                            <th className="px-4 py-3 text-left text-sm font-medium">Note</th>
                            <th className="px-4 py-3 text-center text-sm font-medium">Link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExpenses.map((expense) => (
                            <tr key={expense.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 text-sm">
                                {format(toDate(expense.date), 'dd/MM/yyyy', { locale: it })}
                              </td>
                              <td
                                className="px-4 py-3 text-right text-sm font-medium"
                                style={{
                                  color: expense.type === 'income' ? '#10b981' : '#ef4444'
                                }}
                              >
                                {formatCurrency(expense.amount)}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {expense.notes || '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {expense.link && (
                                  <a
                                    href={expense.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile card view (below sm) */}
                  <div className="space-y-3 sm:hidden">
                    {filteredExpenses.map((expense) => (
                      <div key={expense.id} className="rounded-md border p-3 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {format(toDate(expense.date), 'dd/MM/yyyy', { locale: it })}
                          </span>
                          <span
                            className="text-sm font-medium"
                            style={{
                              color: expense.type === 'income' ? '#10b981' : '#ef4444'
                            }}
                          >
                            {formatCurrency(expense.amount)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {expense.notes || '-'}
                        </p>
                        {expense.link && (
                          <a
                            href={expense.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            Apri link <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
