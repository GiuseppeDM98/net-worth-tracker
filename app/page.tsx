/**
 * Home Page - Route Guard and Splash Screen
 *
 * This component acts as a route guard that redirects users based on authentication state.
 * It never renders actual content - only shows a loading spinner during auth check, then redirects.
 *
 * Redirect Logic:
 * - Authenticated users → /dashboard
 * - Unauthenticated users → /login
 *
 * Why wait for !loading before redirecting?
 * - Prevents race condition where we redirect before knowing the actual auth state
 * - If we redirect while loading=true, we might send authenticated users to /login
 * - This could cause flash-of-wrong-content or infinite redirect loops
 *
 * Why return null after loading completes?
 * - By the time loading=false, useEffect has already triggered router.push()
 * - Component will unmount as Next.js navigates to the new route
 * - Returning null prevents any flash of empty content during navigation
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until auth state is fully loaded before making routing decisions
    // This prevents redirecting to wrong route during initial auth check
    if (!loading) {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  // Show loading spinner while determining auth state
  // This provides visual feedback and prevents blank screen during auth check
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  // Return null instead of loading state because router.push() was already called
  // Component will unmount during navigation - no need to render anything
  return null;
}
