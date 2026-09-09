/**
 * React Query Client Provider Configuration
 *
 * Wraps the app with React Query (TanStack Query) for API call caching and state management.
 *
 * Configuration Strategy:
 * - staleTime: 5 minutes - Data considered fresh (no automatic refetch)
 * - gcTime: 10 minutes - Cache cleanup time for unused data (formerly cacheTime)
 * - retry: 1 - Single retry on failure (default is 3, reduced for faster feedback)
 * - refetchOnWindowFocus: false - Don't refetch when user returns to tab (manual refresh preferred)
 *
 * Why useState instead of useMemo?
 * React Query documentation recommends useState to ensure queryClient is created
 * only once and never recreated on re-renders. useMemo can theoretically recreate
 * the instance (React doesn't guarantee memoization), which would clear the cache
 * and cause unnecessary API calls.
 *
 * Devtools:
 * Not mounted. `@tanstack/react-query-devtools` stays installed for ad-hoc debugging of
 * cache state, but rendering it here would ship the panel to every environment.
 */
'use client';

import { QueryClient, QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  // Use useState (not useMemo) to guarantee single queryClient instance
  // React Query recommends this to prevent cache clearing on re-renders
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - balance between freshness and performance
            gcTime: 10 * 60 * 1000, // 10 minutes - keep inactive data cached briefly
            retry: 1, // Single retry on failure for faster user feedback
            refetchOnWindowFocus: false, // Manual refresh preferred over automatic
          },
        },
      })
  );

  return (
    <TanStackQueryClientProvider client={queryClient}>
      {children}
    </TanStackQueryClientProvider>
  );
}
