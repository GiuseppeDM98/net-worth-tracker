'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PieChart as PieChartComponent } from '@/components/ui/pie-chart';
import { springLayoutTransition } from '@/lib/utils/motionVariants';
import { useChartColors } from '@/lib/hooks/useChartColors';
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
   * the chart subtree mount. Until this is true charts show a loading placeholder.
   */
  heroSettled: boolean;
  /** True when viewport is narrower than the desktop breakpoint (1440px). */
  isMobile: boolean;
  /** Mirrors useReducedMotion() from the parent so motion skips are consistent. */
  prefersReducedMotion: boolean;
}

// Liquidity chart removed — now shown as a donut in the Patrimonio Liquido hero card.

// Module-level so React never sees a new component type between renders.
// Defining this inside the component body would cause remounts on every re-render
// of OverviewChartsSectionInner, resetting the spinner animation each time.
const LoadingPlaceholder = () => (
  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    Preparazione grafico...
  </div>
);

const CHART_TABS = [
  { id: 'assetClass', label: 'Asset Class' },
  { id: 'asset',      label: 'Per Asset'   },
] as const;

type ChartTabId = typeof CHART_TABS[number]['id'];

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
 * chartRenderReady starts false and becomes true only after heroSettled transitions
 * to true. The scheduling uses requestIdleCallback (when available) so the browser
 * processes the hero settle paint first, then mounts the chart SVGs during an idle
 * window. setTimeout(0) is the fallback for browsers without rIC.
 *
 * MOBILE LAYOUT:
 * On mobile, a single card with a Framer Motion tab switcher shows one chart at a
 * time. This avoids mounting 3 heavy SVGs simultaneously.
 *
 * DESKTOP LAYOUT:
 * All 3 charts side-by-side in a 3-col grid. No tabs needed.
 *
 * CHART ANIMATION:
 * Each chart tracks whether it has been rendered before via revealedCharts.
 * animateOnMount is true only on the first render of each chart to avoid
 * replaying Recharts entrance animations on data refreshes or tab switches.
 */
const OverviewChartsSectionInner = ({
  sections,
  heroSettled,
  isMobile,
  prefersReducedMotion,
}: OverviewChartsSectionProps) => {
  const chartColors = useChartColors();

  // Active tab for the mobile tab-switched view
  const [activeTab, setActiveTab] = useState<ChartTabId>('assetClass');

  // Tracks which charts have completed their first render so we can disable
  // the entrance animation on subsequent data refreshes or tab switches.
  const [revealedCharts, setRevealedCharts] = useState<Set<string>>(new Set());

  // Controls whether chart SVGs are actually mounted. Delayed until heroSettled
  // + an idle browser window to avoid competing with the count-up animation.
  const [chartRenderReady, setChartRenderReady] = useState(
    () => prefersReducedMotion || isMobile
  );

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

  const markRevealed = (id: string) => {
    setRevealedCharts(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  /**
   * Legend row for a single chart slice.
   * Uses `percentage` (not `value` — which is the raw currency amount).
   * Only rendered for slices with percentage >= 5 (filtered at call site).
   */
  const LegendRow = ({ item, index }: { item: PieChartData; index: number }) => (
    <div className="flex items-center gap-2">
      <div
        className="w-2 h-2 rounded-[2px] flex-shrink-0"
        style={{ background: item.color || chartColors[index] }}
      />
      <span className="flex-1 text-[11.5px] text-foreground font-medium truncate">
        {item.name}
      </span>
      <span className="text-[11.5px] text-muted-foreground font-mono tabular-nums">
        {item.percentage.toFixed(1)}%
      </span>
    </div>
  );

  // ─── MOBILE: tab-switched single chart ────────────────────────────────────────
  if (isMobile) {
    const activeSection = sections.find(s => s.id === activeTab) ?? sections[0];

    return (
      <motion.div
        layout="position"
        transition={springLayoutTransition}
        className="border-t border-border/40 pt-4"
      >
        <Card className="rounded-2xl">
          <CardContent className="p-[18px]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4">
              Composizione
            </p>

            {/* Tab switcher */}
            <div role="tablist" className="flex bg-muted rounded-xl p-[3px] gap-px mb-5">
              {CHART_TABS.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative flex-1 py-[7px] rounded-[8px] text-[11px] font-medium
                    text-muted-foreground aria-selected:text-foreground transition-colors duration-150"
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="chart-tab"
                      className="absolute inset-0 bg-card rounded-[8px] shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Chart + legend */}
            {!chartRenderReady ? (
              <LoadingPlaceholder />
            ) : (
              <div className="flex items-center gap-5">
                <div className="flex-shrink-0">
                  <PieChartComponent
                    data={activeSection.data}
                    animateOnMount={!revealedCharts.has(activeSection.id)}
                    onFirstRender={() => markRevealed(activeSection.id)}
                    compact
                    width={150}
                    height={150}
                  />
                </div>
                <div className="flex-1 flex flex-col gap-[7px] min-w-0">
                  {activeSection.data
                    .filter(item => item.percentage >= 5)
                    .map((item, i) => (
                      <LegendRow key={item.name} item={item} index={i} />
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ─── DESKTOP: all 3 charts side-by-side ──────────────────────────────────────
  return (
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="border-t border-border/40 pt-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4">
        Composizione
      </p>
      {/* 2-col grid (liquidity removed — now shown in hero donut) */}
      <div className="grid desktop:grid-cols-2 gap-4">
        {sections.filter(s => s.id !== 'liquidity').map(section => (
          <motion.div
            key={section.id}
            layout="position"
            transition={springLayoutTransition}
          >
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-[14px]">
                {section.title}
              </p>
              {!chartRenderReady ? (
                <LoadingPlaceholder />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <PieChartComponent
                      data={section.data}
                      animateOnMount={!revealedCharts.has(section.id)}
                      onFirstRender={() => markRevealed(section.id)}
                      compact
                      width={160}
                      height={160}
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-[7px] min-w-0">
                    {section.data
                      .filter(item => item.percentage >= 5)
                      .map((item, i) => (
                        <LegendRow key={item.name} item={item} index={i} />
                      ))}
                  </div>
                </div>
              )}
            </div>
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
