/**
 * Landing Page + Route Guard
 *
 * Authenticated users are redirected immediately to /dashboard.
 * Unauthenticated users see the landing page with:
 *   - "Prova la Demo" → auto-login with shared demo credentials
 *   - "Accedi" → /login
 *
 * The hero is a faithful Panoramica preview: the product's own data-first
 * language (dominant net-worth number in Geist Mono, variation chip, hero
 * sparkline) IS the brand impression. The preview is illustrative — labelled
 * "Dati dimostrativi" so the surface never fakes a real account (DESIGN.md:
 * honesty over illusion).
 *
 * Demo credentials are read from NEXT_PUBLIC_DEMO_* env vars baked in at
 * build time. If those vars are missing the demo CTA is hidden, making this
 * safe for self-hosted deployments that don't want a public demo account.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { SavingsRingChart } from '@/components/dashboard/SavingsRingChart';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
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
} from 'lucide-react';
import { toast } from 'sonner';

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
const DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Portfolio Tracking',
    description: 'Azioni, ETF, obbligazioni, crypto, immobili e liquidità in un unico posto.',
  },
  {
    icon: TrendingUp,
    title: 'Rendimenti & Storico',
    description: 'Performance, drawdown, heatmap mensile e confronto YoY del patrimonio.',
  },
  {
    icon: Flame,
    title: 'FIRE Planning',
    description: 'Proiezioni deterministiche e Monte Carlo, Coast FIRE e goal-based investing.',
  },
  {
    icon: MessageSquare,
    title: 'Assistente AI',
    description: 'Analisi mensile, annuale e YTD con Claude, memoria persistente e obiettivi.',
  },
  {
    icon: Wallet,
    title: 'Cashflow',
    description: 'Entrate e uscite, budget, Sankey drill-down e centri di costo.',
  },
  {
    icon: Calendar,
    title: 'Dividendi & Cedole',
    description: 'Calendario, download da Borsa Italiana e rendimento totale per asset.',
  },
];

/**
 * Illustrative Panoramica data for the hero preview. Not a real account —
 * the preview carries a "Dati dimostrativi" caption so the surface stays honest.
 */
const PREVIEW_NET_WORTH = 487_250;
const PREVIEW_DELTA_ABS = 12_480;
const PREVIEW_DELTA_PCT = 2.63;
const PREVIEW_SPARKLINE = [
  398_000, 402_500, 397_800, 411_200, 419_000, 415_600, 428_900, 441_300,
  438_700, 455_100, 471_800, 487_250,
].map((totalNetWorth, i) => ({ month: (i % 12) + 1, year: 2025, totalNetWorth }));

const PREVIEW_ROWS: { label: string; mono: string }[] = [
  { label: 'Liquidità', mono: cachedFormatCurrencyEUR(64_900) },
  { label: 'Investito', mono: cachedFormatCurrencyEUR(422_350) },
];

/**
 * Illustrative Cashflow data for the second preview card — demonstrates a
 * second real module (savings rate ring) rather than another text bullet.
 */
const PREVIEW_SAVINGS_RATE = 38;
const PREVIEW_CASHFLOW_ROWS: { label: string; mono: string }[] = [
  { label: 'Entrate', mono: cachedFormatCurrencyEUR(4_200) },
  { label: 'Spese', mono: cachedFormatCurrencyEUR(2_604) },
];

/**
 * Proof strip — structural facts about the product, set in the system's own
 * Dominant Value language (Geist Mono value + eyebrow label). Not fabricated
 * financial figures: these describe the tool itself, so the surface stays honest.
 */
const PROOF_STATS: { value: string; label: string }[] = [
  { value: '6', label: 'classi di asset' },
  { value: '6', label: 'temi' },
  { value: '100%', label: 'open source' },
  { value: 'AI', label: 'assistente Claude' },
];

/**
 * Count-up that lands on the target value (counts from a slightly lower start,
 * never from zero — DESIGN.md "numbers land"). rAF-driven, ease-out-quart.
 * Honours prefers-reduced-motion by rendering the final value immediately.
 */
function CountUpCurrency({ value, durationMs = 1100 }: { value: number; durationMs?: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => Math.round(value * 0.94));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Reduced motion: render the final value directly (see return) — no
    // synchronous setState in the effect body.
    if (reduce) return;
    const from = Math.round(value * 0.94);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 4); // ease-out-quart
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs, reduce]);

  return <>{cachedFormatCurrencyEUR(reduce ? value : display)}</>;
}

