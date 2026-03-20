'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
// WARNING: Registration behavior depends on APP_CONFIG flags.
// If you modify these flags, also verify:
// - Server-side whitelist validation in auth middleware
// - Email validation logic in signUp()
import { APP_CONFIG } from '@/lib/constants/appConfig';

// Registration page component with email/password and Google OAuth authentication.
// Supports three modes based on APP_CONFIG:
// 1. Open registration (REGISTRATIONS_ENABLED=true)
// 2. Whitelist-only registration (REGISTRATION_WHITELIST_ENABLED=true)
// 3. Closed registration (both flags=false) - shows "disabled" UI
export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  // Registration access control logic:
  // - If BOTH flags are disabled -> show "disabled" UI
  // - If WHITELIST is enabled -> allow only whitelisted emails (validated server-side)
  // - If REGISTRATIONS is enabled -> allow all emails
  const areRegistrationsDisabled = !APP_CONFIG.REGISTRATIONS_ENABLED && !APP_CONFIG.REGISTRATION_WHITELIST_ENABLED;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password match
    if (password !== confirmPassword) {
      toast.error('Le password non coincidono');
      return;
    }

    // Validate password length (Firebase requirement: minimum 6 characters)
    if (password.length < 6) {
      toast.error('La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);

    try {
      // Create user account
      await signUp(email, password, displayName);
      toast.success('Registrazione completata con successo!');

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Registration error:', error);
      // Show user-friendly error message. Firebase errors are already localized.
      toast.error(error.message || 'Errore durante la registrazione');
    } finally {
      setLoading(false);
    }
  };

  // Handle Google OAuth registration flow.
  // Uses same signInWithGoogle() method as login - Firebase handles account creation automatically.
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Registrazione completata con successo!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast.error(error.message || 'Errore durante la registrazione con Google');
    } finally {
      setLoading(false);
    }
  };

  const branding = (
    <div className="text-center space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon/favicon-48x48.png" alt="Portfolio Tracker" className="w-12 h-12 mx-auto" />
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Portfolio Tracker</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">Gestisci il tuo patrimonio</p>
    </div>
  );

  // If registrations are completely disabled, show a different UI
  if (areRegistrationsDisabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="w-full max-w-md space-y-6">
          {branding}
          <Card className="w-full border-gray-200 dark:border-gray-800 dark:bg-gray-900 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">Registrazione Disabilitata</CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400">
                Le registrazioni sono attualmente chiuse.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Se hai già un account, puoi accedere usando le tue credenziali.
              </p>
              <Link href="/login">
                <Button className="w-full">
                  Vai alla pagina di accesso
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {branding}
      <Card className="w-full border-gray-200 dark:border-gray-800 dark:bg-gray-900 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">Registrati</CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Crea un nuovo account per iniziare a tracciare il tuo portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {APP_CONFIG.REGISTRATION_WHITELIST_ENABLED && (
            <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Nota:</strong> Le registrazioni sono limitate a email autorizzate.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Nome</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Il tuo nome"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pr-10"
                />
                {/* tabIndex={-1} avoids interrupting the form tab flow */}
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Nascondi password' : 'Mostra password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Registrazione in corso...' : 'Registrati'}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Oppure</span>
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
            Registrati con Google
          </Button>

          <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            Hai già un account?{' '}
            <Link href="/login" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
              Accedi
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
