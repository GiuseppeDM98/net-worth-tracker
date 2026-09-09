'use client';

import type { Asset } from '@/types/assets';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { describeCashAccounts } from '@/lib/utils/patrimonioNarrative';
import type { CashAccountsSummary } from '@/lib/utils/patrimonioSummary';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

interface LiquiditaTileProps {
  summary: CashAccountsSummary;
  /** The account rows' assets, by id — a row opens the account's detail dialog. */
  accountsById: Map<string, Asset>;
  onSelect: (asset: Asset) => void;
  onAdd: () => void;
  /** Mutations are gated in demo mode, like everywhere else. */
  isDemo: boolean;
  className?: string;
}

/**
 * "Quanto è sui conti?" — the cash accounts one per row with their balance, the total as the
 * tile's KPI and the share of the gross total in the reading. Each row is a button: the
 * account's detail dialog (edit, delete) opens from here, as the old card grid did.
 */
export function LiquiditaTile({ summary, accountsById, onSelect, onAdd, isDemo, className }: LiquiditaTileProps) {
  const { accounts } = summary;

  return (
    <Tile
      eyebrow="Liquidità"
      aside={accounts.length > 0 ? `${accounts.length} ${accounts.length === 1 ? 'conto' : 'conti'}` : undefined}
      reading={describeCashAccounts(summary.shareOfTotal, summary.largest, accounts.length)}
      className={className}
    >
      {accounts.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessun conto corrente registrato.</p>
      ) : (
        <>
          <div className="mt-3.5 flex flex-col gap-1.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>Sui conti</p>
            <p className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(summary.total)}
            </p>
          </div>
          <div className="mt-2.5 flex flex-col divide-y divide-border">
            {accounts.map((account) => {
              const asset = accountsById.get(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => asset && onSelect(asset)}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-[9px] text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${account.name}, ${cachedFormatCurrencyEUR(account.balance)}`}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{account.name}</span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
                    {cachedFormatCurrencyEUR(account.balance)}
                  </span>
                  <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {Math.round(account.shareOfCash)}%
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {accounts.length > 0 && 'Un conto si apre sul suo dettaglio · '}
        <button
          type="button"
          onClick={onAdd}
          disabled={isDemo}
          title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          className="text-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          Aggiungi conto
        </button>
      </p>
    </Tile>
  );
}
