'use client';

import { MotionConfig } from 'framer-motion';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppSidebar } from '@/components/layout/Sidebar';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { FlaskConical } from 'lucide-react';
import { useDemoMode } from '@/lib/hooks/useDemoMode';

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
              <SidebarTrigger />
              <span className="text-base font-semibold">Portfolio Tracker</span>
            </div>

            {isDemo && (
              // Amber is intentionally hardcoded via --warning tokens: demo mode is a
              // global concern that must read as "caution" on every theme. The token
              // maps to oklch amber regardless of active palette.
              <div className="flex shrink-0 items-center gap-1.5 border-b border-warning-border bg-warning px-4 py-2 text-xs text-warning-foreground">
                <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Modalità Demo</span>
                <span className="hidden text-warning-foreground/75 sm:inline">
                  — sola lettura, i dati non possono essere modificati
                </span>
              </div>
            )}

            {/* Page transitions handled by template.tsx which re-mounts on every navigation */}
            <main className="flex-1 overflow-y-auto bg-background p-4 desktop:p-6 max-desktop:portrait:[padding-bottom:calc(env(safe-area-inset-bottom,0px)+88px)] max-desktop:landscape:pb-6">
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
