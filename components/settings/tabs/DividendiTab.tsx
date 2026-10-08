'use client';

/**
 * Impostazioni › Dividendi — the landing category and account of dividends (saved by the page's
 * one «Salva», through the `dividendi` slice) and the BTP Italia FOI declaration.
 *
 * A controlled view of its slice: `slice` in, `onChange(patch)` out. What stays local is
 * ephemeral — the sync in flight and its live region. The sync itself writes cashflow rows for
 * every recorded dividend; the CATEGORY is not written here (the tab's own Save was deleted on
 * 2026-08-29: a second write path for the same field).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { ErrorNotice } from '@/components/ui/error-notice';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { getCategoryById } from '@/lib/services/expenseCategoryService';
import { describeReadFailure, type SurfaceState } from '@/lib/utils/statesNarrative';
import { describeBtpItalia, describeDividendCategory } from '@/lib/utils/settingsNarrative';
import { NO_SELECTION, type DividendiSlice } from '@/lib/utils/settingsDraft';
import type { Asset } from '@/types/assets';
import type { ExpenseCategory } from '@/types/expenses';
import { DeclarationRow, INTERACTIVE_CONTROL_CLASS, runGuarded, SettingsTabPanel } from './shared';

interface SyncDividendsButtonProps {
  disabled: boolean;
  syncing: boolean;
  onSync: () => void;
  /** The tile's live region: the armed and disarmed states are said, not only drawn. */
  announce: (text: string) => void;
}

/**
 * «Sincronizza dividendi esistenti» — a two-click confirm (`useArmedDelete`, no timer). It writes
 * cashflow rows for every recorded dividend, so the first press asks; it does not destroy
 * anything, so the armed state is the primary tint, not the destructive one.
 */
function SyncDividendsButton({ disabled, syncing, onSync, announce }: SyncDividendsButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onSync);
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce('Premi di nuovo per sincronizzare i dividendi già registrati');
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Sincronizzazione annullata');
    }
  }, [armed, announce]);

  return (
    <Button
      ref={ref}
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      variant={armed ? 'default' : 'outline'}
      className="h-11 gap-2 desktop:h-9"
    >
      <Coins className="h-4 w-4" />
      {syncing ? 'Sincronizzazione…' : armed ? 'Conferma sincronizzazione' : 'Sincronizza dividendi esistenti'}
    </Button>
  );
}

export interface DividendiTabProps {
  slice: DividendiSlice;
  onChange: (patch: Partial<DividendiSlice>) => void;
  /** Whose dividends the sync reads and writes; `undefined` disables it. */
  ownerId: string | undefined;
  isDemo: boolean;
  expenseCategories: ExpenseCategory[];
  categoriesState: SurfaceState;
  onRetryCategories: () => void;
  /** The settlement accounts (type AND class `cash`). */
  cashAssets: Asset[];
  accountsState: SurfaceState;
  onRetryAccounts: () => void;
}

