'use client';

/**
 * «Collega la serie a un conto» — the one place an existing series takes an account for the
 * occurrences still to come, each of which will then move it on its own date
 * (lib/utils/cashSettlement.ts). Series written before 2026-09-19 carry the account on their
 * first row only, so a mortgage entered in January never reached the account again; recreating it
 * would lose its history, and this links what is left.
 *
 * A `ResponsiveModal` `sm` like `SeriesDeleteDialog`: the reading says what the confirm will do
 * — how many occurrences, from when, and that the past stays as it is — before it is pressed.
 *
 * The same modal links a mortgage series to its PROPERTY (`target: 'debt'`, 2026-09-25): each
 * occurrence still to come then repays the property's debt by its principal on its date
 * (lib/utils/mortgageRepayment.ts). Same shape, a different list and a different selection rule.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeLinkSeriesReading, describeWriteError } from '@/lib/utils/dialogNarrative';
import { selectLinkableOccurrences, settlesLater } from '@/lib/utils/cashSettlement';
import { selectDebtLinkableOccurrences } from '@/lib/utils/mortgageRepayment';
import { getSeriesOf, linkSeriesToCashAccount, linkSeriesToDebt } from '@/lib/services/expenseService';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import type { Asset } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { SeriesDeleteMode } from '@/components/expenses/SeriesDeleteDialog';

/** What a series is linked to: the account its rows move, or the property whose mortgage they repay. */
export type LinkSeriesTarget = 'account' | 'debt';

export interface LinkSeriesRequest {
  expense: Expense;
  mode: SeriesDeleteMode;
  /** Absent = an account, the original use. */
  target?: LinkSeriesTarget;
}

interface LinkSeriesDialogProps {
  /** The row whose series is linked; null keeps the modal closed. */
  request: LinkSeriesRequest | null;
  ownerId: string;
  /** The cash accounts the series can move (`type === 'cash'`, class cash). */
  cashAccounts: Asset[];
  /** The properties a mortgage series can repay (`isRepayableProperty`). */
  properties: Asset[];
  now: Date;
  onClose: () => void;
  /** After a successful link: the caller refetches the movements. */
  onLinked: () => void;
}

const NONE = '__none__';

export function LinkSeriesDialog({ request, ownerId, cashAccounts, properties, now, onClose, onLinked }: LinkSeriesDialogProps) {
  const expense = request?.expense ?? null;
  const mode = request?.mode ?? 'recurring';
  const target = request?.target ?? 'account';
  const choices = target === 'debt' ? properties : cashAccounts;
  const [accountId, setAccountId] = useState<{ key: string; value: string } | null>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // The chosen account belongs to THIS opening (AGENTS.md → state stored with its subject).
  const subjectKey = expense?.id ?? '';
  const chosen = accountId?.key === subjectKey ? accountId.value : NONE;

  const series = useQuery({
    queryKey: ['expense-series', ownerId, expense?.installmentParentId ?? expense?.recurringParentId ?? expense?.id ?? ''],
    queryFn: () => getSeriesOf(ownerId, expense!),
    enabled: request !== null && !!ownerId,
  });

  const facts = useMemo(() => {
    const rows = series.data ?? [];
    const dated = rows.map((row) => ({ ...row, date: getExpenseDate(row.date) }));
    const select = target === 'debt' ? selectDebtLinkableOccurrences : selectLinkableOccurrences;
    const linkable = select(dated, now).sort((a, b) => a.date.getTime() - b.date.getTime());
    return {
      linkable,
      firstDate: linkable[0]?.date ?? null,
      pastCount: dated.filter((row) => !settlesLater(row.date, now)).length,
    };
  }, [series.data, now, target]);

  const accountName = choices.find((a) => a.id === chosen)?.name ?? null;
  const canLink = !busy && !series.isLoading && facts.linkable.length > 0 && chosen !== NONE;

  const close = () => {
    setFailure(null);
    onClose();
  };

  const confirm = async () => {
    if (!expense || chosen === NONE) return;
    setBusy(true);
    setFailure(null);
    try {
      const linked =
        target === 'debt' ? await linkSeriesToDebt(ownerId, expense, chosen, now) : await linkSeriesToCashAccount(ownerId, expense, chosen, now);
      toast.success(`${linked} ${mode === 'installment' ? (linked === 1 ? 'rata collegata' : 'rate collegate') : linked === 1 ? 'voce collegata' : 'voci collegate'} a ${accountName ?? (target === 'debt' ? 'immobile' : 'conto')}`);
      // The next opening must read the series again: its occurrences now carry the account.
      queryClient.invalidateQueries({ queryKey: ['expense-series', ownerId] });
      onLinked();
      close();
    } catch (error) {
      setFailure(describeWriteError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={request !== null}
      onClose={close}
      width="sm"
      eyebrow="Movimenti · Serie"
      title={
        target === 'debt'
          ? mode === 'installment' ? 'Collega il piano al mutuo' : 'Collega la serie al mutuo'
          : mode === 'installment' ? 'Collega il piano a un conto' : 'Collega la serie a un conto'
      }
      reading={
        failure
          ? { narrative: [{ text: failure }], tone: 'negative' }
          : series.isLoading || !expense
            ? null
            : {
                narrative: describeLinkSeriesReading({
                  mode,
                  futureCount: facts.linkable.length,
                  firstDate: facts.firstDate,
                  pastCount: facts.pastCount,
                  accountName,
                  target,
                }),
                tone: 'neutral',
              }
      }
      description={
        target === 'debt'
          ? 'Scegli l’immobile il cui debito le rate future della serie ridurranno alla loro data.'
          : 'Scegli il conto che le voci future della serie scaleranno alla loro data.'
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Annulla
          </Button>
          <Button type="button" onClick={confirm} disabled={!canLink}>
            {facts.linkable.length > 0 ? `Collega ${facts.linkable.length} ${mode === 'installment' ? (facts.linkable.length === 1 ? 'rata' : 'rate') : facts.linkable.length === 1 ? 'voce' : 'voci'}` : 'Collega'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="link-series-account">{target === 'debt' ? 'Immobile' : 'Conto'}</Label>
        <Select value={chosen} onValueChange={(value) => setAccountId({ key: subjectKey, value })} disabled={busy || facts.linkable.length === 0}>
          <SelectTrigger id="link-series-account">
            <SelectValue placeholder={target === 'debt' ? 'Seleziona immobile' : 'Seleziona conto'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{target === 'debt' ? 'Seleziona immobile' : 'Seleziona conto'}</SelectItem>
            {choices.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </ResponsiveModal>
  );
}
