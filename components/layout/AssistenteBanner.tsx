'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AssistenteBannerProps {
  onClick?: () => void;
  className?: string;
}

export function AssistenteBanner({ onClick, className }: AssistenteBannerProps) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const isActive =
    pathname === '/dashboard/assistant' || pathname.startsWith('/dashboard/assistant/');

  return (
    <Link
      href="/dashboard/assistant"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-2 overflow-hidden rounded-lg border px-3 py-2.5 transition-all duration-150 hover:-translate-y-px active:translate-y-0',
        isActive
          ? 'border-violet-400/40 bg-violet-500/[0.10]'
          : 'border-violet-500/30 bg-violet-500/[0.06] hover:border-violet-400/40 hover:bg-violet-500/[0.10]',
        className
      )}
    >
      {/* Sparkle 1 — larger, top-right */}
      <motion.span
        className="pointer-events-none absolute right-2.5 top-2.5"
        animate={reduced ? undefined : { y: [0, -3, 0], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="size-3 text-violet-400" />
      </motion.span>

      {/* Sparkle 2 — smaller, offset timing */}
      <motion.span
        className="pointer-events-none absolute right-7 top-4"
        animate={reduced ? undefined : { scale: [0.7, 1.1, 0.7], opacity: [0.15, 0.4, 0.15] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      >
        <Sparkles className="size-2 text-violet-300" />
      </motion.span>

      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-500/15">
          <Bot className="size-3.5 text-violet-500 dark:text-violet-400" />
        </div>
        <span className="text-sm font-semibold leading-none">Assistente AI</span>
      </div>

      <p className="pr-4 text-[11px] leading-relaxed text-muted-foreground">
        Chiedi, analizza e confronta il tuo patrimonio con l&apos;AI.
      </p>
    </Link>
  );
}
