'use client';

/**
 * The Previdenza page's two actions, hosted in `PageHeader`'s `actions` slot rather than in a
 * row of their own above the hero: «Registra versamento» (filled, the primary) and «Aggiorna
 * valore» (outline) — the monthly overwrite of the fund's value from the statement, which the
 * page used to teach three times and offer nowhere (2026-09-13). The order between the two is
 * the page's one trap, so a recorded contribution's toast offers «Aggiorna valore» as its action.
 *
 * It owns both dialogs because the header is rendered by the page while the body is rendered by
 * `PensionOverview`; lifting the state to the page would force the page to re-derive "does this user
 * own a fund" too. `useAssets` is the same React Query key `PensionOverview` reads, so this costs one
 * cache hit, not a second fetch.
 *
 * Renders nothing until at least one `pensionFund` asset exists: an action whose dialog can only say
 * "create a fund first" is chrome, and during the initial load it would also contradict the skeleton
 * shown underneath it. Both buttons keep a 40px height below `desktop:` (the touch floor for a
 * primary action, AGENTS.md → Accessibility) and drop to the header's 32px from 1440.
 */

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PensionContributionDialog } from '@/components/pension/PensionContributionDialog';
import { PensionValueDialog } from '@/components/pension/PensionValueDialog';

const ACTION_CLASS = 'h-10 desktop:h-8';

export function PensionHeaderAction() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [], isLoading } = useAssets(ownerId);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);

  const hasFunds = assets.some((asset) => asset.type === 'pensionFund');
  if (isLoading || !hasFunds) return null;

  return (
    <>
      {/* Icon-only below desktop: two labelled buttons beside the mobile header's title left it «P.». */}
      <Button size="sm" variant="outline" className={cn(ACTION_CLASS, 'w-10 px-0 desktop:w-auto desktop:px-3')} onClick={() => setValueOpen(true)} disabled={isDemo} aria-label="Aggiorna valore del fondo">
        <RefreshCw className="h-4 w-4 desktop:mr-1.5" aria-hidden="true" />
        <span className="hidden desktop:inline">Aggiorna valore</span>
      </Button>
      <Button size="sm" className={ACTION_CLASS} onClick={() => setContributionOpen(true)} disabled={isDemo} aria-label="Registra versamento">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Registra versamento
      </Button>
      <PensionContributionDialog open={contributionOpen} onClose={() => setContributionOpen(false)} onRecorded={() => setValueOpen(true)} />
      <PensionValueDialog open={valueOpen} onClose={() => setValueOpen(false)} />
    </>
  );
}
