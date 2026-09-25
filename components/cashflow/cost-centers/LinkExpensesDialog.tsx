'use client';

/**
 * «Collega spese…» — link many expenses to one center in a single confirm (2026-09-18).
 *
 * A center is filled from the expense form, one row at a time; a center created after its
 * expenses meant dozens of trips through it (the owner's car: 41). This window lists the
 * account's SPENDING that is not yet on the center, lets the user search and filter it, tick
 * what belongs, and confirm once. A recurring series or an instalment plan is one row that
 * links every occurrence, the ones to come included.
 *
 * The reading under the title is the status line AND the running count of what the confirm
 * writes — above all what it MOVES: a row of another center is hidden until the switch asks
 * for it, carries that center's name, and the reading says «3 passano da Vacanze a …» before
 * the button is pressed. Every figure is born in lib/utils/costCenterLinking.ts, every
 * sentence in costCenterNarrative.ts; this component fetches, holds the ticks and renders.
 *
 * The selection is stored WITH the center it was made for and cleared by the open/close
 * subject, during render (react-hooks/set-state-in-effect).
 */

import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { CostCenter } from '@/types/costCenters';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useExpenses } from '@/lib/hooks/useExpenses';
import {
  DEFAULT_LINK_FILTERS,
  buildLinkCandidates,
  buildLinkPlan,
  filterLinkCandidates,
  listLinkCategories,
  listLinkYears,
  summarizeLinkSelection,
  type LinkCandidate,
  type LinkFilters,
  type LinkPlan,
} from '@/lib/utils/costCenterLinking';
import { describeLinkDialogCopy, describeLinkEmpty, describeLinkLeaves, describeLinkSeries } from '@/lib/utils/costCenterNarrative';
import { describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';

/** Rows shown per «Mostra altre» press: the real account holds ~1500 candidates. */
const PAGE_SIZE = 50;
/** Radix reserves the empty string for «no value». */
const ALL = '__all__';
const NO_KEYS: ReadonlySet<string> = new Set();

interface LinkExpensesDialogProps {
  open: boolean;
  onClose: () => void;
  costCenter: CostCenter;
  /** Writes the plan; rejects on failure so the window can keep the selection and say why. */
  onLink: (plan: LinkPlan) => Promise<void>;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

function CandidateRow({ candidate, checked, onToggle }: { candidate: LinkCandidate; checked: boolean; onToggle: () => void }) {
  const id = `link-${candidate.key}`;
  const title = candidate.subCategoryName ? `${candidate.categoryName} · ${candidate.subCategoryName}` : candidate.categoryName;
  return (
    <li>
      {/* The whole row is the checkbox's label: a 44px target, one tab stop per row. */}
      <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 py-2 hover:bg-muted/40 desktop:-mx-2 desktop:rounded-md desktop:px-2">
        <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] text-foreground">{title}</span>
            {candidate.series && (
              <span className="rounded-md border border-border px-1.5 text-[10px] font-medium leading-4 text-muted-foreground">{describeLinkSeries(candidate.series)}</span>
            )}
            {candidate.leaves.length > 0 && (
              <span className="rounded-md border border-border px-1.5 text-[10px] font-medium leading-4 text-warning-foreground">{describeLinkLeaves(candidate.leaves)}</span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{formatDate(candidate.date)}</span>
            {candidate.notes ? ` · ${candidate.notes}` : ''}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(candidate.total)}</span>
      </label>
    </li>
  );
}

export function LinkExpensesDialog({ open, onClose, costCenter, onLink, returnFocusTo }: LinkExpensesDialogProps) {
  const { ownerId } = useActiveAccount();
  // Lazy: the account's whole expense list is only read once the window is asked for.
  const { data: expenses, isLoading, isError } = useExpenses(open ? (ownerId ?? undefined) : undefined);

  const [filters, setFilters] = useState<LinkFilters>(DEFAULT_LINK_FILTERS);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_KEYS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  // «In calendario» is read against the moment the window was opened, not against every render.
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement | null>(null);

  // A fresh window on every open and for every center, settled while rendering.
  const [subject, setSubject] = useState({ open, centerId: costCenter.id });
  if (subject.open !== open || subject.centerId !== costCenter.id) {
    setSubject({ open, centerId: costCenter.id });
    setFilters(DEFAULT_LINK_FILTERS);
    setSelected(NO_KEYS);
    setVisibleCount(PAGE_SIZE);
    setStatus({ phase: 'idle' });
    setNow(new Date());
  }

  const candidates = useMemo(() => buildLinkCandidates(expenses ?? [], costCenter.id, now), [expenses, costCenter.id, now]);
  const shown = useMemo(() => filterLinkCandidates(candidates, filters), [candidates, filters]);
  const categories = useMemo(() => listLinkCategories(candidates), [candidates]);
  const years = useMemo(() => listLinkYears(candidates), [candidates]);
  // Over ALL the candidates, not the filtered ones: a tick survives a change of filter, and
  // the reading must keep counting it or the confirm would write more than it announced.
  const summary = useMemo(() => summarizeLinkSelection(candidates, selected), [candidates, selected]);

  const submitting = status.phase === 'submitting';
  const page = shown.slice(0, visibleCount);
  const hiddenCount = shown.length - page.length;
  const allShownSelected = shown.length > 0 && shown.every((candidate) => selected.has(candidate.key));

  const patchFilters = (patch: Partial<LinkFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setVisibleCount(PAGE_SIZE);
  };

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    if (status.phase === 'error') setStatus({ phase: 'idle' });
  };

  const toggleAllShown = () => {
    const next = new Set(selected);
    for (const candidate of shown) {
      if (allShownSelected) next.delete(candidate.key);
      else next.add(candidate.key);
    }
    setSelected(next);
    if (status.phase === 'error') setStatus({ phase: 'idle' });
  };

  const handleLink = async () => {
    if (submitting) return;
    if (summary.rowCount === 0) {
      // The submit stays enabled so that pressing it can say what is missing.
      setStatus({ phase: 'error', message: `Nessuna spesa selezionata: spunta almeno una riga da collegare a ${costCenter.name}.` });
      searchRef.current?.focus();
      return;
    }
    try {
      setStatus({ phase: 'submitting' });
      await onLink(buildLinkPlan(candidates, selected, { id: costCenter.id, name: costCenter.name }));
      onClose();
    } catch (error) {
      console.error('Error linking expenses to cost center:', error);
      // The window stays open with every tick in place; the list has been refetched by the caller.
      setStatus({ phase: 'error', message: `Le spese non sono state collegate. ${describeWriteError(error)}` });
    }
  };

  const filtered = filters.query.trim() !== '' || filters.categoryKey !== null || filters.year !== null;
  const emptyMessage = describeLinkEmpty({
    anyCandidate: candidates.length > 0,
    anyHiddenByOtherCenters: !filters.includeOtherCenters && candidates.some((candidate) => candidate.leaves.length > 0),
    filtered,
  });

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow="Cashflow · Centri di costo"
      title={`Collega spese a ${costCenter.name}`}
      reading={describeModalStatus(status, describeLinkDialogCopy(summary, costCenter.name))}
      width="lg"
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleLink} disabled={submitting}>
            {submitting ? 'Collegamento…' : summary.rowCount > 0 ? `Collega ${summary.rowCount}` : 'Collega'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ── Filters ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              aria-label="Cerca tra le spese: note, categoria, sottocategoria"
              placeholder="Cerca: note, categoria…"
              value={filters.query}
              onChange={(event) => patchFilters({ query: event.target.value })}
              className="h-11 pl-9 sm:h-9"
            />
          </div>
          <Select value={filters.categoryKey ?? ALL} onValueChange={(value) => patchFilters({ categoryKey: value === ALL ? null : value })}>
            <SelectTrigger aria-label="Categoria" className="h-11 w-full sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutte le categorie</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.key} value={category.key}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.year === null ? ALL : String(filters.year)} onValueChange={(value) => patchFilters({ year: value === ALL ? null : Number(value) })}>
            <SelectTrigger aria-label="Anno" className="h-11 w-full sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Ogni anno</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  <span className="font-mono tabular-nums">{year}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <Label htmlFor="link-other-centers" className="cursor-pointer text-[13px] font-normal text-foreground">
            Mostra anche quelle di altri centri
          </Label>
          <Switch id="link-other-centers" checked={filters.includeOtherCenters} onCheckedChange={(checked) => patchFilters({ includeOtherCenters: checked })} />
        </div>

        {/* ── The list: a wait, a failed read and an empty set are three different things ── */}
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorNotice
            notice={describeReadFailure({
              consequence: 'Le spese non sono state lette: senza di esse non c\'è nulla da collegare.',
              untouched: 'Nessuna spesa e nessun centro sono stati toccati.',
            })}
          />
        ) : shown.length === 0 ? (
          <p className="py-6 text-[13px] leading-[1.45] text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-mono tabular-nums">{shown.length}</span> {shown.length === 1 ? 'voce' : 'voci'}
              </p>
              <Button variant="ghost" size="sm" className="h-11 px-2 text-[13px] desktop:h-8" onClick={toggleAllShown}>
                {allShownSelected ? 'Deseleziona' : 'Seleziona'} le <span className="font-mono tabular-nums">{shown.length}</span> elencate
              </Button>
            </div>
            <ul className="flex flex-col divide-y divide-border" aria-label={`Spese da collegare a ${costCenter.name}`}>
              {page.map((candidate) => (
                <CandidateRow key={candidate.key} candidate={candidate} checked={selected.has(candidate.key)} onToggle={() => toggle(candidate.key)} />
              ))}
            </ul>
            {hiddenCount > 0 && (
              <Button variant="outline" size="sm" className="mt-3 h-11 w-full desktop:h-8 desktop:w-auto desktop:self-start" onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}>
                Mostra altre <span className="font-mono tabular-nums">{Math.min(hiddenCount, PAGE_SIZE)}</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
