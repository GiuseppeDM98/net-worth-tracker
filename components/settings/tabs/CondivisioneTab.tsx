'use client';

/**
 * Impostazioni › Condivisione — the sharing section (its own tile, its own documents) beside how
 * it works. No slice: a grant is written where it is granted, never through «Salva».
 */

import { AccountSharingSection } from '@/components/settings/AccountSharingSection';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { SettingsTabPanel } from './shared';

const HOW_IT_WORKS = [
  'La persona si registra con la propria email (deve essere abilitata alla registrazione).',
  'Aggiungi qui la stessa email: l’accesso è completo, non esiste un ruolo «sola lettura».',
  'Dal suo menu account sceglie quale account vedere; le sue preferenze e il suo tema restano suoi.',
];

interface CondivisioneTabProps {
  /** In demo nothing writes: the section's controls are disabled. */
  isDemo: boolean;
}

export function CondivisioneTab({ isDemo }: CondivisioneTabProps) {
  return (
    <SettingsTabPanel tab="condivisione" label="Condivisione">
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
        <AccountSharingSection disabled={isDemo} />
      </div>
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
        <Tile
          eyebrow="Come funziona"
          reading={[{ text: "L'invitata si registra prima; poi l'account condiviso appare nel suo switcher." }]}
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            {HOW_IT_WORKS.map((step, index) => (
              <div key={index} className="flex items-start gap-3 py-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold">
                  {index + 1}
                </span>
                <span className="text-[13px] leading-[1.45]">{step}</span>
              </div>
            ))}
          </div>
        </Tile>
      </div>
    </SettingsTabPanel>
  );
}
