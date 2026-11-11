'use client';

/**
 * The confirmation half of the ```expense-proposal protocol (Assistente › Registra, 2026-11).
 *
 * The model proposes a row; nothing is written until the user presses «Conferma», and then the
 * BROWSER writes it, through the services the expense form uses — `createExpenseSettledOnDate`,
 * the loans, the balances — so a row born here is the row the form would have written: its
 * account moves on its date, a future date waits (`balancePending`).
 *
 * Once, even after a reload: the outcome is recorded on the message (`proposals["expense:N"]`),
 * in the session first (the stream buffer and the cached thread) and then on the document, and a
 * card with an outcome shows its line instead of the buttons. A message that never received its
 * server id (stopped before the stream's end) has nowhere to record one, so it offers no button.
 *
 * The card takes only the parsed proposal and its index: it sits under ReactMarkdown's
 * module-level components map, so the message and the page's reads reach it through context
 * (MessageIdContext, RegisterRefsContext).
 *
 * It is what the model wrote, so it wears the AI accent (DESIGN → The AI-Accent Rule): the 1px
 * border at rest, the glow on hover and keyboard focus, the eyebrow accented. Its buttons do not
 * call the model and stay achromatic.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { lazyComponent } from '@/components/ui/lazy-component';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { patchMessageProposal, useMessageId } from '@/components/assistant/MessageIdContext';
import { useRegisterRefs } from '@/components/assistant/RegisterRefsContext';
import type { ExpenseDialogInitialValues, SavedExpense } from '@/components/expenses/ExpenseDialog';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { applyBalanceEffects } from '@/lib/services/cashBalanceReconciliation';
import { applyDebtRepayments } from '@/lib/services/debtRepaymentService';
import { createExpenseSettledOnDate } from '@/lib/services/expenseService';
import { describeWriteError, PROPOSAL_STATE_NOT_SAVED, ROW_CREATED_TOAST } from '@/lib/utils/dialogNarrative';
import {
  describeExpenseProposalState,
  proposalKey,
  resolveExpenseProposal,
  type ExpenseProposal,
  type ResolvedExpenseProposal,
} from '@/lib/utils/expenseProposal';
import { cardEnterVariants } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';
import type { AssistantProposalState } from '@/types/assistant';
import type { ExpenseFormData } from '@/types/expenses';

// The form is heavy and «Modifica» is the rare path: its chunk loads on hover or focus of the
// button, never with the page (the route's first-load budget, doc/guide/velocita.md).
const LazyExpenseDialog = lazyComponent(() => import('@/components/expenses/ExpenseDialog').then((m) => m.ExpenseDialog));

interface ExpenseProposalCardProps {
  proposal: ExpenseProposal;
  /** The block's rank among the message's ```expense-proposal blocks: the card's key on the message. */
  index: number;
}

/**
 * The write, module-level so the card's `try` holds no branch (the React Compiler). The three
 * calls of the expense form's create path, in its order; returns the ids written.
 */
async function writeExpenseProposal(ownerId: string, resolved: ResolvedExpenseProposal, now: Date): Promise<string[]> {
  const created = await createExpenseSettledOnDate(
    ownerId,
    resolved.form as ExpenseFormData,
    resolved.labels.categoryName,
    resolved.labels.subCategoryName,
    now,
  );
  await applyDebtRepayments(created.appliedDebtRows);
  await applyBalanceEffects(created.appliedEffects);
  return created.ids;
}

/** Everything a new row changes: the rows (every window), the accounts, the Panoramica, the centres' spend. */
function invalidateAfterWrite(queryClient: QueryClient, ownerId: string): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId) });
}

/** Saves the outcome on the message; a failure after a successful write is a toast, never an error state. */
async function saveOutcome(args: { ownerId: string; threadId: string; messageId: string; key: string; state: Omit<AssistantProposalState, 'at'> }): Promise<void> {
  const saved = await patchMessageProposal(args);
  if (!saved && args.state.status === 'written') toast.error(PROPOSAL_STATE_NOT_SAVED);
}

