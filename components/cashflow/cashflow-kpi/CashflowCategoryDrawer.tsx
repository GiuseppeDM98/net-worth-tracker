'use client';

/**
 * CashflowCategoryDrawer — used for CashflowKpiCarousel
 */

import { useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { CategoryBreakdownList, type CategoryBreakdownItem } from '../CategoryBreakdownList';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LinkBanner } from '@/components/ui/link-banner';
import type { ExpenseCategory } from '@/types/expenses';

export interface CashflowCategoryDrawerProps {
  /** Whether the drawer is open. */
  open: boolean;
  /** Called when the drawer requests an open/close transition. */
  onOpenChange: (open: boolean) => void;
  /** Aggregated expense categories for the period, sorted by amount descending. */
  expenseCategories: CategoryBreakdownItem[];
  /** Aggregated income categories for the period, sorted by amount descending. */
  incomeCategories: CategoryBreakdownItem[];
  /** Raw Firestore categories — used for icon and colour lookup in the list. */
  categories: ExpenseCategory[];
}

export function CashflowCategoryDrawer({
  open,
  onOpenChange,
  expenseCategories,
  incomeCategories,
  categories,
}: Readonly<CashflowCategoryDrawerProps>) {
  const [catView, setCatView] = useState<'expense' | 'income'>('expense');
  const activeItems = catView === 'expense' ? expenseCategories : incomeCategories;

  const incomeExpenseSegmentedControl = (
    <SegmentedControl
      options={[
        { value: 'expense', label: 'Spese' },
        { value: 'income', label: 'Entrate' },
      ]}
      value={catView}
      onChange={setCatView}
      aria-label="seleziona spese o entrate"
      className="mx-4 mb-3"
    />
  );

  const moreDepthAnalysisBanner = (
    <LinkBanner
      href="/dashboard/analisi"
      title="Vai all'Analisi Cashflow"
      description="Sankey, trend, categorie e confronti"
      onClick={() => onOpenChange(false)}
      className="mt-4 shrink-0"
    />
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent minHeight="medium">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Entrate o uscite per categoria</DrawerTitle>
          <DrawerDescription className="sr-only">
            Breakdown delle categorie per il periodo selezionato
          </DrawerDescription>
        </DrawerHeader>

        {incomeExpenseSegmentedControl}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6">
          <CategoryBreakdownList items={activeItems} categories={categories} />

          {moreDepthAnalysisBanner}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
