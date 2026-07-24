'use client';

/**
 * Previdenza Complementare — dedicated view for the fondo pensione (spec 2-pension-fund/04 §3, D7).
 *
 * Lives in `planningNav` (Pianificazione), not as a `fire-simulations` tab: contributions, tax
 * benefit and plafond are planning content in their own right, and this is also the target of the
 * "Vai a Previdenza" quick link on a pensionFund asset card in Patrimonio.
 */

import { PiggyBank } from 'lucide-react';
import { PensionOverview } from '@/components/pension/PensionOverview';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

export default function PensionPage() {
  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <PiggyBank className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" aria-hidden="true" />
            Previdenza Complementare
          </span>
        }
        description="Versamenti, beneficio fiscale e plafond del tuo fondo pensione"
      />
      <PensionOverview />
    </PageContainer>
  );
}
