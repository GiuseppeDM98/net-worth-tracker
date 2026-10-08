'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * The sign-out, shared by the sidebar and the «Altro» drawer.
 *
 * It only signs out: the query cache — in memory and in IndexedDB — is forgotten by
 * the provider on the user-to-none transition (`SignOutCacheGuard`, lib/providers/QueryClientProvider.tsx),
 * once the pages have unmounted. Clearing it HERE, with the pages still mounted for one render,
 * made their hooks refetch and re-persist the outgoing account's data (2026-09-29).
 */
export function useLogout(onBeforeSignOut?: () => void) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleSignOut = async () => {
    onBeforeSignOut?.();
    try {
      await signOut();
      toast.success('Logout effettuato con successo');
      router.push('/login');
    } catch {
      toast.error('Errore durante il logout');
    }
  };

  return { confirmLogout, setConfirmLogout, handleSignOut };
}
