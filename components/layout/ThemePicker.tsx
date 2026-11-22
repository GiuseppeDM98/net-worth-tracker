'use client';

/**
 * Selettore del tema — usato sia nelle route pubbliche SSR (landing, login, register) sia dentro
 * l'app (Sidebar, SecondaryMenuDrawer).
 *
 * IL TEMA ATTIVO NON ESISTE FINCHÉ NON SI È MONTATI. `useTheme()` legge da localStorage, che sul
 * server non c'è: `theme` è `undefined` durante l'SSR e ridiventa `undefined` al primo render del
 * client, prima che next-themes lo risolva. Evidenziare il pulsante attivo direttamente da `theme`
 * fa quindi divergere markup server e markup client proprio sulla `className` del pulsante scelto —
 * React lo segnala come hydration mismatch e, come dice lui stesso, «this won't be patched up».
 *
 * Il guard fa concordare i due render (nessun pulsante evidenziato) e sposta l'evidenziazione al
 * momento in cui il tema è davvero noto. È l'unica forma possibile: il server non può sapere che
 * tema ha scelto questo browser, quindi non può emettere il markup giusto, e sopprimere l'avviso
 * lascerebbe l'evidenziazione sbagliata invece di toglierla.
 *
 * `useSyncExternalStore` e non il solito `useState(false)` + `useEffect(() => setMounted(true))`:
 * quel pattern è vietato dal lint del progetto (`react-hooks/set-state-in-effect` — una setState
 * sincrona dentro un effetto innesca render a cascata). Questo hook esiste proprio per leggere un
 * fatto che sul server ha un valore e sul client un altro, e lo dichiara nella firma invece di
 * simularlo con un render in più.
 */

import { useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { applyThemeWithTransition } from '@/lib/utils/themeTransition';

/** Lo "store" qui non cambia mai: l'unica cosa che interessa è server (false) vs client (true).
 *  A livello di modulo perché il riferimento resti stabile fra i render. */
const neverChanges = () => () => {};

const THEMES = [
  { value: 'system', icon: Monitor, label: 'Sistema' },
  { value: 'light',  icon: Sun,     label: 'Chiaro'  },
  { value: 'dark',   icon: Moon,    label: 'Scuro'   },
] as const;

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const isHydrated = useSyncExternalStore(neverChanges, () => true, () => false);

  // Prima dell'idratazione nessuna opzione è attiva: è lo stesso markup che ha emesso il server.
  const activeTheme = isHydrated ? theme : undefined;

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
      {THEMES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
          title={label}
          className={cn(
            'flex size-6 items-center justify-center rounded-[var(--costume-control-chip-radius,0.25rem)] transition-colors',
            activeTheme === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
