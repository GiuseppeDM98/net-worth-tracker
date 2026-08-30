/**
 * Account sharing settings — the «Condivisione account» tile: grant/revoke delegated
 * access to YOUR account.
 *
 * This always manages the logged-in user's OWN account (the `/api/account/members`
 * route derives the owner from the ID token), regardless of which account is
 * currently active in the switcher. A member added here can sign in with their
 * own account and act on your data as a co-owner. The tile's reading line says who
 * sees what (settingsNarrative.describeSharing) — the page's «chi vede cosa» in words.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tile } from '@/components/ui/tile';
import { describeSharing } from '@/lib/utils/settingsNarrative';
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
    <Tile
      eyebrow="Condivisione account"
      aside={loading ? undefined : members.length === 1 ? '1 accesso' : `${members.length} accessi`}
      reading={
        loading
          ? null
          : describeSharing({
              // First name where we have one, the email otherwise — whatever names the person.
              memberNames: members.map((m) => m.displayName?.split(' ')[0] ?? m.email),
            })
      }
    >
      {/* Add-by-email form */}
      <div className="mt-3 flex gap-2">
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
          aria-label="Email della persona da invitare"
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
        <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Caricamento…
        </div>
      ) : (
        members.length > 0 && (
          <ul className="mt-2.5 space-y-2">
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
        )
      )}

      <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
        L&apos;accesso è sempre al TUO account, qualunque account sia attivo nello switcher; le credenziali non si
        condividono mai e la revoca è immediata.
      </div>
    </Tile>
  );
}
