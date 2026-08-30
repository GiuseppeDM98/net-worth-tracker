'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthDivider, AuthShell } from '@/components/auth/AuthShell';
import { AuthField, PasswordReveal } from '@/components/auth/AuthField';
import { AuthStatusLine } from '@/components/auth/AuthStatusLine';
import { GoogleMark } from '@/components/auth/GoogleMark';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import {
  buildLoginVerdict,
  describeAuthError,
  describeLoginStatus,
  type AuthStatus,
} from '@/lib/utils/authNarrative';

/**
 * The demo credentials are the only thing that decides whether this page offers a demo:
 * without BOTH variables the button does not exist, exactly as before the redesign.
 */
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
const DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

/** Which of the three ways in is running, so the other two freeze while it does. */
type PendingSource = 'form' | 'google' | 'demo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<AuthStatus>({ phase: 'idle' });
  const [pending, setPending] = useState<PendingSource | null>(null);
  const { signIn, signInWithGoogle, user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect to dashboard once AuthContext confirms the user is fully loaded.
  // Why not router.push() immediately after signIn()? signInWithEmailAndPassword
  // resolves before onAuthStateChanged finishes its async Firestore lookup for
  // displayName. During that gap AuthContext.user is still null, so ProtectedRoute
  // would redirect back to /login. Watching authLoading + user ensures we only
  // navigate after the full auth state is ready.
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  /**
   * Runs one way in and turns its outcome into the tile's reading.
   *
   * On success `pending` is deliberately NOT cleared: the redirect above is still a beat
   * away, and an unfrozen form during that beat invites a second submit that races it.
   */
  const runAuth = async (source: PendingSource, action: () => Promise<void>) => {
    setPending(source);
    setStatus({ phase: 'submitting' });

    try {
      await action();
      setStatus({ phase: 'success' });
    } catch (error) {
      console.error('[login] sign-in failed', error);
      setStatus({ phase: 'error', message: describeAuthError(error) });
      setPending(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runAuth('form', () => signIn(email, password));
  };

  /** Typing after a failure clears the verdict of the previous attempt, not the fields. */
  const resetStatus = () => {
    if (status.phase !== 'idle') {
      setStatus({ phase: 'idle' });
    }
  };

  const busy = pending !== null;
  const reading = describeLoginStatus(status);

  return (
    <AuthShell
      verdict={buildLoginVerdict()}
      verdictAriaLabel="Che cos’è Portfolio Tracker"
      footer={{ question: 'Non hai un account?', linkLabel: 'Registrati', href: '/register' }}
    >
      <Tile eyebrow="Accesso" ariaLabel="Accedi al tuo profilo" className="p-5 desktop:p-6">
        <AuthStatusLine reading={reading} />

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
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
            autoComplete="current-password"
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

          <Button type="submit" className="mt-1.5 h-11 w-full desktop:h-9" disabled={busy}>
            {pending === 'form' && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending === 'form' ? 'Accesso in corso' : 'Accedi'}
          </Button>
        </form>

        <AuthDivider />

        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full desktop:h-9"
            onClick={() => void runAuth('google', signInWithGoogle)}
            disabled={busy}
          >
            {pending === 'google' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
            Accedi con Google
          </Button>

          {DEMO_ENABLED && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full desktop:h-9"
              onClick={() => void runAuth('demo', () => signIn(DEMO_EMAIL, DEMO_PASSWORD))}
              disabled={busy}
            >
              {pending === 'demo' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <FlaskConical aria-hidden="true" />
              )}
              Prova la demo
            </Button>
          )}
        </div>
      </Tile>
    </AuthShell>
  );
}
