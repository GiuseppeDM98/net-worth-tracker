/**
 * Authentication gate for the dashboard PAGES — not for the shell around them.
 *
 * Since 2026-09-28 the dashboard layout renders the skip link, the sidebar, `<main>` and the bottom
 * nav unconditionally, so they are in the prerendered HTML and on screen before Firebase Auth has
 * resolved; this component sits INSIDE `<main>` and gates only the page. Three states:
 * 1. Loading — render `fallback` (the layout passes the generic tile-grid skeleton: the wait is a
 *    WAIT and takes the primitive every page uses, DESIGN.md → The Absence-Has-Three-Names Rule).
 *    On the server `loading` is always true, so the fallback is what the HTML carries. The same
 *    fallback also covers the restore of the persisted query cache (`useIsRestoring`, PERF-03).
 * 2. Not authenticated — keep the fallback on screen and redirect in an effect: the beat between
 *    the verdict and the navigation shows the same skeleton, not an empty `main`.
 * 3. Authenticated — render the page.
 *
 * Race condition prevention: the redirect checks `!loading && !user` (never before Auth has
 * answered) and runs in `useEffect`, not during render.
 */
'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useIsRestoring } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  /** What stands in for the page while Auth resolves (and during the redirect to /login). */
  fallback?: ReactNode;
}

export function ProtectedRoute({ children, fallback = null }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  // The persisted query cache is still being read from IndexedDB (PERF-03, a few ms after the
  // shell): a page mounted before it lands would see every query `pending` and NOT fetching — so
  // `isLoading` false and `data` undefined, which every page reads as «nothing recorded». The
  // restore usually beats Firebase Auth, but nothing guarantees it; the gate holds the same
  // fallback until both have answered. `false` when the persister is off (the context's default).
  const isRestoring = useIsRestoring();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || isRestoring || !user) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
