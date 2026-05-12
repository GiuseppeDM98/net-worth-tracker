'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleButtonProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggleButton({ className, showLabel = false }: ThemeToggleButtonProps) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

    if (!('startViewTransition' in document)) {
      setTheme(next);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    const maxR = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy)
    );

    const root = document.documentElement;
    root.style.setProperty('--vt-cx', `${cx}px`);
    root.style.setProperty('--vt-cy', `${cy}px`);
    root.style.setProperty('--vt-r', `${Math.ceil(maxR)}px`);

    document.startViewTransition(() => setTheme(next));
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel =
    theme === 'dark' ? 'Scuro (clicca per: Sistema)' :
    theme === 'light' ? 'Chiaro (clicca per: Scuro)' :
    'Sistema (clicca per: Chiaro)';

  const iconMotion = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={theme}
        initial={{ opacity: 0, rotate: -30, scale: 0.6 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 30, scale: 0.6 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex items-center justify-center"
      >
        <ThemeIcon className="size-4" />
      </motion.span>
    </AnimatePresence>
  );

  if (showLabel) {
    return (
      <Button
        variant="ghost"
        className={cn('flex h-auto items-center gap-1.5 rounded-md px-2 py-1.5', className)}
        onClick={cycleTheme}
        title={themeLabel}
      >
        {iconMotion}
        <span className="text-xs font-medium">Tema</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className ?? 'size-7'}
      onClick={cycleTheme}
      title={themeLabel}
    >
      {iconMotion}
    </Button>
  );
}
