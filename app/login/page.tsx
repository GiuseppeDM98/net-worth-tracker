'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cardItem, staggerContainer } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';

type LoginField = 'email' | 'password' | null;
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

// Login page component with email/password and Google OAuth authentication.
// Redirects to /dashboard on successful login.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeField, setActiveField] = useState<LoginField>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
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

  const resetSubmitState = () => {
    if (submitState !== 'idle') {
      setSubmitState('idle');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitState('submitting');

    try {
      // Authenticate user with email/password
      await signIn(email, password);
      setSubmitState('success');
      // Show success toast immediately — the useEffect above handles the redirect
      // once AuthContext.user is set (after onAuthStateChanged completes)
      toast.success('Accesso effettuato con successo!');
    } catch (error: any) {
      console.error('Login error:', error);
      setSubmitState('error');
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
    setSubmitState('submitting');
    try {
      await signInWithGoogle();
      setSubmitState('success');
      // Redirect handled by the useEffect above once auth state is confirmed
      toast.success('Accesso effettuato con successo!');
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      setSubmitState('error');
      toast.error(error.message || 'Errore durante l\'accesso con Google');
    } finally {
      setLoading(false);
    }
  };

  // Keep the field shell highlighted while focus moves between the input
  // and the password visibility control inside the same container.
  const handleFieldBlur = (
    event: React.FocusEvent<HTMLDivElement>,
    field: Exclude<LoginField, null>
  ) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    if (activeField === field) {
      setActiveField(null);
    }
  };

  const submitMessage =
    submitState === 'submitting'
      ? 'Sto verificando le credenziali...'
      : submitState === 'success'
        ? 'Accesso riuscito. Reindirizzamento in corso...'
        : submitState === 'error'
          ? 'Controlla i dati inseriti e riprova.'
          : ' ';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top editorial accent — matches the border-b separator used in page headers throughout the app */}
      <div className="h-px w-full bg-border" />

      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          className="w-full max-w-[400px] space-y-8"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardItem} className="space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon/favicon-48x48.png" alt="" className="mx-auto h-10 w-10" aria-hidden="true" />
            <div>
              <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Patrimonio Personale</p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Portfolio Tracker</h1>
            </div>
          </motion.div>

          <motion.div
            variants={cardItem}
            className={cn(
              'space-y-6 rounded-xl border border-border bg-card p-8',
              submitState === 'submitting' && 'border-primary/30 shadow-sm shadow-primary/10'
            )}
          >
            <div className="space-y-1 border-b border-border pb-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Accesso</p>
              <h2 className="text-2xl font-semibold text-foreground">Bentornato.</h2>
              <p className="text-sm text-muted-foreground">Accedi per vedere il tuo patrimonio.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <motion.div variants={cardItem} transition={{ delay: 0.02 }}>
                <div
                  className={cn(
                    'rounded-lg border border-border/80 bg-background/40 px-3 py-3 transition-[border-color,box-shadow,background-color] motion-reduce:transition-none',
                    activeField === 'email'
                      ? 'border-primary/60 bg-background shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]'
                      : 'hover:border-border'
                  )}
                  onFocusCapture={() => setActiveField('email')}
                  onBlurCapture={(event) => handleFieldBlur(event, 'email')}
                >
                  <Label
                    htmlFor="email"
                    className={cn(
                      'text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors motion-reduce:transition-none',
                      activeField === 'email' && 'text-foreground'
                    )}
                  >
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@esempio.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      resetSubmitState();
                    }}
                    required
                    disabled={loading}
                    className="mt-2 h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </motion.div>

              <motion.div variants={cardItem} transition={{ delay: 0.04 }}>
                <div
                  className={cn(
                    'rounded-lg border border-border/80 bg-background/40 px-3 py-3 transition-[border-color,box-shadow,background-color] motion-reduce:transition-none',
                    activeField === 'password'
                      ? 'border-primary/60 bg-background shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]'
                      : 'hover:border-border'
                  )}
                  onFocusCapture={() => setActiveField('password')}
                  onBlurCapture={(event) => handleFieldBlur(event, 'password')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="password"
                      className={cn(
                        'text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors motion-reduce:transition-none',
                        activeField === 'password' && 'text-foreground'
                      )}
                    >
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
                      disabled={loading}
                      aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                      aria-pressed={showPassword}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={showPassword ? 'visible' : 'hidden'}
                          initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
                          animate={{ opacity: 1, rotate: 0, scale: 1 }}
                          exit={{ opacity: 0, rotate: 20, scale: 0.8 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                          className="flex items-center justify-center"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </motion.span>
                      </AnimatePresence>
                    </button>
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      resetSubmitState();
                    }}
                    required
                    disabled={loading}
                    className="mt-2 h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </motion.div>

              <motion.div variants={cardItem} transition={{ delay: 0.06 }} className="space-y-2">
                <Button
                  type="submit"
                  className="w-full motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 motion-reduce:active:scale-100"
                  disabled={loading}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={submitState === 'submitting' ? 'submitting' : submitState === 'success' ? 'success' : 'idle'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      className="flex items-center justify-center gap-2"
                    >
                      {submitState === 'submitting' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Accesso in corso...
                        </>
                      ) : submitState === 'success' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Accesso riuscito
                        </>
                      ) : (
                        <>
                          <ArrowRight className="h-4 w-4" />
                          Accedi
                        </>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </Button>

                <div aria-live="polite" className="min-h-5 text-center text-xs text-muted-foreground">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={submitState}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                    >
                      {submitMessage}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>
            </form>

            <motion.div variants={cardItem} transition={{ delay: 0.08 }} className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 tracking-widest text-muted-foreground">Oppure</span>
              </div>
            </motion.div>

            <motion.div variants={cardItem} transition={{ delay: 0.1 }}>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 motion-reduce:active:scale-100"
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
            </motion.div>
          </motion.div>

          <motion.p variants={cardItem} className="text-center text-sm text-muted-foreground">
            Prima volta?{' '}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/70"
            >
              Crea il tuo profilo
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
