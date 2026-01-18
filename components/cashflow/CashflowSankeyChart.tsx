/**
 * Cashflow Sankey Diagram Component with Budget Flow and Drill-down
 *
 * TWO MODES:
 * 1. Budget View (default): Income Categories → Budget → Expense Categories + Savings
 * 2. Drill-down View: Selected Category → Subcategories
 *
 * Data Flow (Budget View):
 * - Left: Income categories (Stipendio, Bonus, etc.)
 * - Center: Budget node (total income)
 * - Right: Expense categories + Savings (calculated as income - expenses)
 *
 * Interaction:
 * - Click on any category → drill down to subcategories
 * - Back button → return to budget view
 *
 * Used by: CurrentYearTab and TotalHistoryTab cashflow pages
 */
'use client';

import { useState, useMemo } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { Expense } from '@/types/expenses';
import { formatCurrency } from '@/lib/services/chartService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

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
 * Build Budget Flow Sankey: Income Categories → Budget → Expense Categories + Savings
 *
 * Algorithm:
 * 1. Aggregate income by category (left side)
 * 2. Aggregate expenses by category (right side)
 * 3. Calculate savings (income - expenses)
 * 4. Create Budget node (center) with total income value
 * 5. Build links: Income → Budget, Budget → Expenses + Savings
 * 6. Apply mobile filtering (top N categories)
 *
 * Structure:
 * - Left nodes: Income categories
 * - Center node: "Budget" (total income)
 * - Right nodes: Expense categories + "Risparmi" (if positive)
 *
 * @param expenses - All expenses for period (income + expenses)
 * @param isMobile - Apply mobile optimizations (top N filtering)
 * @returns Nivo Sankey data structure { nodes, links }
 */
const buildBudgetFlowData = (expenses: Expense[], isMobile: boolean): SankeyData => {
  // Step 1: Aggregate income by category
  const incomeMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();

  let totalIncome = 0;
  let totalExpenses = 0;

  expenses.forEach(expense => {
    const amount = Math.abs(expense.amount);
    const category = expense.categoryName;

    if (expense.type === 'income') {
      incomeMap.set(category, (incomeMap.get(category) || 0) + amount);
      totalIncome += amount;
    } else {
      expenseMap.set(category, (expenseMap.get(category) || 0) + amount);
      totalExpenses += amount;
    }
  });

  // Step 2: Calculate savings (can be negative if spending > income)
  const savings = totalIncome - totalExpenses;

  // Step 3: Mobile filtering - keep top N categories
  let incomeCategories = Array.from(incomeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  let expenseCategories = Array.from(expenseMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  if (isMobile) {
    // Mobile: top 5 income + top 5 expenses
    incomeCategories = incomeCategories.slice(0, 5);
    expenseCategories = expenseCategories.slice(0, 5);
  }

  // Step 4: Assign colors
  const incomeColorMap = new Map<string, string>();
  incomeCategories.forEach((cat, index) => {
    incomeColorMap.set(cat.name, COLORS[index % COLORS.length]);
  });

  const expenseColorMap = new Map<string, string>();
  expenseCategories.forEach((cat, index) => {
    expenseColorMap.set(cat.name, COLORS[(index + incomeCategories.length) % COLORS.length]);
  });

  // Step 5: Build nodes
  const nodes: SankeyNode[] = [
    // Left: Income categories
    ...incomeCategories.map(cat => ({
      id: cat.name,
      nodeColor: incomeColorMap.get(cat.name)!
    })),
    // Center: Budget node (green color)
    {
      id: 'Budget',
      nodeColor: '#10b981' // green
    },
    // Right: Expense categories
    ...expenseCategories.map(cat => ({
      id: cat.name,
      nodeColor: expenseColorMap.get(cat.name)!
    })),
    // Right: Savings (only if positive)
    ...(savings > 0 ? [{
      id: 'Risparmi',
      nodeColor: '#3b82f6' // blue
    }] : [])
  ];

  // Step 6: Build links
  const links: SankeyLink[] = [
    // Income → Budget
    ...incomeCategories.map(cat => ({
      source: cat.name,
      target: 'Budget',
      value: cat.value
    })),
    // Budget → Expenses
    ...expenseCategories.map(cat => ({
      source: 'Budget',
      target: cat.name,
      value: cat.value
    })),
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
  // Drill-down state: tracks selected category for drill-down view
  const [selectedCategory, setSelectedCategory] = useState<{
    name: string;
    color: string;
    isIncome: boolean;
  } | null>(null);

  // Build Sankey data based on current mode (budget view vs drill-down)
  const sankeyData = useMemo(() => {
    if (selectedCategory) {
      // Drill-down mode: show category → subcategories
      return buildDrillDownData(
        expenses,
        selectedCategory.name,
        selectedCategory.color,
        selectedCategory.isIncome,
        isMobile
      );
    } else {
      // Budget mode: show income → budget → expenses + savings
      return buildBudgetFlowData(expenses, isMobile);
    }
  }, [expenses, selectedCategory, isMobile]);

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

  // Handle node click for drill-down
  const handleNodeClick = (node: any) => {
    // Don't drill down into Budget or Risparmi nodes
    if (node.id === 'Budget' || node.id === 'Risparmi') {
      return;
    }

    // If already in drill-down mode, ignore clicks
    if (selectedCategory) {
      return;
    }

    // Check if this is an income or expense category
    const isIncome = expenses.some(e => e.categoryName === node.id && e.type === 'income');

    // Set selected category for drill-down
    setSelectedCategory({
      name: node.id,
      color: node.color,
      isIncome
    });
  };

  // Handle back button click
  const handleBack = () => {
    setSelectedCategory(null);
  };

  // Empty state: no data to visualize
  if (sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>{title || 'Flusso Cashflow'}</CardTitle>
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
            {selectedCategory
              ? `${title || 'Flusso Cashflow'} - ${selectedCategory.name}`
              : title || 'Flusso Cashflow'}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: chartConfig.height }}>
          <ResponsiveSankey
            data={sankeyData}
            margin={chartConfig.margin}
            align="justify"
            colors={{ datum: 'nodeColor' }}
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
                  <strong>{node.id}</strong>
                  <br />
                  {formatCurrency(node.value || 0)}
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
              fontSize: 12,
              textColor: '#333',
              tooltip: {
                container: {
                  background: 'white',
                  fontSize: '14px',
                },
              },
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
