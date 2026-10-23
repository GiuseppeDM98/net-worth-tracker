/**
 * The one sentence a broker import prints under a fund whose published mix it will store:
 * «72,70% Obbligazioni · 23,70% Azioni · 3,60% Liquidità».
 *
 * Kept beside `fundComposition.ts` (the module that builds the legs) so the four previews —
 * Intesa, Azimut, Scalable and Trade Republic — cannot drift into four punctuation styles. It is
 * UI text, in Italian, because that is what the previews show.
 */
import type { AssetComposition } from '@/types/assets';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { formatPercentageIt } from '@/lib/utils/formatters';

export function describeFundComposition(composition: AssetComposition[] | undefined): string {
  return (composition ?? [])
    .map(
      (leg) =>
        `${formatPercentageIt(leg.percentage, 2)} ${ASSET_CLASS_LABELS[leg.assetClass] ?? leg.assetClass}`
    )
    .join(' · ');
}
