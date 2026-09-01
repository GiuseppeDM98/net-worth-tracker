'use client';

import { MotionConfig } from 'framer-motion';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppSidebar } from '@/components/layout/Sidebar';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { FlaskConical } from 'lucide-react';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDemo = useDemoMode();

  return (
    <MotionConfig reducedMotion="user">
      <ProtectedRoute>
        <SidebarProvider className="h-screen overflow-hidden">
          <AppSidebar />

          <SidebarInset className="overflow-hidden">
            {/* Hamburger bar — landscape mobile only.
                SidebarTrigger toggles the shadcn sidebar Sheet on screens < 1440px. */}
            <div className="flex shrink-0 items-center gap-2 border-b bg-background px-4 py-2.5 desktop:hidden max-desktop:portrait:hidden max-desktop:landscape:flex">
              <SidebarTrigger aria-label="Apri il menu" />
              <span className="text-[13px] font-semibold tracking-[-0.01em]">Portfolio Tracker</span>
            </div>

            {isDemo && (
              // Amber is intentionally hardcoded via --warning tokens: demo mode is a
              // global concern that must read as "caution" on every theme. The token
              // maps to oklch amber regardless of active palette, and text on that fill is
              // always --warning-foreground (AGENTS.md → Layout and Color Tokens).
              //
              // The banner takes the app's cadence: the label is the ONE eyebrow, recoloured
              // for the fill it sits on, and the consequence is a 12px reading beside it —
              // visible at every width, because a phone is exactly where a reader needs to be
              // told why a button does nothing (it used to be hidden below 640px).
              <div className="flex shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-warning-border bg-warning px-4 py-2 text-warning-foreground">
                <span className="flex shrink-0 items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className={cn(TILE_EYEBROW_CLASS, 'text-warning-foreground')}>
                    Modalità demo
                  </span>
                </span>
                <span className="text-[12px] leading-[1.45] text-warning-foreground/80">
                  Account condiviso in sola lettura: puoi aprire ogni pagina, nessuna modifica
                  viene salvata.
                </span>
              </div>
            )}

            {/* Page transitions handled by template.tsx which re-mounts on every navigation */}
            <main className="flex-1 overflow-y-auto bg-background p-4 desktop:p-5 max-desktop:portrait:[padding-bottom:calc(env(safe-area-inset-bottom,0px)+88px)] max-desktop:landscape:pb-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>

        {/* Bottom Navigation — mobile portrait only */}
        <BottomNavigation />
      </ProtectedRoute>
    </MotionConfig>
  );
}
