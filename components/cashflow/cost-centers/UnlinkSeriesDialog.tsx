'use client';

/**
 * «Solo questa o tutta la serie?» — unlinking a row that belongs to a recurring series or an
 * instalment plan. A plain row unlinks in place (two clicks, in the row); a row that needs a
 * CHOICE is a modal (doc/guide/dialog.md), the same split the Movimenti table uses for its
 * deletes. Nothing here is destructive — the expenses stay in Cashflow — so neither button
 * takes the destructive variant.
 */

import type { Expense } from '@/types/expenses';
import type { LinkSeriesKind } from '@/lib/utils/costCenterLinking';
import { describeUnlinkSeriesReading } from '@/lib/utils/costCenterNarrative';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';

export interface UnlinkSeriesRequest {
  expense: Expense;
  kind: LinkSeriesKind;
  /** The occurrences of the series linked to this center — what «tutta la serie» unlinks. */
  seriesRows: Expense[];
}

interface UnlinkSeriesDialogProps {
  /** Null keeps the modal closed. */
  request: UnlinkSeriesRequest | null;
  centerName: string;
  onClose: () => void;
  onUnlink: (rows: Expense[]) => void;
  busy?: boolean;
}

export function UnlinkSeriesDialog({ request, centerName, onClose, onUnlink, busy = false }: UnlinkSeriesDialogProps) {
  const expense = request?.expense ?? null;
  const count = request?.seriesRows.length ?? 0;
  const label = expense?.notes?.trim() || expense?.categoryName || '';

  return (
    <ResponsiveModal
      open={request !== null}
      onClose={onClose}
      width="sm"
      eyebrow="Centri di costo · Scollega"
      title={request?.kind === 'installment' ? 'Scollega una rata o il piano' : 'Scollega una voce o la serie'}
      reading={request ? describeUnlinkSeriesReading(request.kind, count, centerName) : null}
      description="Scegli se scollegare solo questa voce o tutta la serie a cui appartiene."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button type="button" variant="outline" disabled={busy || !expense} onClick={() => expense && onUnlink([expense])}>
            Solo questa
          </Button>
          <Button type="button" disabled={busy || !request} onClick={() => request && onUnlink(request.seriesRows)}>
            {request?.kind === 'installment' ? `Tutte le ${count} rate` : `Tutta la serie (${count})`}
          </Button>
        </>
      }
    >
      {/* The row's facts as a summary block — `bg-muted`, never a card inside the modal. */}
      {expense && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-muted px-4 py-3 text-[13px]">
          <dt className="text-muted-foreground">Voce</dt>
          <dd className="min-w-0 truncate text-foreground">{label}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="font-mono tabular-nums text-foreground">{formatDate(toDate(expense.date))}</dd>
          <dt className="text-muted-foreground">Importo</dt>
          <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(Math.abs(expense.amount))}</dd>
        </dl>
      )}
    </ResponsiveModal>
  );
}
