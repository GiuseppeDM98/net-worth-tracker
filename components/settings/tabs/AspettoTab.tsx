'use client';

/**
 * Impostazioni › Aspetto — light/dark/system beside the six colour themes.
 *
 * No slice: both choices save themselves (the mode through next-themes, per device; the theme
 * through `ColorThemeContext`, on the account) outside the page's «Salva», and mark no tab
 * (doc/guide/impostazioni.md). The view reads the two contexts itself.
 */

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useColorTheme, type ColorTheme } from '@/contexts/ColorThemeContext';
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

// Tema colori. Swatch previews carry each theme's own oklch values on purpose:
// they PREVIEW a palette that is not active, which no CSS token can express.
const COLOR_THEME_SWATCHES = [
  {
    id: 'default' as ColorTheme,
    name: 'Default',
    description: 'Zinc classico',
    swatchBg: 'oklch(1 0 0)',
    swatchBgDark: 'oklch(0.145 0 0)',
    swatchPrimary: 'oklch(0.205 0 0)',
    swatchPrimaryDark: 'oklch(0.922 0 0)',
    swatchAccent: 'oklch(0.97 0 0)',
  },
  {
    id: 'solar-dusk' as ColorTheme,
    name: 'Solar Dusk',
    description: 'Ambra calda',
    swatchBg: 'oklch(0.9885 0.0057 84.5659)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.5553 0.1455 48.9975)',
    swatchPrimaryDark: 'oklch(0.7049 0.1867 47.6044)',
    swatchAccent: 'oklch(0.9000 0.0500 74.9889)',
  },
  {
    id: 'elegant-luxury' as ColorTheme,
    name: 'Elegant Luxury',
    description: 'Borgogna raffinato',
    swatchBg: 'oklch(0.9779 0.0042 56.3756)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.4650 0.1470 24.9381)',
    swatchPrimaryDark: 'oklch(0.5054 0.1905 27.5181)',
    swatchAccent: 'oklch(0.9619 0.0580 95.6174)',
  },
  {
    id: 'midnight-bloom' as ColorTheme,
    name: 'Midnight Bloom',
    description: 'Viola profondo',
    swatchBg: 'oklch(0.9821 0 0)',
    swatchBgDark: 'oklch(0.2303 0.0125 264.2926)',
    swatchPrimary: 'oklch(0.5676 0.2021 283.0838)',
    swatchPrimaryDark: 'oklch(0.5676 0.2021 283.0838)',
    swatchAccent: 'oklch(0.8214 0.0720 249.3482)',
  },
  {
    id: 'cyberpunk' as ColorTheme,
    name: 'Cyberpunk',
    description: 'Neon pink & teal',
    swatchBg: 'oklch(0.9816 0.0017 247.8390)',
    swatchBgDark: 'oklch(0.1649 0.0352 281.8285)',
    swatchPrimary: 'oklch(0.6726 0.2904 341.4084)',
    swatchPrimaryDark: 'oklch(0.6726 0.2904 341.4084)',
    swatchAccent: 'oklch(0.8903 0.1739 171.2690)',
  },
  {
    id: 'retro-arcade' as ColorTheme,
    name: 'Retro Arcade',
    description: 'Rosso & teal vintage',
    swatchBg: 'oklch(0.9735 0.0261 90.0953)',
    swatchBgDark: 'oklch(0.2673 0.0486 219.8169)',
    swatchPrimary: 'oklch(0.5924 0.2025 355.8943)',
    swatchPrimaryDark: 'oklch(0.5924 0.2025 355.8943)',
    swatchAccent: 'oklch(0.6437 0.1019 187.3840)',
  },
] as const;

export function AspettoTab() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const { theme, setTheme } = useTheme();
  // The active next-themes mode does not exist until hydration (same guard as ThemePicker).
  const isThemeHydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  const resolvedThemeMode = isThemeHydrated ? (theme as ThemeMode | undefined) : undefined;
  const activeSwatch = COLOR_THEME_SWATCHES.find((swatch) => swatch.id === colorTheme) ?? COLOR_THEME_SWATCHES[0];

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

      {/* Tema colori — the six palettes, synced on the account */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-8')}>
        <Tile eyebrow="Tema colori" aside="tutti i dispositivi" reading={describeColorTheme(activeSwatch.name)}>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 desktop:grid-cols-6">
            {COLOR_THEME_SWATCHES.map((swatch, index) => {
              const isActive = colorTheme === swatch.id;
              return (
                <button
                  key={swatch.id}
                  onClick={() => setColorTheme(swatch.id)}
                  aria-label={`Colore ${index + 1} di ${COLOR_THEME_SWATCHES.length}: ${swatch.name}`}
                  aria-pressed={isActive}
                  className={cn(
                    'relative flex flex-col rounded-[10px] border-2 p-2.5 text-left transition-all hover:border-primary/60',
                    isActive ? 'border-primary shadow-sm' : 'border-border'
                  )}
                >
                  {/* Mini preview: light half over dark half, in the theme's own values */}
                  <div className="mb-2.5 h-14 overflow-hidden rounded-md border border-border/50" aria-hidden="true">
                    <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBg }}>
                      <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimary }} />
                      <div className="h-2 flex-1 rounded-full" style={{ background: swatch.swatchAccent }} />
                    </div>
                    <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBgDark }}>
                      <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimaryDark }} />
                      <div className="h-2 flex-1 rounded-full opacity-30" style={{ background: swatch.swatchPrimaryDark }} />
                    </div>
                  </div>
                  <span className="text-[13px] font-medium leading-none">{swatch.name}</span>
                  <span className="mt-1 text-[11px] text-muted-foreground">{swatch.description}</span>
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
