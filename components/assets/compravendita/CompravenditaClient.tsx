'use client';

/**
 * PATRIMONIO › COMPRAVENDITA (owner, 2026-10-21) — «come registro l'acquisto o la vendita di una casa?»
 *
 * A path, not a tile grid: one column at 720px, one card per screen, like the Consulente
 * (DESIGN.md → The Conversation-Is-Content Rule, doc/guide/compravendita.md § Composizione mobile).
 * The page reads what the plan needs — assets, settings, categories, cost centres and the expenses
 * (the deposits received, the series a sale stops) — and hands the wizard one context.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useExpenseCategories, useExpenses } from '@/lib/hooks/useExpenses';
import { useCostCenters } from '@/lib/hooks/useCostCenters';
import { composeReadState } from '@/lib/utils/readState';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { COMPRAVENDITA_DESCRIPTION } from '@/lib/utils/realEstateOperationNarrative';
import type { RealEstateDraftContext } from '@/lib/utils/realEstateOperationDraft';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorNotice } from '@/components/ui/error-notice';
import { EmptyState } from '@/components/ui/empty-state';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { Button } from '@/components/ui/button';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { CompravenditaWizard } from './CompravenditaWizard';

/** One tall cell: the path's card. */
const SKELETON_CELLS: TileSkeletonCell[] = [{ span: 12, rows: 2 }];

export function CompravenditaClient() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const assetsQuery = useAssets(ownerId);
  const settingsQuery = useSettings(ownerId);
  const categoriesQuery = useExpenseCategories(ownerId);
  const costCentersQuery = useCostCenters(ownerId);
  const expensesQuery = useExpenses(ownerId);
  // «Today» is read once, when the page opens: a render must not read the clock (react-hooks/purity).
  const [todayIso] = useState(() => getItalyDateIso(new Date()));

  const { loading, loadFailed } = composeReadState([assetsQuery, settingsQuery, categoriesQuery, costCentersQuery, expensesQuery]);

  const context = useMemo<RealEstateDraftContext>(
    () => ({
      todayIso,
      familyMembers: settingsQuery.data?.familyMembers ?? [],
      splitEnabled: settingsQuery.data?.expenseSplitEnabled ?? false,
      assets: assetsQuery.data ?? [],
      categories: categoriesQuery.data ?? [],
      costCenters: costCentersQuery.data ?? [],
      costCentersEnabled: settingsQuery.data?.costCentersEnabled ?? false,
      expenses: expensesQuery.data ?? [],
      settings: settingsQuery.data ?? null,
    }),
    [todayIso, assetsQuery.data, categoriesQuery.data, costCentersQuery.data, expensesQuery.data, settingsQuery.data]
  );

  const header = (
    <PageHeader
      label="Patrimonio"
      title="Compravendita"
      description={COMPRAVENDITA_DESCRIPTION}
      actions={
        <Button asChild variant="outline" className="hidden h-8 px-2.5 text-xs desktop:inline-flex">
          <Link href="/dashboard/assets">Torna a Patrimonio</Link>
        </Button>
      }
    />
  );

  if (!user || !ownerId || loading) {
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
        <EmptyState message="La compravendita non è disponibile nell'account demo: scrive asset e spese, e quelli del demo sono di tutti." />
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
            void assetsQuery.refetch();
            void settingsQuery.refetch();
            void categoriesQuery.refetch();
            void costCentersQuery.refetch();
            void expensesQuery.refetch();
          }}
          notice={describeReadFailure({
            consequence: 'Strumenti, impostazioni, categorie, centri o movimenti non sono stati letti: senza di essi il percorso non può partire.',
            untouched: 'Nulla è stato scritto.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      <CompravenditaWizard ownerId={ownerId} context={context} familyMembers={settingsQuery.data?.familyMembers ?? []} />
    </PageContainer>
  );
}
