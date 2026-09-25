/**
 * Account sharing settings — the «Condivisione account» tile: grant/revoke delegated
 * access to YOUR account.
 *
 * This always manages the logged-in user's OWN account (the `/api/account/members`
 * route derives the owner from the ID token), regardless of which account is
 * currently active in the switcher. A member added here can sign in with their
 * own account and act on your data as a co-owner. The tile's reading line says who
 * sees what (settingsNarrative.describeSharing) — the page's «chi vede cosa» in words.
 *
 * Two things here are heavier than they look, and both are paid for (critique of 2026-09-22):
 * a FAILED read of the members is not «nobody has access» — the tile would state a false
 * reassurance about who can read the owner's money — so it gives way to an ErrorNotice; and a
 * revoke is a two-click confirm whose armed row says what the second press takes away.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tile } from '@/components/ui/tile';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeSharing } from '@/lib/utils/settingsNarrative';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { cn } from '@/lib/utils';

interface Member {
  uid: string;
  email: string;
  displayName: string | null;
  addedAt: string;
}

/** First name where we have one, the email otherwise — whatever names the person. */
const memberName = (member: Member) => member.displayName?.split(' ')[0] ?? member.email;

interface MemberRowProps {
  member: Member;
  disabled: boolean;
  removing: boolean;
  onRevoke: (member: Member) => void;
  /** The list's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
}

/**
 * One person with access. The revoke arms at the first press (`useArmedDelete`, no timer): the
 * button becomes a compact «Conferma» and the ROW says what the second press does.
 */
function MemberRow({ member, disabled, removing, onRevoke, announce }: MemberRowProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, () => onRevoke(member));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per revocare l'accesso a ${member.email}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Revoca annullata');
    }
  }, [armed, announce, member.email]);

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border py-1 pl-3 pr-1 text-sm',
        armed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30'
      )}
    >
      <div className="min-w-0">
        {member.displayName && <p className="truncate font-medium text-foreground">{member.displayName}</p>}
        <p className="truncate text-muted-foreground">{member.email}</p>
        {armed && (
          <p className="text-[11px] leading-[1.4] text-destructive">
            Revocando, {memberName(member)} non vedrà più il tuo account.
          </p>
        )}
      </div>
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={armed ? `Conferma la revoca dell'accesso a ${member.email}` : `Revoca accesso a ${member.email}`}
        disabled={disabled || removing}
        onClick={onClick}
        onBlur={onBlur}
        className={cn(
          'h-11 min-w-11 shrink-0 desktop:h-8 desktop:min-w-8',
          armed ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground hover:text-destructive'
        )}
      >
        {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        {armed && !removing && <span className="text-xs">Conferma</span>}
      </Button>
    </li>
  );
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => setAnnouncement(text), []);
  const [emailInput, setEmailInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/account/members');
      if (!response.ok) throw new Error('load failed');
      const data = await response.json();
      setMembers(data.members ?? []);
      setLoadFailed(false);
    } catch (error) {
      // No toast: the tile itself becomes the failure, in place of a list that would read «nobody».
      console.error('[AccountSharing] load failed:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadMembers();
    }, 0);
    return () => clearTimeout(timer);
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

  const retry = () => {
    setLoading(true);
    void loadMembers();
  };

  if (loadFailed && !loading) {
    return (
      <ErrorNotice
        onRetry={retry}
        notice={describeReadFailure({
          subject: 'Condivisione account',
          consequence:
            "Non sappiamo chi ha accesso al tuo account: la lettura non è riuscita, e questo non vuol dire che non ce l'abbia nessuno.",
          untouched: 'Nessun accesso è stato aggiunto o revocato.',
          canRetry: true,
        })}
      />
    );
  }

  return (
    <Tile
      eyebrow="Condivisione account"
      aside={loading ? undefined : members.length === 1 ? '1 accesso' : `${members.length} accessi`}
      reading={
        loading
          ? null
          : describeSharing({ memberNames: members.map(memberName) })
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
          className="h-11 desktop:h-9"
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
              <MemberRow
                key={member.uid}
                member={member}
                disabled={disabled}
                removing={removingUid === member.uid}
                onRevoke={handleRemove}
                announce={announce}
              />
            ))}
          </ul>
        )
      )}

      {/* The list's one live region: arm and disarm are sentences, spoken here. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
        L&apos;accesso è sempre al TUO account, qualunque account sia attivo nello switcher; le credenziali non si
        condividono mai e la revoca è immediata.
      </div>
    </Tile>
  );
}
