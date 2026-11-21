'use client';

/**
 * Impostazioni › Aspetto — light/dark/system beside the colour themes.
 *
 * No slice: both choices save themselves (the mode through next-themes, per device; the theme
 * through `ColorThemeContext`, on the account) outside the page's «Salva», and mark no tab
 * (doc/guide/impostazioni.md). The view reads the two contexts itself.
 */

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import { COLOR_THEME_META, COLOR_THEMES } from '@/lib/constants/colorTheme';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { applyThemeWithTransition } from '@/lib/utils/themeTransition';
import { describeColorTheme, describeThemeMode, type ThemeMode } from '@/lib/utils/settingsNarrative';
import { SettingsTabPanel } from './shared';

// Stable no-op store for the SSR/hydration split (same guard ThemePicker uses).
const neverChanges = () => () => {};

// Modalità: the three next-themes modes, applied with the circle view transition.
const THEME_MODES = [
  { value: 'light',  label: 'Chiaro',  Icon: Sun     },
  { value: 'dark',   label: 'Scuro',   Icon: Moon    },
  { value: 'system', label: 'Sistema', Icon: Monitor },
] as const;

// Tema colori. Each half of a preview is the theme's own block applied to a `div` (`[data-theme]`,
// `.dark[data-theme]`), so a preview cannot drift from `globals.css`; the names come from the registry.
const SWATCH_GRID_COLUMNS_CLASS = COLOR_THEMES.length > 6 ? 'desktop:grid-cols-4' : 'desktop:grid-cols-6';

export function AspettoTab() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const { theme, setTheme } = useTheme();
  // The active next-themes mode does not exist until hydration (same guard as ThemePicker).
  const isThemeHydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  const resolvedThemeMode = isThemeHydrated ? (theme as ThemeMode | undefined) : undefined;

  return (
    <SettingsTabPanel tab="aspetto" label="Aspetto">
      {/* Modalità — next-themes, per device, with the circle view transition */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
        <Tile eyebrow="Modalità" aside="questo dispositivo" reading={describeThemeMode(resolvedThemeMode)}>
          <div className="mt-3.5 flex rounded-lg bg-muted p-1" role="group" aria-label="Modalità del tema">
            {THEME_MODES.map(({ value, label, Icon }) => {
              const isActive = resolvedThemeMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
                  className={cn(
                    'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
                    isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Il passaggio anima con la transizione circolare dal punto del clic; il selettore resta anche nel menu
            account della sidebar.
          </div>
        </Tile>
      </div>

      {/* Tema colori — the colour themes, synced on the account */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-8')}>
        <Tile eyebrow="Tema colori" aside="tutti i dispositivi" reading={describeColorTheme(COLOR_THEME_META[colorTheme].name)}>
          <div className={cn('mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3', SWATCH_GRID_COLUMNS_CLASS)}>
            {COLOR_THEMES.map((id, index) => {
              const isActive = colorTheme === id;
              const { name, description } = COLOR_THEME_META[id];
              return (
                <button
                  key={id}
                  onClick={() => setColorTheme(id)}
                  aria-label={`Colore ${index + 1} di ${COLOR_THEMES.length}: ${name}`}
                  aria-pressed={isActive}
                  className={cn(
                    'relative flex flex-col rounded-[10px] border-2 p-2.5 text-left transition-all hover:border-primary/60',
                    isActive ? 'border-primary shadow-sm' : 'border-border'
                  )}
                >
                  {/* Mini preview: the light block over the dark one, each the theme's own tokens */}
                  <div className="mb-2.5 h-14 overflow-hidden rounded-md border border-border/50" aria-hidden="true">
                    <div data-theme={id} className="flex h-7 w-full items-center gap-1.5 bg-background px-2">
                      <div className="h-3 w-3 flex-shrink-0 rounded-sm bg-primary" />
                      <div className="h-2 flex-1 rounded-full bg-accent" />
                    </div>
                    <div data-theme={id} className="dark flex h-7 w-full items-center gap-1.5 bg-background px-2">
                      <div className="h-3 w-3 flex-shrink-0 rounded-sm bg-primary" />
                      <div className="h-2 flex-1 rounded-full bg-primary opacity-30" />
                    </div>
                  </div>
                  <span className="text-[13px] font-medium leading-none">{name}</span>
                  <span className="mt-1 text-[11px] text-muted-foreground">{description}</span>
                  {isActive && (
                    <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            La scelta si salva da sola sull&apos;account: nessun Salva necessario.
          </div>
        </Tile>
      </div>
    </SettingsTabPanel>
  );
}
