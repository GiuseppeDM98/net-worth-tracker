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
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile hamburger menu - solo landscape */}
          <div className="flex items-center gap-4 bg-white px-4 py-3 lg:hidden max-lg:portrait:hidden max-lg:landscape:flex border-b">
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
          <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6 lg:pb-6 max-lg:portrait:pb-20 max-lg:landscape:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Bottom Navigation - Solo mobile portrait */}
      <BottomNavigation />
    </ProtectedRoute>
  );
}
