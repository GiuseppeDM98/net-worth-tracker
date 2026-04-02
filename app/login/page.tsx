'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

// Login page component with email/password and Google OAuth authentication.
// Redirects to /dashboard on successful login.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Authenticate user with email/password
      await signIn(email, password);
      // Show success toast immediately — the useEffect above handles the redirect
      // once AuthContext.user is set (after onAuthStateChanged completes)
      toast.success('Accesso effettuato con successo!');
    } catch (error: any) {
      console.error('Login error:', error);
      // Show user-friendly error message. Firebase errors are already localized.
      toast.error(error.message || 'Errore durante l\'accesso');
    } finally {
      setLoading(false);
    }
  };

  // Handle Google OAuth authentication flow.
  // Uses Firebase signInWithPopup for web-based OAuth.
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      // Redirect handled by the useEffect above once auth state is confirmed
      toast.success('Accesso effettuato con successo!');
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast.error(error.message || 'Errore durante l\'accesso con Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top editorial accent — matches the border-b separator used in page headers throughout the app */}
      <div className="h-px w-full bg-border" />

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[400px] space-y-8">

          {/* Branding */}
          <div className="space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon/favicon-48x48.png" alt="" className="w-10 h-10 mx-auto" aria-hidden="true" />
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Patrimonio Personale</p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Portfolio Tracker</h1>
            </div>
          </div>

          {/* Form panel — intentional editorial container, not a generic auth card */}
          <div className="border border-border rounded-xl bg-card p-8 space-y-6">

            {/* Form header with eyebrow label — mirrors the page header pattern used in the dashboard */}
            <div className="space-y-1 pb-5 border-b border-border">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Accesso</p>
              <h2 className="text-2xl font-semibold text-foreground">Bentornato.</h2>
              <p className="text-sm text-muted-foreground">Accedi per vedere il tuo patrimonio.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nome@esempio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pr-10"
                  />
                  {/* tabIndex={-1} avoids interrupting the form tab flow */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Accesso in corso...' : 'Accedi'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground tracking-widest">Oppure</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              {/* Inline Google "G" SVG — no external dependency needed */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Accedi con Google
            </Button>
          </div>

          {/* Cross-link — outside the panel, quieter than the CTA */}
          <p className="text-center text-sm text-muted-foreground">
            Prima volta?{' '}
            <Link
              href="/register"
              className="text-foreground underline underline-offset-4 hover:text-foreground/70 font-medium transition-colors"
            >
              Crea il tuo profilo
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
