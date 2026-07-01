'use client';

import { useState } from 'react';
import { SlidersHorizontal, X, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { MultiSelect, type MultiSelectGroup } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PeriodPicker } from '@/components/ui/period-picker';
import { type Period } from '@/lib/utils/period';
import type { ExpenseCategory } from '@/types/expenses';

interface SubCategoryOption {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
}

interface AccountOption {
  id: string;
  name: string;
}

export interface MobileFiltersDrawerProps {
  // Period — shown inline, outside the drawer
  period: Period;
  onPeriodChange: (period: Period) => void;
  availableYears: number[];

  // Search — shown inside the drawer (first section)
  searchQuery: string;
  onSearchChange: (value: string) => void;

  // Category filter
  categoryMultiSelectOptions: MultiSelectGroup[];
  multiSelectValue: string[];
  onCategoryChange: (values: string[]) => void;

  // Subcategory filter (conditional — rendered only when soloSelectedCategory is set)
  soloSelectedCategory: ExpenseCategory | null;
  subCategoryOptions: SubCategoryOption[];
  selectedSubCategoryId: string;
  onSubCategoryChange: (value: string) => void;

  // Account filter (shown only when accountOptions.length >= 2)
  accountOptions: AccountOption[];
  selectedAccountId: string;
  onAccountChange: (value: string) => void;

  // Count of active drawer-internal filters (search, categories, subcategory, account).
  // Period is always visible inline — not counted.
  activeFilterCount: number;

  onReset: () => void;

  // Sort (rendered in the filter bar row next to Filtri)
  mobileSortKey?: string;
  onSortChange?: (key: string) => void;
  sortOptions?: { value: string; label: string; shortLabel: string }[];
}

/**
 * Mobile-only filter bar (hidden on desktop via `desktop:hidden`).
 *
 * Renders a single row:
 *   [PeriodPicker] [Filtri ①]
 *
 * Tapping "Filtri" opens a vaul bottom drawer with:
 *   • Free-text search
 *   • Category multi-select
 *   • Subcategory select (conditional)
 *   • Account select (conditional)
 *
 * Sort lives outside this component, in the Voci card header.
 * All filter state lives in the parent — this component is purely presentational.
 */
export function MobileFiltersDrawer({
  period,
  onPeriodChange,
  availableYears,
  searchQuery,
  onSearchChange,
  categoryMultiSelectOptions,
  multiSelectValue,
  onCategoryChange,
  soloSelectedCategory,
  subCategoryOptions,
  selectedSubCategoryId,
  onSubCategoryChange,
  accountOptions,
  selectedAccountId,
  onAccountChange,
  activeFilterCount,
  onReset,
  mobileSortKey,
  onSortChange,
  sortOptions,
}: MobileFiltersDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-center gap-2 desktop:hidden">
      {/* Period picker — max-w caps the button when a custom range label is long */}
      <PeriodPicker
        value={period}
        onChange={onPeriodChange}
        availableYears={availableYears}
        className="shrink-0 max-w-[170px]"
      />

      {/* Filter button — badge shows count of active drawer filters */}
      <div className="relative shrink-0">
          <Button
            type="button"
            variant={activeFilterCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setOpen(true)}
            aria-label={
              activeFilterCount > 0
                ? `Filtri, ${activeFilterCount} ${activeFilterCount === 1 ? 'attivo' : 'attivi'}`
                : 'Apri filtri avanzati'
            }
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtri
          </Button>
          {activeFilterCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center pointer-events-none"
            >
              {activeFilterCount}
            </span>
          )}
        </div>

      {/* Compact sort select — rendered only when sortOptions provided */}
      {sortOptions && mobileSortKey !== undefined && onSortChange && (
        <Select value={mobileSortKey} onValueChange={onSortChange}>
          <SelectTrigger
            className="h-9 w-auto gap-1 pl-2.5 pr-2 text-xs text-muted-foreground border-border"
            aria-label="Ordina voci per"
          >
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">Ordina</span>
          </SelectTrigger>
          <SelectContent align="end">
            {sortOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Bottom drawer with advanced filters */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          {/* Header: title left, optional reset right */}
          <DrawerHeader className="flex-row items-center justify-between border-b border-border pb-3">
            <DrawerTitle>Filtri avanzati</DrawerTitle>
            <DrawerDescription className="sr-only">
              Filtra le voci per categoria, conto e ordina i risultati
            </DrawerDescription>
            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-8 gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Ripristina
              </Button>
            )}
          </DrawerHeader>

          {/* Scrollable filter sections */}
          <div className="overflow-y-auto p-4 space-y-5">
            {/* Search */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cerca
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value)}
                  placeholder="Note, categorie, importo..."
                  className="h-9 pl-8 pr-8 text-sm"
                  aria-label="Cerca nelle note, categoria, sottocategoria o importo"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Cancella ricerca"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Categorie
              </p>
              <MultiSelect
                options={categoryMultiSelectOptions}
                defaultValue={multiSelectValue}
                onValueChange={onCategoryChange}
                placeholder="Tutte le categorie"
                searchable
                hideSelectAll
                singleLine
                maxCount={2}
                className="w-full"
                // Render options as a bottom-sheet instead of a Popover: this
                // MultiSelect lives inside the filters Drawer, where a nested
                // Popover can't scroll on tablet and breaks focus trapping.
                forceDrawer
                resetOnDefaultValueChange={false}
              />
            </div>

            {/* Subcategory — only when a single category is selected */}
            {soloSelectedCategory && subCategoryOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sottocategoria
                </p>
                <Select value={selectedSubCategoryId} onValueChange={onSubCategoryChange}>
                  <SelectTrigger className="w-full" aria-label="Filtra per sottocategoria">
                    <SelectValue placeholder="Tutte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte</SelectItem>
                    {subCategoryOptions.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Account — only when 2+ distinct accounts appear in the current period */}
            {accountOptions.length >= 2 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Conto
                </p>
                <Select value={selectedAccountId} onValueChange={onAccountChange}>
                  <SelectTrigger className="w-full" aria-label="Filtra per conto corrente">
                    <SelectValue placeholder="Tutti i conti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i conti</SelectItem>
                    {accountOptions.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>

          {/* Footer with iOS safe-area-aware padding */}
          <DrawerFooter>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Mostra risultati
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
