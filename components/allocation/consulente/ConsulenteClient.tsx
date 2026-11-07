'use client';

/**
 * ALLOCAZIONE › CONSULENTE (2026-10-20) — «come imposto la mia allocazione?»
 *
 * Three views on one page, by what the account holds: the PATH (one question per screen,
 * «Indietro» always available, the draft kept on this browser), the RUN (the three stages of
 * the two agents, persisted after each so a reload shows where it is), the REPORT (the verdict,
 * the proposal against today, the instruments, the goals, the roles, the text, and «Applica»
 * with one checkbox per thing it writes). Not a tile grid: like the Assistente, the content is
 * a conversation — here a form — so the page is one column at 720px (900px at 1440, the path's rail beside the card) and nothing is composed,
 * lifted or remembered below `desktop:` (DESIGN.md → The Conversation-Is-Content Rule).
 *
 * No component computes a figure or writes a sentence: the reducer and the plans are
 * `lib/utils/allocationAdvice{Draft,Apply}.ts`, the words `allocationAdviceNarrative.ts`.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useGoalData } from '@/lib/hooks/useGoalData';
import { useAllocationAdvice } from '@/lib/hooks/useAllocationAdvice';
import { composeReadState } from '@/lib/utils/readState';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorNotice } from '@/components/ui/error-notice';
import { EmptyState } from '@/components/ui/empty-state';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { Button } from '@/components/ui/button';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { pageShowsReport } from '@/lib/utils/allocationAdviceDocument';
import { clearStoredDraft } from '@/lib/utils/allocationAdviceDraft';
import { ConsulenteWizard } from './ConsulenteWizard';
import { useConsulenteRun } from './useConsulenteRun';
import { ConsulenteReport } from './ConsulenteReport';

interface ConsulenteClientProps {
  /** Whether the server holds an Anthropic key: without it the path can be read but not run. */
  configured: boolean;
  /** Open on the screens over the last document, as «Rifai il percorso» would (`?rivedi=1`). */
  startFresh?: boolean;
}

/** One tall cell: the path's card. */
const SKELETON_CELLS: TileSkeletonCell[] = [{ span: 12, rows: 2 }];

export function ConsulenteClient({ configured, startFresh = false }: ConsulenteClientProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const settingsQuery = useSettings(ownerId);
  const assetsQuery = useAssets(ownerId);
  const goalsQuery = useGoalData(ownerId);
  const adviceQuery = useAllocationAdvice(ownerId, { enabled: !!ownerId && !isDemo });

  // «Rifai il percorso» from a finished report: the wizard opens over the stored document,
  // which stays until a new run replaces it.
  const [redo, setRedo] = useState<{ documentUpdatedAt: number } | null>(null);
  // The clock is read once, when the page opens: a render must not read it (react-hooks/purity).
  const [openedAt] = useState(() => Date.now());
  // The run's state lives HERE, not in the wizard: while a run started on this page is going
  // (or failed), the page keeps the run's screen even though the document is already `running`
  // and the query rereads it after every stage (pageShowsReport). A finished run clears the draft.
  const onFinished = useCallback(() => clearStoredDraft(typeof window !== 'undefined' ? window.localStorage : null, ownerId ?? ''), [ownerId]);
  const run = useConsulenteRun(ownerId ?? '', onFinished);

  const { loading, loadFailed } = composeReadState([settingsQuery, assetsQuery, goalsQuery, adviceQuery]);

  const header = (
    <PageHeader
      label="Pianificazione"
      title="Consulente"
      description="Imposta la tua allocazione con due agenti: uno propone, l'altro cerca gli strumenti."
      actions={
        <Button asChild variant="outline" className="hidden h-8 px-2.5 text-xs desktop:inline-flex">
          <Link href="/dashboard/allocation">Torna all&apos;Allocazione</Link>
        </Button>
      }
    />
  );

  if (!user || !ownerId) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  if (isDemo) {
    return (
      <PageContainer>
        {header}
        <EmptyState message="Il Consulente non è disponibile nell'account demo: scrive le impostazioni, e quelle del demo sono di tutti." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  if (loadFailed) {
    return (
      <PageContainer>
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => {
            void settingsQuery.refetch();
            void assetsQuery.refetch();
            void goalsQuery.refetch();
            void adviceQuery.refetch();
          }}
          notice={describeReadFailure({
            consequence: 'Strumenti, impostazioni, obiettivi o l\'ultimo percorso non sono stati letti: senza di essi il percorso non può partire.',
            untouched: 'Nulla è stato scritto.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  const assets = assetsQuery.data ?? [];
  const settings = settingsQuery.data ?? null;
  const goalData = goalsQuery.data ?? null;
  const advice = adviceQuery.data ?? null;
  const showReport = pageShowsReport({
    document: advice,
    // «Rifai» pressed here, or asked by the link: the document on screen at open is hidden; a newer one shows.
    redoAt: redo?.documentUpdatedAt ?? (startFresh && advice ? advice.updatedAt.getTime() : null),
    openedAt,
    runActive: run.state.kind === 'running' || run.state.kind === 'failed',
  });

  return (
    <PageContainer>
      {header}
      {showReport && advice !== null ? (
        <ConsulenteReport
          ownerId={ownerId}
          document={advice}
          assets={assets}
          goalData={goalData}
          onRedo={() => setRedo({ documentUpdatedAt: advice.updatedAt.getTime() })}
        />
      ) : (
        <ConsulenteWizard ownerId={ownerId} configured={configured} settings={settings} goalData={goalData} assets={assets} lastDocument={advice} run={run} />
      )}
    </PageContainer>
  );
}
