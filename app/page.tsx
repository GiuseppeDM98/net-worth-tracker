/**
 * LANDING PUBBLICA — the Panoramica told to someone who has no data yet (2026-08-31).
 *
 * The page takes the shape every redesigned page takes (DESIGN.md → §5 Page Verdict, Tile,
 * Tile Grid): compact header, a verdict, then a 12-column grid of tiles. What is different is
 * WHAT the verdict answers — this surface measures nothing about the reader, so the sentence is
 * the product's promise, generated from the page's state exactly as the two authentication
 * pages generate theirs (`lib/utils/landingNarrative.ts`).
 *
 * The grid renders the app's OWN tiles — the same `PatrimonioTile`, `CashflowTile`,
 * `ComposizioneTile` and `ObiettivoTile` the Panoramica renders — on an invented profile
 * (`lib/utils/landingSampleData.ts`), because a picture of the product ages the moment the
 * product changes. The three tiles after them show no figures at all: they name what a section
 * computes, with every fact read from the module that owns it.
 *
 *   Mobile (1 col):  Verdetto → azioni → dichiarazione → Patrimonio → Cashflow → Composizione
 *                    → Obiettivi → Rendimenti → FIRE → Previdenza
 *   Desktop (12 col): Patrimonio(5, 2 righe) | Cashflow(4) | Composizione(3)
 *                                            | Obiettivi(7)
 *                     Rendimenti(4) | FIRE(4) | Previdenza(4)
 *
 * Authenticated visitors never see any of it: they are redirected to /dashboard.
 *
 * Demo credentials are read from NEXT_PUBLIC_DEMO_* baked in at build time. Without them the
 * demo CTA is not rendered AND the verdict drops its clause about it — a self-hosted
 * deployment must not be told about a button that is not on its page.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MotionConfig, motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { PatrimonioTile, resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { CashflowTile } from '@/components/dashboard/overview/CashflowTile';
import { ComposizioneTile } from '@/components/dashboard/overview/ComposizioneTile';
import { ObiettivoTile } from '@/components/dashboard/overview/ObiettivoTile';
import { LandingPromiseTile } from '@/components/landing/LandingPromiseTile';
import type { SparklinePeriod } from '@/components/dashboard/PeriodSelector';

import { APP_CONFIG } from '@/lib/constants/appConfig';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { cardItem, staggerContainer } from '@/lib/utils/motionVariants';
import { resolveRegistrationAccess } from '@/lib/utils/authNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import {
  SAMPLE_PROFILE_EYEBROW,
  buildLandingPromises,
  buildLandingVerdict,
  describeDemoAccess,
  describeProjectFacts,
  describeRegistrationInvite,
  describeSampleProfile,
} from '@/lib/utils/landingNarrative';
import {
  SAMPLE_ASSET_CLASSES,
  SAMPLE_ASSET_COUNT,
  SAMPLE_COVERAGE_RATIO,
  SAMPLE_DAYS_IN_MONTH,
  SAMPLE_DAY_OF_MONTH,
  SAMPLE_EXPENSE_STATS,
  SAMPLE_GOALS,
  SAMPLE_MARKET_MOVERS,
  SAMPLE_MONTH,
  SAMPLE_SAVINGS_RATE,
  SAMPLE_SPARKLINE,
  SAMPLE_TOTAL_VALUE,
  SAMPLE_VARIATIONS,
} from '@/lib/utils/landingSampleData';
import { cn } from '@/lib/utils';

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';
const DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

const REGISTRATION_ACCESS = resolveRegistrationAccess(
  APP_CONFIG.REGISTRATIONS_ENABLED,
  APP_CONFIG.REGISTRATION_WHITELIST_ENABLED,
);

export default function HomePage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const chartColors = useChartColors();
  const [demoLoading, setDemoLoading] = useState(false);
  const [sparklinePeriod, setSparklinePeriod] = useState<SparklinePeriod>('1A');

  // Redirect authenticated users straight to the dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const verdict = useMemo(() => buildLandingVerdict(DEMO_ENABLED), []);
  const demoNote = useMemo(() => describeDemoAccess(DEMO_ENABLED), []);
  const invite = useMemo(() => describeRegistrationInvite(REGISTRATION_ACCESS), []);
  // The deduction ceiling the Previdenza promise prints depends on the fiscal year in force.
  const promises = useMemo(() => buildLandingPromises(getItalyYear()), []);

  // The same remap the Panoramica does, so a class wears the same hue on both surfaces.
  const assetClassData = useMemo(
    () =>
      SAMPLE_ASSET_CLASSES.map((entry) => ({
        ...entry,
        color: chartColors[ASSET_CLASS_CHART_INDEX[entry.assetClass ?? ''] ?? 0] ?? entry.color,
      })),
    [chartColors],
  );

  const sparklineDisplay = useMemo(
    () => filterSparklineByPeriod(SAMPLE_SPARKLINE, sparklinePeriod),
    [sparklinePeriod],
  );

  const handleDemoLogin = async () => {
    if (!DEMO_ENABLED) return;
    setDemoLoading(true);
    try {
      await signIn(DEMO_EMAIL, DEMO_PASSWORD);
      // AuthContext updates `user` → the effect above pushes to /dashboard.
    } catch {
      toast.error('Impossibile accedere alla demo. Riprova più tardi.');
      setDemoLoading(false);
    }
  };

  // While auth resolves, a minimal spinner: no flash of the landing for a signed-in visitor.
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

  // Authenticated visitors are being redirected; render nothing rather than a flash.
  if (user) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
        >
          Vai al contenuto principale
        </a>

        {/* The hairline the app's page headers use as their separator — the only chrome above
            the verdict, as on the two authentication pages. */}
        <div className="h-px w-full bg-border" />

        <main id="main-content" className="flex-1 px-4 pb-10 pt-1 desktop:px-5 desktop:pb-14">
          {/* The bottom padding of the dashboard container exists for the phone's nav pill,
              which this page does not have. */}
          <PageContainer width="wide" className="max-desktop:portrait:pb-0">
            <PageHeader
              label="Portfolio Tracker"
              title="Panoramica"
              description="dati d’esempio"
              separator={false}
              actions={
                <div className="flex items-center gap-2">
                  <ThemePicker />
                  <Button variant="outline" className="h-9" asChild>
                    <Link href="/login">Accedi</Link>
                  </Button>
                </div>
              }
            />

            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
              <motion.div variants={cardItem} className="flex flex-col gap-5 pt-1">
                <PageVerdict verdict={verdict} ariaLabel="Cos’è Portfolio Tracker" />

                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center">
                    {DEMO_ENABLED && (
                      <Button
                        size="lg"
                        onClick={handleDemoLogin}
                        disabled={demoLoading}
                        aria-busy={demoLoading}
                        // 44px on a phone, the app's `lg` height from tablet up: these two are
                        // the page's only actions, and a thumb is what presses them.
                        className="h-11 w-full tablet:h-10 tablet:w-auto"
                      >
                        {demoLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            Accesso demo...
                          </>
                        ) : (
                          <>
                            Prova la demo
                            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant={DEMO_ENABLED ? 'outline' : 'default'}
                      size="lg"
                      asChild
                      className="h-11 w-full tablet:h-10 tablet:w-auto"
                    >
                      <Link href="/login">Accedi</Link>
                    </Button>
                  </div>

                  {(demoNote || invite) && (
                    <p className="text-[13px] leading-[1.45] text-muted-foreground">
                      {demoNote && <span>{narrativeToText(demoNote)} </span>}
                      {invite && (
                        <>
                          {invite.question}{' '}
                          <Link
                            href="/register"
                            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/70 motion-reduce:transition-none"
                          >
                            {invite.linkLabel}
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </motion.div>

              {/* The sample profile is declared ONCE, in the eyebrow's voice, at the head of the
                  region it governs — a caption under one number would read as a footnote to
                  that number alone. */}
              <motion.div
                variants={cardItem}
                className="flex flex-col gap-1.5 border-t border-border/40 pt-3"
              >
                <p className={TILE_EYEBROW_CLASS}>{SAMPLE_PROFILE_EYEBROW}</p>
                <NarrativeText
                  segments={describeSampleProfile()}
                  className="max-w-[920px] text-[13px] leading-[1.45] text-muted-foreground"
                />
              </motion.div>

              <motion.section
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                aria-label="Panoramica su un profilo d’esempio"
                className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12"
              >
                <motion.div
                  variants={cardItem}
                  className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5 desktop:row-span-2')}
                >
                  <PatrimonioTile
                    totalValue={SAMPLE_TOTAL_VALUE}
                    heroValueClass={resolveHeroValueClass(SAMPLE_TOTAL_VALUE)}
                    variations={SAMPLE_VARIATIONS}
                    isNewATH
                    sparklinePeriod={sparklinePeriod}
                    onSparklinePeriodChange={setSparklinePeriod}
                    sparklineDisplay={sparklineDisplay}
                    movers={SAMPLE_MARKET_MOVERS}
                    countLine={`${SAMPLE_ASSET_COUNT} asset · profilo d’esempio`}
                  />
                </motion.div>

                <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                  <CashflowTile
                    expenseStats={SAMPLE_EXPENSE_STATS}
                    month={SAMPLE_MONTH}
                    dayOfMonth={SAMPLE_DAY_OF_MONTH}
                    daysInMonth={SAMPLE_DAYS_IN_MONTH}
                    savingsRate={SAMPLE_SAVINGS_RATE}
                    coverageRatio={SAMPLE_COVERAGE_RATIO}
                  />
                </motion.div>

                <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'desktop:col-span-3')}>
                  <ComposizioneTile data={assetClassData} />
                </motion.div>

                <motion.div
                  variants={cardItem}
                  className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-7')}
                >
                  <ObiettivoTile goals={SAMPLE_GOALS} />
                </motion.div>

                {promises.map((promise) => (
                  <motion.div
                    key={promise.key}
                    variants={cardItem}
                    className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}
                  >
                    <LandingPromiseTile promise={promise} />
                  </motion.div>
                ))}
              </motion.section>
            </motion.div>
          </PageContainer>
        </main>

        <footer className="border-t border-border px-4 py-4 desktop:px-5">
          <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-1 text-[11px] text-muted-foreground tablet:flex-row tablet:items-center tablet:justify-between">
            <span>
              Portfolio Tracker — open source su{' '}
              <a
                href="https://github.com/GiuseppeDM98/net-worth-tracker"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Portfolio Tracker su GitHub (apre in una nuova scheda)"
                className="underline underline-offset-2 hover:text-foreground"
              >
                GitHub
              </a>
            </span>
            <NarrativeText
              segments={describeProjectFacts()}
              className="text-[11px] text-muted-foreground"
              figureClassName="font-semibold"
            />
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
