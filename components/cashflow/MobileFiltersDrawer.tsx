'use client';

import { useState } from 'react';
import { SlidersHorizontal, X, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { MultiSelect, type MultiSelectGroup } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PeriodPicker } from '@/components/ui/period-picker';
import { type Period } from '@/lib/utils/period';
import type { OwnerFilterOption } from '@/lib/utils/movementsOwnerFilter';
import { describeMovementsFilterAction, describeMovementsFilterReading } from '@/lib/utils/dialogNarrative';
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

  // Owner filter (Divisione only — empty options = no section)
  ownerOptions: OwnerFilterOption[];
  selectedOwnerId: string;
  onOwnerChange: (value: string) => void;

  // Count of active drawer-internal filters (search, categories, subcategory, account, owner).
  // Period is always visible inline — not counted.
  activeFilterCount: number;

  // The two lists the Movimenti tile draws from, counted by the parent: the period's rows that
  // pass the filters, and the period's rows. The reading and the primary are built on them.
  shownCount: number;
  totalCount: number;

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
 *   [PeriodPicker] [Filtri ①] [⇅]
 *
 * The period is the page's axis, repeated here so the window can be changed from beside the
 * list it slices — a search («caffè») is always read over one.
 *
 * Tapping "Filtri" opens a `ResponsiveModal` `sm` — a bottom sheet on a phone, a centred dialog
 * on the tablet widths this bar also serves (it is hidden only from `desktop:`) — whose reading
 * counts the movements left and whose primary names them («Mostra 27 movimenti»), with:
 *   • Free-text search
 *   • Category multi-select
 *   • Subcategory select (conditional)
 *   • Account select (conditional)
 *   • Owner select (conditional — Divisione on)
 *
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
  ownerOptions,
  selectedOwnerId,
  onOwnerChange,
  activeFilterCount,
  shownCount,
  totalCount,
  onReset,
  mobileSortKey,
  onSortChange,
  sortOptions,
}: MobileFiltersDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-center gap-2 desktop:hidden">
      {/* Period picker — the trigger's own `min-w-[190px]` is overridden so that, when the row
          runs out of room, the picker yields (its label truncates) before «Filtri» and the sort do.
          At 360 the three controls fit even without it (e2e/cashflow.mobile.spec.ts measured it
          with the override removed): the override is the slack, not the fix. max-w caps the button
          when a custom range label is long. */}
      <PeriodPicker
        value={period}
        onChange={onPeriodChange}
        availableYears={availableYears}
        className="min-w-0 shrink max-w-[170px]"
        ariaLabelPrefix="Periodo dei movimenti"
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

      {/* The filters. «Ripristina» is the footer's secondary and stays in place when nothing is
          set (disabled), so the primary never jumps under the thumb between two states. */}
      <ResponsiveModal
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        eyebrow="Movimenti"
        title="Filtra i movimenti"
        reading={{
          narrative: describeMovementsFilterReading({ activeFilters: activeFilterCount, shown: shownCount, total: totalCount }),
          tone: 'neutral',
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onReset} disabled={activeFilterCount === 0}>
              Ripristina
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              {describeMovementsFilterAction(shownCount)}
            </Button>
          </>
        }
      >
          <div className="space-y-5">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="movements-filter-search">Cerca</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="movements-filter-search"
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
              <p className="text-sm font-medium leading-none">Categorie</p>
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
                <Label htmlFor="movements-filter-subcategory">Sottocategoria</Label>
                <Select value={selectedSubCategoryId} onValueChange={onSubCategoryChange}>
                  <SelectTrigger id="movements-filter-subcategory" className="w-full" aria-label="Filtra per sottocategoria">
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
                <Label htmlFor="movements-filter-account">Conto</Label>
                <Select value={selectedAccountId} onValueChange={onAccountChange}>
                  <SelectTrigger id="movements-filter-account" className="w-full" aria-label="Filtra per conto corrente">
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

            {/* Intestatario — only with Divisione on (the parent hands no options otherwise) */}
            {ownerOptions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="movements-filter-owner">Intestatario</Label>
                <Select value={selectedOwnerId} onValueChange={onOwnerChange}>
                  <SelectTrigger id="movements-filter-owner" className="w-full" aria-label="Filtra per intestatario">
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>
      </ResponsiveModal>
    </div>
  );
}
