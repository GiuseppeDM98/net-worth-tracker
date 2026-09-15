'use client';

import { useRef } from 'react';
import { Pencil, Trash2, Wallet } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import type { Asset } from '@/types/assets';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { formatCurrency } from '@/lib/services/chartService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { describeCashAccountReading } from '@/lib/utils/dialogNarrative';
import { cn } from '@/lib/utils';

const ITALIAN_DATE = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatAssetDate(ts: Date | Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ITALIAN_DATE.format(ts instanceof Timestamp ? ts.toDate() : ts);
}

interface CashAccountDialogProps {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (assetId: string) => void;
  isDemo: boolean;
}

/**
 * Read-only detail of one cash account — balance, currency, name, last update — with Modifica
 * (opens AssetDialog) and the two-click Elimina. Opened from a row of the Liquidità tile.
 *
 * The delete is armed by `useArmedDelete` (no timer, Escape disarms through the modal's
 * `hasArmedConfirm` check) and, while armed, the READING says what the second press loses —
 * the balance, the linked movements left without an account, no way back — because the
 * button stays a compact «Premi di nuovo» (DESIGN.md → The Status-Is-The-Reading Rule). Until
 * 2026-09-14 the armed state lived in the page on a 3 s timer: Escape closed the modal with the
 * row still armed, and the reading kept describing how the balance moves.
 */
export function CashAccountDialog({ asset, open, onClose, onEdit, onDelete, isDemo }: CashAccountDialogProps) {
  if (!asset) return null;
  return <CashAccountDetail asset={asset} open={open} onClose={onClose} onEdit={onEdit} onDelete={onDelete} isDemo={isDemo} />;
}

function CashAccountDetail({ asset, open, onClose, onEdit, onDelete, isDemo }: CashAccountDialogProps & { asset: Asset }) {
  const value = calculateAssetValue(asset);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(deleteRef, () => onDelete(asset.id));
  const reading = describeCashAccountReading({ name: asset.name, balanceEur: value, armed, isDemo });

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow="Patrimonio · Liquidità"
      title={asset.name}
      reading={reading}
      width="sm"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onEdit(asset)}
            disabled={isDemo}
            className="flex-1"
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Modifica
          </Button>
          <Button
            ref={deleteRef}
            type="button"
            variant={armed ? 'destructive' : 'outline'}
            className={cn('flex-1', !armed && 'text-destructive hover:text-destructive')}
            onClick={onClick}
            onBlur={onBlur}
            disabled={isDemo}
            aria-pressed={armed}
            aria-label={armed ? `Premi di nuovo per eliminare ${asset.name}` : `Elimina ${asset.name}`}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {armed ? 'Premi di nuovo' : 'Elimina'}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
          {formatCurrency(value, asset.currency)}
        </p>
      </div>

      <div className="mt-4 divide-y divide-border border-t border-border">
        {[
          { label: 'Valuta', value: asset.currency },
          { label: 'Aggiornato', value: formatAssetDate(asset.updatedAt) },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between py-2.5">
            <span className="text-[13px] text-muted-foreground">{row.label}</span>
            <span className="font-mono text-[13px] tabular-nums text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </ResponsiveModal>
  );
}
