'use client';

/**
 * CostCentersTab — "Panoramica Centri di Costo"
 *
 * Rebuilt around the app's Trade Republic hierarchy: a dominant period total at the
 * top, then a single flat divide-y list of centers ranked by spend — not a grid of
 * identical cards. The list answers "where is the money going across projects?" at a
 * glance, which the old equal-weight card grid could not.
 *
 * IA, top to bottom:
 * 1. Period axis (Mese / Anno / 12 mesi / Storico) — drives every figure below.
 * 2. Hero: total allocated to centers in the period + how many are active.
 * 3. Flat ranked list with per-center number, share bar and budget signal.
 * 4. Cross-center comparison overlay (collapsible).
 * 5. Archived centers, collapsed.
 *
 * WHY client-side aggregation: we fetch all expenses per center once and derive every
 * period view in memory (pure layer in costCenterUtils). For a typical 2-10 centers
 * with a few hundred expenses each this is cheap and avoids N waterfall queries per
 * period change.
 */

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { CostCenter, CostCenterPeriod } from '@/types/costCenters';
import { Expense } from '@/types/expenses';
import {
  getCostCenters,
  getExpensesForCostCenter,
  deleteCostCenter,
  setCostCenterArchived,
} from '@/lib/services/costCenterService';
import {
  computeCenterStats,
  evaluateCenterBudget,
  getLifecycleStatus,
  buildComparisonSeries,
  rankCentersBySpend,
} from '@/lib/utils/costCenterUtils';
import { formatCurrency } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Plus, Layers, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { CostCenterDialog } from './CostCenterDialog';
import { CostCenterDetail } from './CostCenterDetail';
import { toast } from 'sonner';

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const PERIOD_OPTIONS: { value: CostCenterPeriod; label: string }[] = [
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'rolling12', label: '12 mesi' },
  { value: 'all', label: 'Storico' },
];

// A center plus everything derived for the current period — assembled once and reused
// by the hero, the ranked list and the comparison overlay.
interface CenterRow {
  center: CostCenter;
  expenses: Expense[];
  totalSpent: number;
  transactionCount: number;
  lifecycle: ReturnType<typeof getLifecycleStatus>;
  budgetRatio: number | null;
  budgetStatus: 'ok' | 'warning' | 'over' | null;
}