export function ExpenseProposalCard({ proposal, index }: ExpenseProposalCardProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const refs = useRegisterRefs();
  const { readFailed } = refs;
  const { messageId, threadId, proposals, recordProposal } = useMessageId();

  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  // «Modifica»: the values the dialog opens on, frozen at the click — a refetch that rebuilt
  // `resolved.form` must not reset what the user is typing.
  const [editValues, setEditValues] = useState<ExpenseDialogInitialValues | null>(null);
  // «oggi» and «ieri» are read off the clock once, at mount: a render must not.
  const [now] = useState(() => new Date());

  const editButtonRef = useRef<HTMLButtonElement>(null);
  const stateLineRef = useRef<HTMLParagraphElement>(null);
  // Set by the click that closes the card: the focus follows the buttons to the line that replaced them.
  const focusLineRef = useRef(false);

  const key = proposalKey('expense', index);
  const resolved = resolveExpenseProposal(proposal, refs, now);
  const cardState = describeExpenseProposalState(resolved, proposals[key], { messageId, saving, readFailed, isDemo });

  useEffect(() => {
    if (focusLineRef.current && cardState.line !== null) {
      focusLineRef.current = false;
      stateLineRef.current?.focus();
    }
  }, [cardState.line]);

  const confirm = async () => {
    if (!ownerId || !cardState.canConfirm) return;
    setSaving(true);
    setWriteError(null);
    try {
      const writtenIds = await writeExpenseProposal(ownerId, resolved, new Date());
      const state = { status: 'written' as const, writtenIds };
      focusLineRef.current = true;
      recordProposal(key, state);
      toast.success(ROW_CREATED_TOAST[proposal.kind]);
      invalidateAfterWrite(queryClient, ownerId);
      await saveOutcome({ ownerId, threadId, messageId, key, state });
    } catch (error) {
      console.error('Error writing the proposed row:', error);
      setWriteError(describeWriteError(error));
    }
    setSaving(false);
  };

  const ignore = () => {
    if (!ownerId) return;
    const state = { status: 'ignored' as const };
    focusLineRef.current = true;
    recordProposal(key, state);
    void saveOutcome({ ownerId, threadId, messageId, key, state });
  };

  // The dialog wrote the row itself (and its balances): the card only remembers it.
  const handleEdited = (saved: SavedExpense | null) => {
    if (!ownerId || !saved) return;
    const state = { status: 'written' as const, writtenIds: [saved.id] };
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
    focusLineRef.current = true;
    recordProposal(key, state);
    void saveOutcome({ ownerId, threadId, messageId, key, state });
  };

  const preloadDialog = () => {
    LazyExpenseDialog.preload().catch(() => {});
  };

  const { labels } = resolved;
  const detail = [labels.costCenter && `Centro ${labels.costCenter}`, labels.member && `Di ${labels.member}`].filter(Boolean);
  // The row's month and the row itself: Tracciamento opens on it (`?row=`, 2026-11-11).
  const writtenId = proposals[key]?.writtenIds?.[0];
  const cashflowHref = `/dashboard/cashflow?tab=tracking&month=${proposal.dateIso.slice(0, 7)}${writtenId ? `&row=${encodeURIComponent(writtenId)}` : ''}`;

  return (
    <motion.div
      variants={cardEnterVariants}
      initial="enter"
      animate="center"
      data-generated
      data-proposal={key}
      className={cn('not-prose my-3 rounded-xl border bg-muted/40 p-4', AI_GENERATED_SURFACE_CLASS)}
    >
      <p className={cn(TILE_EYEBROW_CLASS, AI_GENERATED_EYEBROW_CLASS)}>L&apos;Assistente propone</p>

      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-foreground">
        {labels.kind} · <span className="font-mono tabular-nums">{labels.amount}</span> · {labels.category} · {labels.date} · {labels.account}
      </p>

      {(detail.length > 0 || labels.budget) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground">
          {detail.length > 0 && <span>{detail.join(' · ')}</span>}
          {labels.budget && (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{labels.budget}</span>
          )}
        </p>
      )}

      {proposal.note && <p className="mt-1 text-[13px] text-foreground">«{proposal.note}»</p>}
      {labels.settlement && <p className="mt-1 text-[13px] text-muted-foreground">{labels.settlement}</p>}

      <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">{proposal.reason}</p>

      {resolved.problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] leading-[1.45] text-warning-foreground">
          {resolved.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {resolved.dropped.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] leading-[1.45] text-muted-foreground">
          {resolved.dropped.map((drop) => (
            <li key={drop}>{drop}</li>
          ))}
        </ul>
      )}
      {readFailed && cardState.status === 'idle' && (
        <p className="mt-2 text-[13px] leading-[1.45] text-warning-foreground">
          Categorie e conti non sono stati letti: ricarica la pagina prima di confermare.
        </p>
      )}
      {writeError && (
        <p role="alert" className="mt-2 text-[13px] leading-[1.45] text-destructive">
          {writeError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {cardState.line !== null ? (
          <p
            ref={stateLineRef}
            tabIndex={-1}
            className={cn(
              'flex flex-wrap items-center gap-1.5 text-[13px] outline-none',
              cardState.status === 'written' ? 'font-medium text-positive' : 'text-muted-foreground',
            )}
          >
            {cardState.status === 'written' && <Check className="h-4 w-4" aria-hidden="true" />}
            <span>{cardState.line}</span>
            {cardState.status === 'written' && (
              <>
                <span aria-hidden="true">·</span>
                <Link href={cashflowHref} className="font-normal text-foreground underline underline-offset-2">
                  apri in Cashflow
                </Link>
              </>
            )}
          </p>
        ) : (
          <>
            <Button
              size="sm"
              className="h-11 desktop:h-9"
              onClick={confirm}
              disabled={!cardState.canConfirm || !ownerId}
              aria-label={isDemo ? 'Conferma — non disponibile in modalità demo' : undefined}
            >
              {cardState.status === 'saving' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Registrazione…
                </>
              ) : (
                'Conferma'
              )}
            </Button>
            <Button
              ref={editButtonRef}
              variant="outline"
              size="sm"
              className="h-11 desktop:h-9"
              onClick={() => setEditValues(resolved.form)}
              onMouseEnter={preloadDialog}
              onFocus={preloadDialog}
              disabled={!cardState.canEdit || !ownerId}
            >
              Modifica
            </Button>
            <Button variant="ghost" size="sm" className="h-11 desktop:h-9" onClick={ignore} disabled={!cardState.canIgnore}>
              Ignora
            </Button>
          </>
        )}
      </div>

      {editValues && (
        <LazyExpenseDialog
          fallback={null}
          open
          onClose={() => setEditValues(null)}
          initialValues={editValues}
          onSuccess={handleEdited}
          returnFocusTo={editButtonRef}
        />
      )}
    </motion.div>
  );
}
