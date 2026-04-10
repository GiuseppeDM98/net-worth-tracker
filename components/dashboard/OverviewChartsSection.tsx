'use client';

import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart as PieChartComponent } from '@/components/ui/pie-chart';
import { chartReveal, slideDown, springLayoutTransition } from '@/lib/utils/motionVariants';
import { PieChartData } from '@/types/assets';

interface ChartSection {
  id: string;
  title: string;
  data: PieChartData[];
}

interface OverviewChartsSectionProps {
  /** Pre-computed chart datasets — passed as stable memoized props from the page. */
  sections: readonly ChartSection[];
  /**
   * When true, the hero KPI count-up has completed and it is safe to schedule
   * the chart subtree mount. Until this is true, desktop charts show the
   * "Preparazione grafico..." placeholder.
   *
   * On mobile, charts start collapsed regardless of this flag — users expand
   * individually to avoid mounting 3 heavy SVGs at once during animation.
   */
  heroSettled: boolean;
  /** True when viewport is narrower than the desktop breakpoint (1440px). */
  isMobile: boolean;
  /** Mirrors useReducedMotion() from the parent so motion skips are consistent. */
  prefersReducedMotion: boolean;
}

/**
 * Memoized charts section for the Overview page.
 *
 * ISOLATION CONTRACT:
 * This component must not re-render while the hero KPI count-up is running.
 * React.memo ensures that — the parent (DashboardPage) passes only stable,
 * already-computed props. Count-up state lives in OverviewAnimatedCurrency
 * leaf nodes and never reaches this component's props during animation.
 *
 * MOUNT SCHEDULING:
 * On desktop, chartRenderReady starts false and becomes true only after heroSettled
 * transitions to true. The scheduling uses requestIdleCallback (when available) so
 * the browser processes the hero settle paint first, then mounts the chart SVGs
 * during an idle window. setTimeout(0) is the fallback for browsers without rIC.
 *
 * On mobile and reduced-motion, charts mount immediately (collapsed) because
 * there is no competing animation that needs CPU budget protection.
 *
 * CHART ANIMATION:
 * Each chart tracks whether it has been rendered before via revealedCharts.
 * animateOnMount is true only on the first render of each chart to avoid
 * replaying Recharts entrance animations on data refreshes.
 */
const OverviewChartsSectionInner = ({
  sections,
  heroSettled,
  isMobile,
  prefersReducedMotion,
}: OverviewChartsSectionProps) => {
  // On mobile, all charts start collapsed to avoid mounting 3 heavy SVGs while
  // count-up animations are running. Desktop starts expanded once chartRenderReady.
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(
    () => isMobile ? new Set() : new Set(sections.map(s => s.id))
  );

  // Tracks which charts have completed their first render so we can disable
  // the entrance animation on subsequent data refreshes.
  const [revealedCharts, setRevealedCharts] = useState<Set<string>>(new Set());

  // Controls whether chart SVGs are actually mounted. On desktop we delay this
  // until the hero has settled and a browser idle window is available.
  const [chartRenderReady, setChartRenderReady] = useState(
    () => prefersReducedMotion || isMobile
  );

  const toggleChart = (id: string) => {
    setExpandedCharts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Schedule chart mount after hero settles.
  // requestIdleCallback gives the browser a chance to paint the settled hero
  // before allocating CPU to the SVG layout pass. setTimeout(0) is the fallback
  // for browsers without rIC support (Safari < 16.4 on older iOS).
  useEffect(() => {
    if (!heroSettled || chartRenderReady) return;
    if (prefersReducedMotion || isMobile) {
      setChartRenderReady(true);
      return;
    }

    let handle: number | ReturnType<typeof setTimeout> | undefined;

    if (typeof window.requestIdleCallback === 'function') {
      handle = window.requestIdleCallback(() => setChartRenderReady(true), { timeout: 800 });
    } else {
      // Fallback: yield one task boundary so the settled-hero paint can complete.
      handle = setTimeout(() => setChartRenderReady(true), 0);
    }

    return () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
    };
  }, [heroSettled, chartRenderReady, prefersReducedMotion, isMobile]);

  return (
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="border-t border-border/40 pt-6 space-y-4"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Composizione
      </p>
      <div className="space-y-6">
        {sections.map((section) => (
          <motion.div
            key={section.id}
            layout="position"
            transition={springLayoutTransition}
          >
            <Card>
              <CardHeader
                className="max-desktop:cursor-pointer"
                onClick={() => toggleChart(section.id)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle>{section.title}</CardTitle>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform desktop:hidden ${
                      expandedCharts.has(section.id) ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </CardHeader>
              <AnimatePresence initial={false}>
                {expandedCharts.has(section.id) && (
                  <motion.div
                    key={`${section.id}-content`}
                    layout
                    transition={springLayoutTransition}
                    variants={slideDown}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <motion.div
                      variants={chartReveal}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <CardContent>
                        {!chartRenderReady && !isMobile ? (
                          // Placeholder shown while waiting for heroSettled + idle window.
                          // Height matches the chart so the card shell doesn't reflow on mount.
                          <div className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Preparazione grafico...
                          </div>
                        ) : (
                          <PieChartComponent
                            data={section.data}
                            animateOnMount={!revealedCharts.has(section.id)}
                            onFirstRender={() => {
                              setRevealedCharts((previous) => {
                                if (previous.has(section.id)) return previous;
                                const next = new Set(previous);
                                next.add(section.id);
                                return next;
                              });
                            }}
                          />
                        )}
                      </CardContent>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

// memo wrapping is the key isolation boundary: as long as the page passes stable
// props (memoized data, primitive flags), this entire subtree sits out of every
// count-up re-render triggered by OverviewAnimatedCurrency leaf nodes.
export const OverviewChartsSection = memo(OverviewChartsSectionInner);
