'use client';

/**
 * EntitySearch — the "Vai a categoria…" entry point of Analisi.
 *
 * Makes every category and subcategory (zero-expense ones included) reachable
 * in a single interaction: trigger button → ResponsiveModal (bottom-sheet on
 * mobile, Dialog on desktop) → cmdk combobox over the entitySearch index.
 * The component owns only the search UX; resolving labels and performing the
 * drill-down is the caller's job via onSelect(target).
 */

import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import {
  buildEntitySearchIndex,
  searchEntities,
  type EntitySearchTarget,
} from '@/lib/utils/entitySearch';
import { cn } from '@/lib/utils';
import type { Expense, ExpenseCategory } from '@/types/expenses';

export function EntitySearch({
  categories,
  expenses,
  onSelect,
  className,
}: {
  categories: ExpenseCategory[];
  /** The floored history (baseExpenses) — feeds the data-derived index entries. */
  expenses: Expense[];
  /** Caller resolves display labels and drills into the picked target. */
  onSelect: (target: EntitySearchTarget) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Where the focus goes back when the modal closes — Radix restores it to `body` when the
  // opener was tapped on Safari or the search was reached through the page (measured 2026-09-14).
  const triggerRef = useRef<HTMLButtonElement>(null);

  const index = useMemo(() => buildEntitySearchIndex(categories, expenses), [categories, expenses]);
  const results = searchEntities(index, query);

  // Reset the query on every close path (pick, Esc, overlay tap) so reopening
  // always starts from the full index, not a stale filter.
  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        // 44px on touch (below `desktop:` the header is thumbed), the 36px control at 1440.
        className={cn('h-11 min-w-11 text-muted-foreground desktop:h-9 desktop:min-w-0', className)}
        onClick={() => setOpen(true)}
        aria-label="Vai a categoria"
      >
        <Search />
        <span className="hidden sm:inline">Vai a categoria…</span>
      </Button>

      <ResponsiveModal
        open={open}
        onClose={handleClose}
        eyebrow="Analisi · Ricerca"
        title="Vai a categoria"
        reading="Scegliendo una voce, la Scheda si apre sotto le tessere con il totale del periodo, la quota sul padre e l'andamento."
        width="md"
        returnFocusTo={triggerRef}
      >
        {/* shouldFilter={false}: matching and ranking live in searchEntities
            (accent-folded, label-prefix first); cmdk's own substring filter
            would re-rank and break accent-insensitive matching. */}
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder="Cerca categoria o sottocategoria…"
            value={query}
            onValueChange={setQuery}
          />
          {/* cmdk names the listbox «Suggestions» by default — the one English word a screen reader would hear on this page. */}
          <CommandList label="Categorie e sottocategorie trovate">
            <CommandEmpty>Nessuna voce trovata</CommandEmpty>
            {results.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                onSelect={() => {
                  onSelect(item.target);
                  handleClose();
                }}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                {/* The qualifier is always shown: it is what keeps same-named
                    categories under different types tellable apart. */}
                <span className="max-w-[50%] truncate text-xs text-muted-foreground">
                  {item.parentLabel ? `${item.parentLabel} · ${item.qualifier}` : item.qualifier}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </ResponsiveModal>
    </>
  );
}
