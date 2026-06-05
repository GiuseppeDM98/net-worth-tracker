'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getBudgetConfig, saveBudgetConfig } from '@/lib/services/budgetService';
import { reconcileBudgetItems, validateBudgetAllocation, BudgetAllocationValidation } from '@/lib/utils/budgetUtils';
import { BudgetItem, DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import { ExpenseCategory } from '@/types/expenses';

// Auto-save lifecycle:
//   idle     — nothing to persist
//   saving   — a debounced write is queued/in-flight
//   saved    — last write succeeded
//   invalid  — local edits exceed the overall budget; persistence is paused
//   error    — last write failed
export type BudgetSaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

const AUTOSAVE_DELAY_MS = 800;

interface UseBudgetConfigArgs {
  userId: string;
  categories: ExpenseCategory[];
  // When true (demo mode), edits are not persisted.
  disabled?: boolean;
}

export interface UseBudgetConfigResult {
  loading: boolean;
  items: BudgetItem[];
  overallMonthlyAmount: number | undefined;
  alertsEnabled: boolean;
  alertThresholds: number[];
  validation: BudgetAllocationValidation;
  saveStatus: BudgetSaveStatus;
  upsertItem: (item: BudgetItem) => void;
  deleteItem: (id: string) => void;
  setOverall: (amount: number | undefined) => void;
  setAlertsEnabled: (enabled: boolean) => void;
  setAlertThresholds: (thresholds: number[]) => void;
}

/**
 * Loads and manages the user's budget configuration with debounced auto-save.
 *
 * Budgets are opt-in: items are reconciled against the live categories on load
 * and whenever categories change (drops orphans, refreshes names) but never
 * auto-created. Every user edit schedules a single debounced write; writes are
 * paused while the allocation is invalid (category budgets exceed the overall
 * budget) so the UI can surface the error without persisting a bad state.
 */
export function useBudgetConfig({ userId, categories, disabled }: UseBudgetConfigArgs): UseBudgetConfigResult {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [overallMonthlyAmount, setOverallState] = useState<number | undefined>(undefined);
  const [alertsEnabled, setAlertsEnabledState] = useState(true);
  const [alertThresholds, setAlertThresholdsState] = useState<number[]>(DEFAULT_ALERT_THRESHOLDS);
  const [saveStatus, setSaveStatus] = useState<BudgetSaveStatus>('idle');

  // dirtyRef gates auto-save so reconcile (a non-user cleanup) never triggers a write.
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved config once per user
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let active = true;
    getBudgetConfig(userId)
      .then((cfg) => {
        if (!active || !cfg) return;
        // Store the raw saved items; reconcile runs in its own effect once
        // categories are loaded. Reconciling here would drop every category
        // budget as an "orphan" when categories haven't loaded yet.
        setItems(cfg.items);
        setOverallState(cfg.overallMonthlyAmount);
        setAlertsEnabledState(cfg.alertsEnabled ?? true);
        setAlertThresholdsState(cfg.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS);
      })
      .catch(() => toast.error('Errore nel caricamento del budget'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // categories intentionally excluded — reconcile-on-categories runs in its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Reconcile against live categories once they are loaded: refresh denormalized
  // names + kind and drop genuine orphans. Gated on categories.length > 0 so an
  // empty (still-loading) categories list never wipes the saved budgets.
  // Does not mark dirty: orphan cleanup persists on the next real edit.
  useEffect(() => {
    if (loading || categories.length === 0) return;
    setItems((prev) => {
      const next = reconcileBudgetItems(categories, prev);
      return next.length === prev.length && next.every((it, i) => it === prev[i]) ? prev : next;
    });
  }, [categories, loading]);

  const validation = useMemo(
    () => validateBudgetAllocation(items, overallMonthlyAmount),
    [items, overallMonthlyAmount]
  );

  // Debounced auto-save, paused while the allocation is invalid.
  useEffect(() => {
    if (loading || disabled || !dirtyRef.current) return;
    if (!validation.valid) {
      setSaveStatus('invalid');
      return;
    }
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveBudgetConfig(userId, items, { overallMonthlyAmount, alertsEnabled, alertThresholds });
        dirtyRef.current = false;
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
        toast.error('Errore nel salvataggio del budget');
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [items, overallMonthlyAmount, alertsEnabled, alertThresholds, validation.valid, loading, disabled, userId]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  return {
    loading,
    items,
    overallMonthlyAmount,
    alertsEnabled,
    alertThresholds,
    validation,
    saveStatus,
    upsertItem: (item) => {
      markDirty();
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === item.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [...prev, item];
      });
    },
    deleteItem: (id) => {
      markDirty();
      setItems((prev) => prev.filter((p) => p.id !== id));
    },
    setOverall: (amount) => {
      markDirty();
      setOverallState(amount);
    },
    setAlertsEnabled: (enabled) => {
      markDirty();
      setAlertsEnabledState(enabled);
    },
    setAlertThresholds: (thresholds) => {
      markDirty();
      setAlertThresholdsState(thresholds);
    },
  };
}
