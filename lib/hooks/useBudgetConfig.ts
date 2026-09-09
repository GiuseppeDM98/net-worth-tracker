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
  // The saved items as loaded; `items` below is this list reconciled against the live categories.
  const [savedItems, setSavedItems] = useState<BudgetItem[]>([]);
  const [overallMonthlyAmount, setOverallState] = useState<number | undefined>(undefined);
  const [alertsEnabled, setAlertsEnabledState] = useState(true);
  const [alertThresholds, setAlertThresholdsState] = useState<number[]>(DEFAULT_ALERT_THRESHOLDS);
  // Loading is derived: the config is in flight until the load for THIS user has settled.
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const loading = !!userId && loadedUserId !== userId;

  // Every user edit bumps `editSeq`; a write records the sequence it persisted. The two together
  // replace the old dirty flag AND the status state: dirty = the latest edit is not the one
  // written, and the status is derived from them (nothing sets it inside an effect).
  const [editSeq, setEditSeq] = useState(0);
  const [lastWrite, setLastWrite] = useState<{ seq: number; status: 'saved' | 'error' } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved config once per user
  useEffect(() => {
    if (!userId) return;
    let active = true;
    getBudgetConfig(userId)
      .then((cfg) => {
        if (!active || !cfg) return;
        // Store the raw saved items; the reconcile below runs once categories are loaded.
        // Reconciling here would drop every category budget as an "orphan" when categories
        // haven't loaded yet.
        setSavedItems(cfg.items);
        setOverallState(cfg.overallMonthlyAmount);
        setAlertsEnabledState(cfg.alertsEnabled ?? true);
        setAlertThresholdsState(cfg.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS);
      })
      .catch(() => toast.error('Errore nel caricamento del budget'))
      .finally(() => {
        if (active) setLoadedUserId(userId);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Reconcile against live categories once they are loaded: refresh denormalized names + kind
  // and drop genuine orphans. Gated on categories.length > 0 so an empty (still-loading)
  // categories list never wipes the saved budgets. Derived rather than written back, so it is
  // never an edit: orphan cleanup persists on the next real one, exactly as before. The saved
  // list is returned as is when nothing moved, so the auto-save below sees the same identity.
  const items = useMemo(() => {
    if (loading || categories.length === 0) return savedItems;
    const next = reconcileBudgetItems(categories, savedItems);
    return next.length === savedItems.length && next.every((it, i) => it === savedItems[i])
      ? savedItems
      : next;
  }, [categories, loading, savedItems]);

  const validation = useMemo(
    () => validateBudgetAllocation(items, overallMonthlyAmount),
    [items, overallMonthlyAmount]
  );

  const isWritten = lastWrite?.seq === editSeq && lastWrite.status === 'saved';

  const saveStatus: BudgetSaveStatus =
    loading || disabled || editSeq === 0
      ? 'idle'
      : lastWrite?.seq === editSeq
        ? lastWrite.status
        : validation.valid
          ? 'saving'
          : 'invalid';

  // Debounced auto-save, paused while the allocation is invalid. Keyed on `isWritten` and not on
  // `lastWrite`: a write landing while a newer edit is already queued must not restart its timer.
  useEffect(() => {
    if (loading || disabled || editSeq === 0 || isWritten || !validation.valid) return;
    const seqToWrite = editSeq;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveBudgetConfig(userId, items, { overallMonthlyAmount, alertsEnabled, alertThresholds });
        setLastWrite({ seq: seqToWrite, status: 'saved' });
      } catch {
        setLastWrite({ seq: seqToWrite, status: 'error' });
        toast.error('Errore nel salvataggio del budget');
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    items,
    overallMonthlyAmount,
    alertsEnabled,
    alertThresholds,
    validation.valid,
    loading,
    disabled,
    userId,
    editSeq,
    isWritten,
  ]);

  const markDirty = () => {
    setEditSeq((seq) => seq + 1);
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
      setSavedItems((prev) => {
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
      setSavedItems((prev) => prev.filter((p) => p.id !== id));
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
