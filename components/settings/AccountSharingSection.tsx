/**
 * Account sharing settings — grant/revoke delegated access to YOUR account.
 *
 * This always manages the logged-in user's OWN account (the `/api/account/members`
 * route derives the owner from the ID token), regardless of which account is
 * currently active in the switcher. A member added here can sign in with their
 * own account and act on your data as a co-owner.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/utils/authFetch';

interface Member {
  uid: string;
  email: string;
  displayName: string | null;
  addedAt: string;
}

interface AccountSharingSectionProps {
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

export function AccountSharingSection({
  disabled = false,
}: AccountSharingSectionProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/account/members');
      if (!response.ok) throw new Error('load failed');
      const data = await response.json();
      setMembers(data.members ?? []);
    } catch (error) {
      console.error('[AccountSharing] load failed:', error);
      toast.error('Impossibile caricare gli accessi condivisi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleAdd = async () => {
    const email = emailInput.trim();
    if (!email || disabled) return;

    setAdding(true);
    try {
      const response = await authenticatedFetch('/api/account/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Impossibile aggiungere l'accesso");
        return;
      }
      setMembers((prev) => [...prev, data.member]);
      setEmailInput('');
      toast.success(`Accesso concesso a ${data.member.email}`);
    } catch (error) {
      console.error('[AccountSharing] add failed:', error);
      toast.error("Impossibile aggiungere l'accesso");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (member: Member) => {
    if (disabled) return;
    setRemovingUid(member.uid);
    try {
      const response = await authenticatedFetch(
        `/api/account/members?memberUid=${encodeURIComponent(member.uid)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "Impossibile revocare l'accesso");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.uid !== member.uid));
      toast.success(`Accesso revocato a ${member.email}`);
    } catch (error) {
      console.error('[AccountSharing] remove failed:', error);
      toast.error("Impossibile revocare l'accesso");
    } finally {
      setRemovingUid(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Condivisione account
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Concedi ad altre persone l&apos;accesso completo al tuo account. Potranno
          leggere e modificare i tuoi dati (spese, asset, dividendi) accedendo con
          il proprio account, senza vedere le tue credenziali. La persona deve
          prima registrarsi con la propria email.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add-by-email form */}
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="email@esempio.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            disabled={disabled || adding}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAdd}
            disabled={disabled || adding || !emailInput.trim()}
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" />
                Aggiungi
              </>
            )}
          </Button>
        </div>

        {/* Member list */}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento…
          </div>
        ) : members.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nessun accesso condiviso. Aggiungi l&apos;email di una persona per
            iniziare.
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((member) => (
              <li
                key={member.uid}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  {member.displayName && (
                    <p className="truncate font-medium text-foreground">
                      {member.displayName}
                    </p>
                  )}
                  <p className="truncate text-muted-foreground">{member.email}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Revoca accesso a ${member.email}`}
                  disabled={disabled || removingUid === member.uid}
                  onClick={() => handleRemove(member)}
                  className="ml-3 shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                >
                  {removingUid === member.uid ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
