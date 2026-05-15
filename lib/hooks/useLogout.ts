'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
