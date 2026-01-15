/**
 * Authentication guard for protected dashboard routes
 *
 * ARCHITECTURE:
 * Three-state render pattern for Firebase auth lifecycle:
 * 1. Loading - Show spinner (prevent flash of redirect)
 * 2. Not authenticated - Return null, redirect in useEffect
 * 3. Authenticated - Render children
 *
 * Race Condition Prevention:
 * - Checks !loading && !user before redirect
 * - Redirect in useEffect (not render) to avoid React errors
 * - Returns null during redirect to prevent flash of protected content
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  /**
   * Redirect in useEffect to avoid "Cannot update component while rendering" error.
   * The !loading check prevents premature redirect during Firebase auth state resolution.
   *
   * Why router in deps? Ensures effect re-runs if Next.js router instance changes,
   * though unlikely in practice.
   */
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Show spinner with min-h-screen to prevent layout shift during auth check.
  // Better UX than blank screen or flash of login page.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  // Return null instead of redirecting here to avoid rendering protected content
  // during router.push() transition. Redirect handled in useEffect above.
  if (!user) {
    return null;
  }

  return <>{children}</>;
}
