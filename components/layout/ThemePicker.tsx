'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { applyThemeWithTransition } from '@/lib/utils/themeTransition';

const THEMES = [
  { value: 'system', icon: Monitor, label: 'Sistema' },
  { value: 'light',  icon: Sun,     label: 'Chiaro'  },
  { value: 'dark',   icon: Moon,    label: 'Scuro'   },
] as const;

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
      {THEMES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
          title={label}
          className={cn(
            'flex size-6 items-center justify-center rounded transition-colors',
            theme === value
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
