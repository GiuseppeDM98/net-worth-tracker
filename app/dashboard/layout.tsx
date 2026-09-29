'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppSidebar } from '@/components/layout/Sidebar';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeaderSkeleton } from '@/components/layout/PageHeader';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { FlaskConical } from 'lucide-react';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

/**
 * The dashboard shell — in the prerendered HTML and on screen BEFORE Firebase Auth resolves
 * (since 2026-09-28): the skip link, the sidebar (its profile in a wait state until the user is known),
 * `<main>` with the generic tile-grid skeleton, the bottom nav. Only the PAGE waits for the user:
 * `ProtectedRoute` sits inside `<main>`. Nothing here may read `window` during render — the first
 * frame on a phone is decided by CSS (`hidden desktop:block`), and `useMediaQuery` answers the
 * server's `false` until hydration is done. No `MotionConfig` here: the root `MotionProvider` is
 * the one.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `useAuth().user` is null until Auth answers, so the banner appears with the user, never before.
  const isDemo = useDemoMode();

  return (
    <>
      {/* The first Tab stop of every dashboard page: the sidebar is fourteen stops (measured on Storico,
          2026-09-20) between a keyboard reader and the page. The landing has the same link. */}
      <a
        href="#page-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Vai al contenuto principale
      </a>
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

          {/* The page scene: `page-main` is the region a navigation cross-fades (globals.css →
              Page scene); the shell around it stays still. template.tsx carries the fallback
              fade for browsers without view transitions. */}
          <main
            id="page-main"
            // Focusable by script only: the skip link lands here, and the next Tab enters the page.
            tabIndex={-1}
            aria-label="Contenuto della pagina"
            className="flex-1 overflow-y-auto bg-background p-4 focus:outline-none desktop:p-5 max-desktop:portrait:[padding-bottom:calc(env(safe-area-inset-bottom,0px)+88px)] max-desktop:landscape:pb-6"
            style={{ viewTransitionName: 'page-main' }}
          >
            {/* The auth wait: the compact header's silhouette and the generic skeleton at the
                page's own width (1920), so the page — its header, its own cells on the same
                primitive — replaces it without moving the grid. The skeleton's label names THIS
                wait; it is also the benchmark's auth marker (scripts/perfBenchmark.mjs). The
                header's words are the page's and arrive with it. */}
            <ProtectedRoute
              fallback={
                <PageContainer>
                  <PageHeaderSkeleton />
                  <TileGridSkeleton label="Verifica dell'accesso" />
                </PageContainer>
              }
            >
              {children}
            </ProtectedRoute>
          </main>
        </SidebarInset>
      </SidebarProvider>

      {/* Bottom Navigation — mobile portrait only */}
      <BottomNavigation />
    </>
  );
}
