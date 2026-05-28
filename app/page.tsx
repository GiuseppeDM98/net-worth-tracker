/**
 * Landing Page + Route Guard
 *
 * Authenticated users are redirected immediately to /dashboard.
 * Unauthenticated users see the landing page with:
 *   - "Prova la Demo" → auto-login with shared demo credentials
 *   - "Accedi" → /login
 *
 * Demo credentials are read from NEXT_PUBLIC_DEMO_* env vars baked in at
 * build time. If those vars are missing the demo CTA is hidden, making this
 * safe for self-hosted deployments that don't want a public demo account.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  TrendingUp,
  Flame,
  MessageSquare,
  Wallet,
  Calendar,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
const DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Portfolio Tracking',
    description: 'Tieni traccia di azioni, ETF, obbligazioni, fondi pensione, crypto, immobili e liquidità in un unico posto.',
  },
  {
    icon: TrendingUp,
    title: 'Rendimenti & Storico',
    description: 'Analisi delle performance, drawdown, heatmap mensile e confronto YoY del patrimonio.',
  },
  {
    icon: Flame,
    title: 'FIRE Planning',
    description: 'Proiezioni deterministiche e Monte Carlo, Coast FIRE, goal-based investing e pensione di stato.',
  },
  {
    icon: MessageSquare,
    title: 'Assistente AI',
    description: 'Analisi mensile, annuale e YTD con Claude. Memoria persistente e obiettivi strutturati.',
  },
  {
    icon: Wallet,
    title: 'Cashflow',
    description: 'Tracciamento entrate/uscite, budget, Sankey drill-down e centri di costo.',
  },
  {
    icon: Calendar,
    title: 'Dividendi & Cedole',
    description: 'Calendario dividendi, download automatico da Borsa Italiana e rendimento totale per asset.',
  },
];

export default function HomePage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);

  // Redirect authenticated users straight to the dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleDemoLogin = async () => {
    if (!DEMO_ENABLED) return;
    setDemoLoading(true);
    try {
      await signIn(DEMO_EMAIL, DEMO_PASSWORD);
      // AuthContext will update `user` → the useEffect above will push to /dashboard.
    } catch {
      toast.error('Impossibile accedere alla demo. Riprova più tardi.');
      setDemoLoading(false);
    }
  };

  // While auth is resolving, show a minimal spinner so there's no flash of the
  // landing page for users who are already signed in.
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Caricamento..."
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  // Authenticated users are being redirected; return null to avoid flash.
  if (user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Skip-to-content for keyboard users — visually hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:left-4 focus:top-4 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Vai al contenuto principale
      </a>

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight">Net Worth Tracker</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Accedi</Link>
          </Button>
        </div>
      </header>

      <main id="main-content">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section
          aria-label="Presentazione"
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6"
        >
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Progetto open source per investitori italiani
          </div>

          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Il tuo patrimonio,{' '}
            <span className="text-primary">sotto controllo</span>
          </h1>

          <p className="mb-10 max-w-xl text-base text-muted-foreground sm:text-lg">
            Traccia asset, cashflow, dividendi e performance in un&apos;unica app.
            Pianifica il FIRE, analizza i rendimenti e lascia che l&apos;AI ti aiuti a capire la tua situazione finanziaria.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {DEMO_ENABLED && (
              <Button
                size="lg"
                onClick={handleDemoLogin}
                disabled={demoLoading}
                aria-busy={demoLoading}
                className="w-full sm:w-auto"
              >
                {demoLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Accesso demo...
                  </>
                ) : (
                  <>
                    Prova la Demo
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            )}
            <Button
              variant={DEMO_ENABLED ? 'outline' : 'default'}
              size="lg"
              asChild
              className="w-full sm:w-auto"
            >
              <Link href="/login">Accedi</Link>
            </Button>
          </div>

          {DEMO_ENABLED && (
            <p className="mt-4 text-xs text-muted-foreground">
              La demo è in sola lettura — nessun dato viene modificato.
            </p>
          )}
        </section>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section
          aria-label="Funzionalità"
          className="border-t border-border/60 bg-muted/30 px-4 py-16 sm:px-6"
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-2 text-center text-2xl font-bold tracking-tight">
              Tutto quello che ti serve
            </h2>
            <p className="mb-10 text-center text-sm text-muted-foreground">
              Costruito da un investitore italiano per investitori italiani.
            </p>

            {/*
             * Gap-px grid: the container bg color becomes the grid line.
             * Each cell carries its own bg-background, so the thin gaps
             * between cells produce hairline separators without per-cell
             * borders. overflow-hidden + rounded-xl clips cells to the
             * outer corner radius.
             */}
            <div className="grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40 sm:grid-cols-2 desktop:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4 bg-background p-5 sm:p-6">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Net Worth Tracker — open source su{' '}
        <a
          href="https://github.com/GiuseppeDM98/net-worth-tracker"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Net Worth Tracker su GitHub (apre in una nuova scheda)"
          className="underline underline-offset-2 hover:text-foreground"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
