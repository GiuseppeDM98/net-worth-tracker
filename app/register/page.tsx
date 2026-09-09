'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthDivider, AuthShell } from '@/components/auth/AuthShell';
import { AuthField, PasswordReveal } from '@/components/auth/AuthField';
import { AuthStatusLine } from '@/components/auth/AuthStatusLine';
import { GoogleMark } from '@/components/auth/GoogleMark';
import { PasswordRequirements } from '@/components/auth/PasswordRequirements';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
// WARNING: Registration behavior depends on APP_CONFIG flags.
// If you modify these flags, also verify:
// - Server-side whitelist validation in lib/server/registrationPolicy.ts
// - resolveRegistrationAccess() in lib/utils/authNarrative.ts, which mirrors its precedence
import { APP_CONFIG } from '@/lib/constants/appConfig';
import {
  arePasswordRequirementsMet,
  buildRegisterVerdict,
  describeAuthError,
  describeRegisterStatus,
  describeUnmetRequirements,
  evaluatePasswordRequirements,
  resolveRegistrationAccess,
  type AuthStatus,
} from '@/lib/utils/authNarrative';

/** Which of the two ways in is running, so the other freezes while it does. */
type PendingSource = 'form' | 'google';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<AuthStatus>({ phase: 'idle' });
  const [pending, setPending] = useState<PendingSource | null>(null);
  const { signUp, signInWithGoogle, user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect to dashboard once AuthContext confirms the user is fully loaded.
  // Same race condition fix as in login/page.tsx — see that file for the full explanation.
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const access = resolveRegistrationAccess(
    APP_CONFIG.REGISTRATIONS_ENABLED,
    APP_CONFIG.REGISTRATION_WHITELIST_ENABLED,
  );
  const requirements = evaluatePasswordRequirements(password, confirmPassword);

  /**
   * Runs one way in and turns its outcome into the tile's reading.
   *
   * On success `pending` stays set on purpose: the redirect above is a beat away, and an
   * unfrozen form during that beat invites a second submit that races it.
   */
  const runAuth = async (source: PendingSource, action: () => Promise<void>) => {
    setPending(source);
    setStatus({ phase: 'submitting' });

    try {
      await action();
      setStatus({ phase: 'success' });
    } catch (error) {
      console.error('[register] sign-up failed', error);
      setStatus({ phase: 'error', message: describeAuthError(error) });
      setPending(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    // The ticked rows and this gate read the SAME predicate, so the form can never refuse
    // what the rows say is satisfied.
    if (!arePasswordRequirementsMet(requirements)) {
      setStatus({ phase: 'error', message: describeUnmetRequirements(requirements) ?? undefined });
      return;
    }

    void runAuth('form', () => signUp(email, password, displayName));
  };

  /** Typing after a failure clears the verdict of the previous attempt, not the fields. */
  const resetStatus = () => {
    if (status.phase !== 'idle') {
      setStatus({ phase: 'idle' });
    }
  };

  const busy = pending !== null;
  const reading = describeRegisterStatus(status, access);
  const verdict = buildRegisterVerdict(access);

  if (access === 'closed') {
    return (
      <AuthShell
        verdict={verdict}
        verdictAriaLabel="Stato delle registrazioni"
        footer={{ question: 'Hai già un account?', linkLabel: 'Accedi', href: '/login' }}
      >
        <Tile eyebrow="Crea il profilo" ariaLabel="Registrazione" className="p-5 desktop:p-6">
          <AuthStatusLine reading={reading} />
          <Button asChild className="mt-5 h-11 w-full desktop:h-9">
            <Link href="/login">Vai all’accesso</Link>
          </Button>
        </Tile>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      verdict={verdict}
      verdictAriaLabel="Come si crea un profilo"
      footer={{ question: 'Hai già un account?', linkLabel: 'Accedi', href: '/login' }}
    >
      <Tile
        eyebrow="Crea il profilo"
        // The aside declares the access rule the whole tile operates under; with no
        // whitelist there is no rule to name, so nothing is printed.
        aside={access === 'invite-only' ? 'su invito' : undefined}
        ariaLabel="Registrazione"
        className="p-5 desktop:p-6"
      >
        <AuthStatusLine reading={reading} />

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
          <AuthField
            id="displayName"
            label="Nome"
            value={displayName}
            onChange={(value) => {
              setDisplayName(value);
              resetStatus();
            }}
            placeholder="Il tuo nome"
            autoComplete="name"
            disabled={busy}
            trailing={<span className="shrink-0 text-[11px] text-muted-foreground">facoltativo</span>}
          />

          <AuthField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={(value) => {
              setEmail(value);
              resetStatus();
            }}
            placeholder="nome@esempio.com"
            autoComplete="email"
            required
            disabled={busy}
          />

          <AuthField
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(value) => {
              setPassword(value);
              resetStatus();
            }}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            disabled={busy}
            trailing={
              <PasswordReveal
                shown={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                disabled={busy}
                fieldLabel="password"
              />
            }
          />

          <AuthField
            id="confirmPassword"
            label="Conferma password"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              resetStatus();
            }}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            disabled={busy}
            trailing={
              <PasswordReveal
                shown={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
                disabled={busy}
                fieldLabel="conferma password"
              />
            }
          />

          <PasswordRequirements requirements={requirements} />

          <Button type="submit" className="mt-1.5 h-11 w-full desktop:h-9" disabled={busy}>
            {pending === 'form' && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending === 'form' ? 'Creazione in corso' : 'Crea il profilo'}
          </Button>
        </form>

        <AuthDivider />

        <Button
          type="button"
          variant="outline"
          className="mt-4 h-11 w-full desktop:h-9"
          onClick={() => void runAuth('google', signInWithGoogle)}
          disabled={busy}
        >
          {pending === 'google' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
          Registrati con Google
        </Button>
      </Tile>
    </AuthShell>
  );
}