export function CostCentersTab() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();

  // Fetch centers + every center's raw expenses once. Period views are derived in memory,
  // so switching period is instant and needs no refetch.
  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.costCenters.all(user?.uid ?? ''),
    enabled: !!user,
    queryFn: async () => {
      const userId = user!.uid;
      const centers = await getCostCenters(userId);
      const entries = await Promise.all(
        centers.map(async (center) => {
          const expenses = await getExpensesForCostCenter(userId, center.id);
          return [center.id, expenses.filter((e) => e.amount < 0)] as [string, Expense[]];
        }),
      );
      return { centers, expensesByCenter: Object.fromEntries(entries) as Record<string, Expense[]> };
    },
  });

  const centers = useMemo(() => data?.centers ?? [], [data]);
  const expensesByCenter = useMemo(() => data?.expensesByCenter ?? {}, [data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(user?.uid ?? '') });

  // --- UI state ---
  const [period, setPeriod] = useState<CostCenterPeriod>('year');
  const [selectedCenter, setSelectedCenter] = useState<CostCenter | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  // --- Derived rows for the selected period ---
  const rows = useMemo<CenterRow[]>(() => {
    const now = new Date();
    return centers.map((center) => {
      const expenses = expensesByCenter[center.id] ?? [];
      const stats = computeCenterStats(expenses, period, now);
      const budget = evaluateCenterBudget(center, expenses, now);
      return {
        center,
        expenses,
        totalSpent: stats.totalSpent,
        transactionCount: stats.transactionCount,
        lifecycle: getLifecycleStatus(center, stats.lastActivityDate, now),
        budgetRatio: budget?.ratio ?? null,
        budgetStatus: budget?.status ?? null,
      };
    });
  }, [centers, expensesByCenter, period]);

  const activeRows = useMemo(
    () => rankCentersBySpend(rows.filter((r) => r.lifecycle !== 'archived')),
    [rows],
  );
  const archivedRows = useMemo(() => rankCentersBySpend(rows.filter((r) => r.lifecycle === 'archived')), [rows]);

  const periodTotal = useMemo(
    () => activeRows.reduce((sum, r) => sum + r.totalSpent, 0),
    [activeRows],
  );
  const activeWithSpendCount = activeRows.filter((r) => r.totalSpent > 0).length;
  const maxSpend = activeRows[0]?.totalSpent ?? 0;

  // Comparison overlay: top centers over time for the period.
  const comparison = useMemo(
    () =>
      buildComparisonSeries(
        rows
          .filter((r) => r.lifecycle !== 'archived')
          .map((r) => ({
            id: r.center.id,
            name: r.center.name,
            color: r.center.color,
            expenses: r.expenses,
          })),
        period,
      ),
    [rows, period],
  );
  const comparisonData = useMemo(
    () => comparison.buckets.map((b) => ({ label: b.label, ...b.byCenter })),
    [comparison],
  );

  // --- Handlers ---
  const handleOpenCreate = () => {
    setEditingCenter(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (center: CostCenter) => {
    setEditingCenter(center);
    setDialogOpen(true);
  };

  const handleDialogSuccess = (saved: CostCenter) => {
    if (selectedCenter?.id === saved.id) setSelectedCenter(saved);
    invalidate();
  };

  const handleDelete = async (center: CostCenter) => {
    if (!user) return;
    try {
      await deleteCostCenter(user.uid, center.id);
      toast.success(`"${center.name}" eliminato`);
      setSelectedCenter(null);
      invalidate();
    } catch (error) {
      console.error('Error deleting cost center:', error);
      toast.error("Errore durante l'eliminazione");
    }
  };

  const handleArchiveToggle = async (center: CostCenter) => {
    const archiving = !center.archivedAt;
    try {
      const archivedAt = await setCostCenterArchived(center.id, archiving);
      const updated = { ...center, archivedAt };
      if (selectedCenter?.id === center.id) setSelectedCenter(updated);
      toast.success(archiving ? `"${center.name}" archiviato` : `"${center.name}" ripristinato`);
      invalidate();
    } catch (error) {
      console.error('Error archiving cost center:', error);
      toast.error("Errore durante l'archiviazione");
    }
  };

  // --- Detail view ---
  if (selectedCenter) {
    return (
      <>
        <CostCenterDetail
          costCenter={selectedCenter}
          period={period}
          onBack={() => setSelectedCenter(null)}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onArchiveToggle={handleArchiveToggle}
          isDemo={isDemo}
        />
        <CostCenterDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          costCenter={editingCenter}
          onSuccess={handleDialogSuccess}
        />
      </>
    );
  }

  // --- List / Panoramica view ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Centri di Costo</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Raggruppa le spese per oggetto o progetto e confronta dove vanno i soldi
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          disabled={isDemo}
          aria-label={isDemo ? 'Nuovo centro — non disponibile in modalità demo' : undefined}
          className="w-full sm:w-auto sm:shrink-0"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuovo centro
        </Button>
      </div>

      {loading ? (
        <PanoramicaSkeleton />
      ) : centers.length === 0 ? (
        <EmptyState onCreate={handleOpenCreate} isDemo={isDemo} />
      ) : (
        <>
          {/* Period axis */}
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            aria-label="Periodo"
            className="max-w-md"
          />

          {/* HERO — total allocated in the period. */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Totale nei centri di costo
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <span className="text-[40px] desktop:text-[48px] leading-none font-bold font-mono tabular-nums">
                {formatCurrency(periodTotal)}
              </span>
              {activeWithSpendCount > 0 && (
                <span className="text-xs text-muted-foreground pb-1.5">
                  su {activeWithSpendCount} {activeWithSpendCount === 1 ? 'centro attivo' : 'centri attivi'}
                </span>
              )}
            </div>
          </section>

          {/* RANKED LIST — flat divide-y, ordered by spend. */}
          {activeRows.length > 0 ? (
            <div className="divide-y divide-border/60 rounded-xl border border-border/60 overflow-hidden">
              {activeRows.map((row, i) => (
                <CenterListRow
                  key={row.center.id}
                  row={row}
                  maxSpend={maxSpend}
                  index={i}
                  onOpen={() => setSelectedCenter(row.center)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground px-1 py-8 text-center">
              Nessuna spesa nei centri attivi per questo periodo.
            </p>
          )}

          {/* COMPARISON overlay (B3) — only meaningful with 2+ spending centers. */}
          {comparison.centers.length >= 2 && (
            <Collapsible open={comparisonOpen} onOpenChange={setComparisonOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Confronta l’andamento dei centri
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 text-muted-foreground transition-transform', comparisonOpen && 'rotate-180')}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="h-56 desktop:h-72 min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={comparisonData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(v as number)}€`}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={55}
                      />
                      <Tooltip
                        formatter={(value, name) => [formatCurrency(value as number), name as string]}
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {comparison.centers.map((c, i) => (
                        <Line
                          key={c.id}
                          type="monotone"
                          dataKey={c.id}
                          name={c.name}
                          stroke={c.color ?? chartColors[i % Math.max(1, chartColors.length)] ?? 'var(--chart-1)'}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ARCHIVED — collapsed lifecycle bucket (B4). */}
          {archivedRows.length > 0 && (
            <Collapsible open={showArchived} onOpenChange={setShowArchived}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className={cn('h-4 w-4 transition-transform', showArchived && 'rotate-90')} />
                Centri archiviati ({archivedRows.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="divide-y divide-border/60 rounded-xl border border-border/60 overflow-hidden opacity-70">
                  {archivedRows.map((row, i) => (
                    <CenterListRow
                      key={row.center.id}
                      row={row}
                      maxSpend={maxSpend}
                      index={i}
                      onOpen={() => setSelectedCenter(row.center)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      <CostCenterDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        costCenter={editingCenter}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}

// --- Row -------------------------------------------------------------------

/**
 * A single center as a flat list row: name + lifecycle + sub-line on the left,
 * dominant period number + share bar on the right. The share bar encodes the row's
 * weight relative to the largest center, so the ranking reads at a glance.
 */
function CenterListRow({
  row,
  maxSpend,
  index,
  onOpen,
}: {
  row: CenterRow;
  maxSpend: number;
  index: number;
  onOpen: () => void;
}) {
  const { center, totalSpent, transactionCount, lifecycle, budgetStatus, budgetRatio } = row;
  const sharePct = maxSpend > 0 ? Math.round((totalSpent / maxSpend) * 100) : 0;
  const barColor = center.color ?? 'var(--chart-1)';

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.18 }}
      onClick={onOpen}
      aria-label={`Apri ${center.name}`}
      className="group flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span
        className="h-8 w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: barColor }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{center.name}</span>
          {lifecycle === 'dormant' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
              Inattivo
            </Badge>
          )}
          {budgetStatus === 'over' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-destructive border-destructive/40">
              Oltre tetto
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {transactionCount} {transactionCount === 1 ? 'transazione' : 'transazioni'}
          {budgetRatio !== null && ` · ${Math.round(budgetRatio * 100)}% del tetto`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 w-32 flex-shrink-0">
        <span className="font-mono font-semibold tabular-nums">{formatCurrency(totalSpent)}</span>
        {/* Share bar relative to the top center — functional weight indicator. */}
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className="block h-full rounded-full"
            style={{ width: `${sharePct}%`, backgroundColor: barColor, opacity: 0.7 }}
          />
        </span>
      </div>
    </motion.button>
  );
}

// --- States ----------------------------------------------------------------

function EmptyState({ onCreate, isDemo }: { onCreate: () => void; isDemo: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center text-muted-foreground">
      <Layers className="h-10 w-10 opacity-30" />
      <div className="space-y-1">
        <p className="font-medium">Nessun centro di costo</p>
        <p className="text-sm">
          Crea il primo centro per raggruppare spese per oggetto o progetto (es. &quot;Automobile Dacia&quot;).
        </p>
      </div>
      <Button onClick={onCreate} disabled={isDemo} variant="outline" size="sm">
        <Plus className="h-4 w-4 mr-1" />
        Crea il primo centro
      </Button>
    </div>
  );
}

function PanoramicaSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-9 w-full max-w-md bg-muted rounded-lg" />
      <div className="space-y-2">
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="h-12 w-56 bg-muted rounded" />
      </div>
      <div className="rounded-xl border border-border/60 divide-y divide-border/60">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-8 w-1 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-3 w-1/4 bg-muted rounded" />
            </div>
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
