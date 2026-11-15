'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CategorySlice } from '@/lib/utils/cashflowComposition';
import type { SubCategorySlice, TypeShare } from '@/lib/utils/analisiSummary';
import type { EntitySearchTarget } from '@/lib/utils/entitySearch';
import { NO_SUBCATEGORY_KEY } from '@/types/expenses';
import { EXPENSE_TYPE_COLOR_VAR } from '@/lib/constants/expenseTypeColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_EYEBROW_CLASS, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { RankedRows } from '@/components/ui/ranked-rows';
import { RingChart } from '@/components/ui/ring-chart';
import { AsideToggle } from '@/components/ui/aside-toggle';

/** Rows shown before «Mostra tutte» takes over — enough for the shape, not a whole taxonomy. */
const VISIBLE_ROWS = 8;

type ClassificaView = 'categories' | 'subcategories';

const VIEW_OPTIONS = [
  { value: 'categories', label: 'Categorie' },
  { value: 'subcategories', label: 'Sottocategorie' },
] as const;

interface ClassificaTileProps {
  id?: string;
  /** «Dove vanno i soldi · {periodLabel}». */
  eyebrow: string;
  ariaLabel: string;
  /** The spending by category, ranked (`buildCategoryRanking`'s slices). */
  categories: CategorySlice[];
  /** The same spending by subcategory (`buildSubCategoryRanking`). */
  subCategories: SubCategorySlice[];
  /** The spending by type, largest first: the ring's parts (`summarizeFlow().typeShares`). */
  typeShares: TypeShare[];
  /** The period's spending, the ring's centre. */
  spending: number;
  /** 150 at 1440 and on a tablet, 120 on a phone. */
  ringSize: 150 | 120;
  /** ONE reading for both views (`describeSpendingRanking`): the toggle regroups rows, not the period. */
  reading: Narrative | null;
  /** The category focused elsewhere on the page (`aria-current` on its row). */
  activeKey: string | null;
  /** The subcategory slice focused elsewhere, in the «Sottocategorie» view. */
  activeSubKey?: string | null;
  onSelect: (target: EntitySearchTarget) => void;
  className?: string;
}

/**
 * «Dove vanno i soldi?» — THE tile of Analisi (2026-11-12): the spending ring by type, with its total
 * in the hole, beside the ranking of the categories (or of the subcategories, on the aside's toggle).
 * Every ranking row carries its type's swatch, the key to the legend under the ring; the bars stay,
 * because the ranking is not the ring's legend. With one type the ring is no ring (The Ring Rule):
 * the total stands as a hero line above the single legend row.
 */
export function ClassificaTile({ id, eyebrow, ariaLabel, categories, subCategories, typeShares, spending, ringSize, reading, activeKey, activeSubKey = null, onSelect, className }: ClassificaTileProps) {
  const [view, setView] = useState<ClassificaView>('categories');
  const [showAll, setShowAll] = useState(false);
  const bySub = view === 'subcategories';
  const slices: Array<CategorySlice | SubCategorySlice> = bySub ? subCategories : categories;
  const focused = bySub ? activeSubKey : activeKey;

  // A focused row beyond the fold stays visible: the row the reader clicked must not vanish.
  const activeHidden = focused !== null && slices.findIndex((slice) => slice.key === focused) >= VISIBLE_ROWS;
  const expanded = showAll || activeHidden;
  const visible = expanded ? slices : slices.slice(0, VISIBLE_ROWS);
  const hidden = expanded ? [] : slices.slice(VISIBLE_ROWS);
  const hiddenAmount = hidden.reduce((sum, slice) => sum + slice.value, 0);
  const noun = bySub ? 'sottocategorie' : 'categorie';
  const hiddenLabel = hidden.length === 1 ? (bySub ? "Un'altra sottocategoria" : "Un'altra categoria") : `Altre ${hidden.length} ${noun}`;
  const bySliceKey = new Map<string, CategorySlice | SubCategorySlice>(slices.map((slice) => [slice.key, slice]));

  const select = (slice: CategorySlice | SubCategorySlice) => {
    const sub = 'subCategoryKey' in slice ? slice.subCategoryKey : NO_SUBCATEGORY_KEY;
    // A row without a subcategory opens its CATEGORY: the Scheda of a subcategory that does not exist is empty.
    onSelect(sub === NO_SUBCATEGORY_KEY ? { expenseType: slice.expenseType, categoryKey: slice.categoryKey } : { expenseType: slice.expenseType, categoryKey: slice.categoryKey, subCategoryKey: sub });
  };

  const oneType = typeShares.length === 1;

  return (
    <Tile
      id={id}
      eyebrow={eyebrow}
      ariaLabel={ariaLabel}
      aside={categories.length > 0 ? <AsideToggle options={VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="Raggruppa la classifica" /> : undefined}
      reading={reading}
      className={className}
    >
      {categories.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessuna spesa registrata nel periodo.</p>
      ) : (
        <div className="@container mt-3.5 flex flex-1 flex-col">
          <div className="flex flex-col gap-5 @min-[520px]:flex-row">
            <div className="flex shrink-0 items-center gap-5 @min-[520px]:w-[180px] @min-[520px]:flex-col @min-[520px]:items-stretch @min-[520px]:gap-4">
              {oneType ? (
                <p className="m-0 flex flex-col">
                  <span data-classifica-total="" className="font-mono text-[22px] font-semibold leading-tight tabular-nums text-foreground">
                    {cachedFormatCurrencyEUR(spending, true)}
                  </span>
                  <span className={TILE_EYEBROW_CLASS}>spese</span>
                </p>
              ) : (
                <div className="flex justify-center">
                  <RingChart
                    segments={typeShares.map((share) => ({ key: share.type, label: share.label, value: share.amount, color: EXPENSE_TYPE_COLOR_VAR[share.type] }))}
                    centerValue={spending}
                    centerLabel="spese"
                    ariaLabel="Spese per tipo"
                    size={ringSize}
                  />
                </div>
              )}
              <ul className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label="Spese per tipo">
                {typeShares.map((share) => (
                  <li key={share.type} className="flex items-center gap-1.5 text-[13px] text-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: EXPENSE_TYPE_COLOR_VAR[share.type] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{share.label}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{share.printedPercentage}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 flex-1">
              <RankedRows
                rows={visible.map((slice) => ({
                  key: slice.key,
                  label: slice.name,
                  caption: 'caption' in slice ? slice.caption : undefined,
                  amount: slice.value,
                  percentage: slice.percentage,
                  swatch: EXPENSE_TYPE_COLOR_VAR[slice.expenseType],
                }))}
                color="var(--chart-1)"
                ariaLabel="Classifica delle spese"
                activeKey={focused}
                onRowClick={(row) => {
                  const slice = bySliceKey.get(row.key);
                  if (slice) select(slice);
                }}
                remainders={hidden.length > 0 ? [{ label: hiddenLabel, amount: hiddenAmount, percentage: spending > 0 ? (hiddenAmount / spending) * 100 : 0 }] : null}
              />
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
            <span>{bySub ? 'Una riga apre la scheda della sottocategoria o, dove manca, della categoria.' : 'Una riga apre la scheda della categoria.'}</span>
            {slices.length > VISIBLE_ROWS && !activeHidden && (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                aria-expanded={expanded}
                className={cn(TILE_FOOTER_ACTION_CLASS, 'shrink-0 gap-1 hover:text-muted-foreground')}
              >
                {expanded ? 'Mostra meno' : `Mostra tutte (${slices.length})`}
                <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </Tile>
  );
}