export default function HomePage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const reduce = useReducedMotion();
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

  // Entrance motion: a single orchestrated page-load reveal. Reduced motion
  // collapses every variant to an instant, fully-visible state.
  const ease = [0.16, 1, 0.3, 1] as const;
  const reveal = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease, delay },
        };

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
            <ShieldCheck className="h-5 w-5 text-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight">Net Worth Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme toggle reuses the in-app ThemePicker: the circle-reveal
                view-transition (themeTransition.ts) showcases that light and
                dark are equally premium (DESIGN §1). next-themes already wraps
                the app from the root layout, so no extra wiring is needed. */}
            <ThemePicker />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Accedi</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section
          aria-label="Presentazione"
          className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 desktop:py-24"
        >
          {/* Asymmetric split: pitch on the left, the product's own data hero on
              the right. On mobile the preview stacks below the copy. */}
          <div className="grid items-center gap-10 desktop:grid-cols-[1.05fr_0.95fr] desktop:gap-14">
            {/* ── Left: pitch ── */}
            <div className="max-w-xl">
              <motion.p
                {...reveal(0)}
                className="mb-5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              >
                Open source · per investitori italiani
              </motion.p>

              <motion.h1
                {...reveal(0.08)}
                className="text-balance text-[34px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[40px] desktop:text-[46px]"
              >
                Il tuo patrimonio, sotto controllo
              </motion.h1>

              <motion.p
                {...reveal(0.16)}
                className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
              >
                Traccia asset, cashflow, dividendi e performance in un&apos;unica app.
                Pianifica il FIRE, analizza i rendimenti e lascia che l&apos;AI ti aiuti a
                capire la tua situazione finanziaria.
              </motion.p>

              <motion.div
                {...reveal(0.24)}
                className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              >
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
              </motion.div>

              {DEMO_ENABLED && (
                <motion.p {...reveal(0.32)} className="mt-4 text-xs text-muted-foreground">
                  La demo è in sola lettura — nessun dato viene modificato.
                </motion.p>
              )}
            </div>

            {/* ── Right: stacked previews (the product speaking its own language) ── */}
            <div className="space-y-4">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? undefined : { duration: 0.7, ease, delay: 0.2 }}
              aria-label="Anteprima della Panoramica con dati dimostrativi"
              className="rounded-2xl border border-border bg-card p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Patrimonio Netto
              </p>
              <p className="mt-1.5 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums desktop:text-[54px]">
                <CountUpCurrency value={PREVIEW_NET_WORTH} />
              </p>

              {/* Variation chip — the one place data is allowed to own colour. */}
              <div className="mt-3 inline-flex items-center gap-2 rounded-[9px] bg-positive/10 px-[13px] py-[6px] font-mono text-[15px] font-semibold tracking-[-0.01em] text-positive">
                <TrendingUp className="h-[13px] w-[13px]" aria-hidden="true" />
                +{cachedFormatCurrencyEUR(PREVIEW_DELTA_ABS)} (+{PREVIEW_DELTA_PCT.toLocaleString('it-IT', { minimumFractionDigits: 2 })}%)
                <span className="text-muted-foreground">questo mese</span>
              </div>

              {/* Edge-to-edge hero sparkline — -mx matches the card padding (22px). */}
              <div className="-mx-[22px] mt-5" style={{ height: 68 }}>
                <NetWorthSparkline
                  data={PREVIEW_SPARKLINE}
                  filled
                  color="var(--chart-1)"
                  height={68}
                />
              </div>
              <div className="mt-1 flex justify-between px-px font-mono text-[10px] text-muted-foreground">
                <span>{cachedFormatCurrencyEUR(PREVIEW_SPARKLINE[0].totalNetWorth, true)}</span>
                <span>{cachedFormatCurrencyEUR(PREVIEW_NET_WORTH, true)}</span>
              </div>

              {/* Flat divide-y breakdown — Trade Republic chrome reduction. */}
              <div className="mt-5 divide-y divide-border border-t border-border">
                {PREVIEW_ROWS.map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-[13px] tabular-nums">{row.mono}</span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                Dati dimostrativi
              </p>
            </motion.div>

            {/* Second preview: a real Cashflow module (savings-rate ring) — proves
                breadth with an actual system component instead of another bullet. */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? undefined : { duration: 0.7, ease, delay: 0.3 }}
              aria-label="Anteprima del Cashflow con dati dimostrativi"
              className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Cashflow · Tasso di Risparmio
              </p>
              <div className="mt-3 flex items-center gap-5">
                <SavingsRingChart rate={PREVIEW_SAVINGS_RATE} size={88} />
                <div className="min-w-0 flex-1 divide-y divide-border">
                  {PREVIEW_CASHFLOW_ROWS.map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-2.5">
                      <span className="text-[13px] text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-[13px] tabular-nums">{row.mono}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
            </div>
          </div>
        </section>

        {/* ── Proof strip ───────────────────────────────────────────────── */}
        {/* Structural facts in the system's Dominant Value language (mono value +
            eyebrow label). border-t/40 is the lighter "chapter" separator. */}
        <section
          aria-label="In sintesi"
          className="border-t border-border/40 px-4 py-12 sm:px-6"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border desktop:grid-cols-4">
            {PROOF_STATS.map(({ value, label }) => (
              <div key={label} className="bg-card px-5 py-6 text-center">
                <p className="font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                  {value}
                </p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section
          aria-label="Funzionalità"
          className="border-t border-border/60 px-4 py-16 sm:px-6 desktop:py-20"
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="text-[26px] font-bold tracking-[-0.02em] desktop:text-[32px]">
              Tutto quello che ti serve
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Costruito da un investitore italiano per investitori italiani.
            </p>

            {/*
             * Flat divide-y feature list (not a card grid). Two columns on
             * desktop, each an independent divide-y stack — the hairline is the
             * only separator, no per-item box. Icons are achromatic: in the
             * default theme colour is owned by data, never by chrome.
             */}
            <div className="mt-10 grid gap-x-12 desktop:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex gap-4 border-b border-border/60 py-5 last:border-b-0 desktop:[&:nth-last-child(2)]:border-b-0"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {description}
                    </p>
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
