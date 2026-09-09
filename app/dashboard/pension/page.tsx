'use client';

/**
 * Previdenza Complementare — dedicated view for the fondo pensione.
 *
 * Lives in `planningNav` (Pianificazione), not as a `fire-simulations` tab: contributions, tax
 * benefit and plafond are planning content in their own right, and this is also the target of the
 * "Vai a Previdenza" quick link on a pensionFund asset card in Patrimonio.
 *
 * The compact header is a breadcrumb: the page's real headline is the verdict rendered by
 * `PensionOverview` (DESIGN.md → Compact Page Header). «Registra versamento» keeps the header's
 * actions slot, as the Panoramica's «Crea snapshot» does.
 */

import { PensionOverview } from '@/components/pension/PensionOverview';
import { PensionHeaderAction } from '@/components/pension/PensionHeaderAction';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

export default function PensionPage() {
  return (
    <PageContainer>
      <PageHeader
        label="Pianificazione"
        title="Previdenza"
        description="Versamenti, beneficio fiscale e plafond del tuo fondo pensione"
        actions={<PensionHeaderAction />}
      />
      <PensionOverview />
    </PageContainer>
  );
}
