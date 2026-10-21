'use client';

/**
 * Impostazioni › Spese › «Compravendita» (owner, 2026-10-21): the category each kind of cost of a
 * house's purchase or sale starts on in Patrimonio › Compravendita — notary, taxes, agency, the
 * policies, the instalments. A controlled view of the slice's list (`withRealEstateDefault`); a kind
 * without a default starts on the category whose name answers it (`suggestCategory`).
 */

import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import { ErrorNotice } from '@/components/ui/error-notice';
import { CategoryField } from '@/components/assets/compravendita/fields';
import { describeReadFailure, type SurfaceState } from '@/lib/utils/statesNarrative';
import { withRealEstateDefault } from '@/lib/utils/settingsDraft';
import { REAL_ESTATE_COST_LABELS } from '@/lib/utils/realEstateOperationNarrative';
import { describeRealEstateCategoriesSetting } from '@/lib/utils/settingsNarrative';
import { REAL_ESTATE_COST_KINDS, REAL_ESTATE_COST_TYPES, realEstateDefaultsByKind, type RealEstateCostDefault } from '@/types/realEstateOperation';
import type { ExpenseCategory } from '@/types/expenses';

interface RealEstateDefaultsTileProps {
  value: RealEstateCostDefault[];
  onChange: (value: RealEstateCostDefault[]) => void;
  categories: ExpenseCategory[];
  categoriesState: SurfaceState;
  onRetryCategories: () => void;
}

export function RealEstateDefaultsTile({ value, onChange, categories, categoriesState, onRetryCategories }: RealEstateDefaultsTileProps) {
  if (categoriesState === 'failed') {
    return (
      <ErrorNotice
        onRetry={onRetryCategories}
        notice={describeReadFailure({
          subject: 'Compravendita',
          consequence: 'Le categorie non sono state lette: quelle predefinite della compravendita non si possono mostrare. Quelle salvate restano.',
          canRetry: true,
        })}
      />
    );
  }
  const byKind = realEstateDefaultsByKind(value);
  return (
    <Tile eyebrow="Compravendita" reading={categoriesState === 'loading' ? null : describeRealEstateCategoriesSetting(Object.keys(byKind).length, REAL_ESTATE_COST_KINDS.length)}>
      <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-4 py-3 tablet:grid-cols-2">
        {REAL_ESTATE_COST_KINDS.map((kind) => (
          <div key={kind} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <CategoryField
                id={`re-default-${kind}`}
                label={REAL_ESTATE_COST_LABELS[kind]}
                categories={categories}
                allowed={REAL_ESTATE_COST_TYPES[kind]}
                value={byKind[kind] ?? null}
                onChange={(choice) => onChange(withRealEstateDefault(value, kind, choice))}
              />
            </div>
            {byKind[kind] && (
              <Button type="button" variant="ghost" size="sm" className="h-11 desktop:h-9" aria-label={`Rimuovi la categoria predefinita di ${REAL_ESTATE_COST_LABELS[kind]}`} onClick={() => onChange(withRealEstateDefault(value, kind, null))}>
                Rimuovi
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
        Le voci delle rate sono categorie di tipo debito, il rimborso una categoria di entrata. Si cambiano anche voce per voce nel percorso.
      </div>
    </Tile>
  );
}
