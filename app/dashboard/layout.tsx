/**
 * DASHBOARD LAYOUT
 *
 * Provides consistent structure for all dashboard pages.
 *
 * STRUCTURE:
 * - Sidebar: Navigation menu
 * - Header: Top bar with user info
 * - Main content area: Child pages render here
 * - Bottom Navigation: Mobile-only (portrait mode)
 *
 * RESPONSIVE BEHAVIOR:
 * - Desktop (≥1024px): Sidebar always visible, no bottom nav
 * - Mobile Portrait: Sidebar hidden, bottom nav visible
 * - Mobile Landscape: Hamburger menu to open sidebar
 */

'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 desktop:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile hamburger menu - solo landscape */}
          <div className="flex items-center gap-4 bg-white px-4 py-3 desktop:hidden max-desktop:portrait:hidden max-desktop:landscape:flex border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2"
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
            <h1 className="text-lg font-semibold">Portfolio Tracker</h1>
          </div>

          <Header />
          <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6 desktop:pb-6 max-desktop:portrait:pb-20 max-desktop:landscape:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Bottom Navigation - Solo mobile portrait */}
      <BottomNavigation />
    </ProtectedRoute>
  );
}