export function DividendiTab({
  slice,
  onChange,
  ownerId,
  isDemo,
  expenseCategories,
  categoriesState,
  onRetryCategories,
  cashAssets,
  accountsState,
  onRetryAccounts,
}: DividendiTabProps) {
  const { dividendIncomeCategoryId, dividendIncomeSubCategoryId, dividendCashAssetId } = slice;
  const [syncingDividends, setSyncingDividends] = useState(false);
  const [syncAnnouncement, setSyncAnnouncement] = useState('');
  const announceSync = useCallback((text: string) => setSyncAnnouncement(text), []);

  const incomeCategories = expenseCategories.filter((cat) => cat.type === 'income');
  const dividendCategory = expenseCategories.find((cat) => cat.id === dividendIncomeCategoryId);
  const dividendSubCategory = dividendCategory?.subCategories.find((sub) => sub.id === dividendIncomeSubCategoryId);

  // Runs at the SECOND press of SyncDividendsButton.
  const handleSyncDividends = async () => {
    if (!ownerId) return;

    if (!dividendIncomeCategoryId) {
      toast.error('Seleziona prima una categoria per le entrate da dividendi');
      return;
    }

    await runGuarded(async () => {
      setSyncingDividends(true);

      const category = await getCategoryById(dividendIncomeCategoryId);
      if (!category) {
        toast.error('Categoria non trovata');
        return;
      }

      let subCategoryName: string | undefined;
      if (dividendIncomeSubCategoryId) {
        subCategoryName = category.subCategories.find((sub) => sub.id === dividendIncomeSubCategoryId)?.name;
      }

      // Every recorded dividend, then the sync route writes the rows it has not written yet.
      const response = await authenticatedFetch(`/api/dividends?userId=${ownerId}`);
      if (!response.ok) {
        throw new Error('Errore nel caricamento dei dividendi');
      }
      const data = await response.json();
      const dividends = data.dividends || [];

      const syncResponse = await authenticatedFetch('/api/dividends/sync-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: ownerId,
          dividends,
          categoryId: dividendIncomeCategoryId,
          categoryName: category.name,
          subCategoryId: dividendIncomeSubCategoryId || undefined,
          subCategoryName,
        }),
      });

      if (!syncResponse.ok) {
        throw new Error('Errore nella sincronizzazione');
      }

      const syncData = await syncResponse.json();
      const result = syncData.result;

      if (result.failed > 0) {
        toast.warning(
          `Sincronizzazione completata con ${result.failed} errori: ${result.created} voci create, ${result.skipped} già presenti.`
        );
      } else {
        toast.success(`Sincronizzazione completata: ${result.created} voci create, ${result.skipped} già presenti.`);
      }
    }, (error) => {
      console.error('Error syncing dividends:', error);
      toast.error('Errore nella sincronizzazione dei dividendi');
    }, () => {
      setSyncingDividends(false);
    });
  };

  return (
    <SettingsTabPanel tab="dividendi" label="Dividendi">
      {/* Entrate da dividendi — it reads the categories AND the accounts: either failing makes
          its selects empty for a reason that is not «none», so it steps aside for the notice. */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
        {categoriesState === 'failed' || accountsState === 'failed' ? (
          <ErrorNotice
            onRetry={() => {
              if (categoriesState === 'failed') onRetryCategories();
              if (accountsState === 'failed') onRetryAccounts();
            }}
            notice={describeReadFailure({
              subject: 'Entrate da dividendi',
              consequence:
                'Categorie o conti non letti: la categoria e il conto dei dividendi non si possono mostrare. Quelli salvati restano.',
              canRetry: true,
            })}
          />
        ) : (
        <Tile
          eyebrow="Entrate da dividendi"
          reading={describeDividendCategory({
            categoryName: dividendCategory?.name,
            subCategoryName: dividendSubCategory?.name,
            accountName: cashAssets.find((a) => a.id === dividendCashAssetId)?.name,
          })}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Categoria</p>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Di tipo «Entrate»</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={dividendIncomeCategoryId || undefined}
                  onValueChange={(value) => onChange({ dividendIncomeCategoryId: value, dividendIncomeSubCategoryId: '' })}
                >
                  <SelectTrigger className={cn('w-52', INTERACTIVE_CONTROL_CLASS)} aria-label="Categoria entrate dividendi">
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dividendIncomeCategoryId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 desktop:h-8"
                    aria-label="Rimuovi la categoria dei dividendi"
                    onClick={() => onChange({ dividendIncomeCategoryId: '', dividendIncomeSubCategoryId: '' })}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Sottocategoria</p>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Opzionale</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={dividendIncomeSubCategoryId || undefined}
                  onValueChange={(value) => onChange({ dividendIncomeSubCategoryId: value })}
                  disabled={!dividendIncomeCategoryId}
                >
                  <SelectTrigger className={cn('w-52', INTERACTIVE_CONTROL_CLASS)} aria-label="Sottocategoria entrate dividendi">
                    <SelectValue placeholder="Seleziona sottocategoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {dividendCategory?.subCategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dividendIncomeSubCategoryId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 desktop:h-8"
                    aria-label="Rimuovi la sottocategoria dei dividendi"
                    onClick={() => onChange({ dividendIncomeSubCategoryId: '' })}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Conto di accredito</p>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                  Predefinito: uno strumento può averne uno suo
                </p>
              </div>
              <Select value={dividendCashAssetId} onValueChange={(value) => onChange({ dividendCashAssetId: value })}>
                <SelectTrigger className={cn('w-56', INTERACTIVE_CONTROL_CLASS)} aria-label="Conto di accredito dei dividendi">
                  <SelectValue placeholder="Nessun conto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>Nessun conto</SelectItem>
                  {cashAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3.5">
            <SyncDividendsButton
              disabled={isDemo || syncingDividends || !dividendIncomeCategoryId}
              syncing={syncingDividends}
              onSync={() => void handleSyncDividends()}
              announce={announceSync}
            />
            <span className="sr-only" role="status" aria-live="polite">
              {syncAnnouncement}
            </span>
            {!dividendIncomeCategoryId && (
              <p className="mt-2 text-[11px] leading-[1.4] text-warning-foreground">
                Scegli una categoria per abilitare la sincronizzazione dei dividendi già registrati.
              </p>
            )}
          </div>

          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            La sincronizzazione chiede conferma al secondo tocco e salta i dividendi già sincronizzati; la
            categoria si salva con il Salva della pagina.
          </div>
        </Tile>
        )}
      </div>

      {/* BTP Italia — declaration: the FOI is announced per coupon, from the Dividendi calendar */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
        <Tile eyebrow="BTP Italia" aside="FOI" reading={describeBtpItalia()}>
          <div className="mt-1 flex flex-col divide-y divide-border">
            <DeclarationRow label="Cedola indicizzata" value="fisso + FOI del semestre" mono={false} />
            <DeclarationRow label="FOI non ancora annunciato" value="cedola provvisoria, solo fisso" mono={false} />
            <DeclarationRow label="Deflazione" value="FOI negativo contato 0" mono={false} />
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Si gestisce in{' '}
            <Link href="/dashboard/cashflow?tab=dividends" className={TILE_FOOTER_ACTION_CLASS}>
              Cashflow › Dividendi
            </Link>
            , per singola cedola.
          </div>
        </Tile>
      </div>
    </SettingsTabPanel>
  );
}
