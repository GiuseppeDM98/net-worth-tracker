/**
 * Cashflow Sankey Diagram — the FLOW view of the period, as a plot only.
 *
 * Since the Analisi redesign (2026-08-25) this component draws ONE view it is handed: the
 * Flusso tile owns the navigation state (the subcategory toggle, the single type drill) and
 * builds the `SankeyView` with the pure builders in lib/utils/cashflowSankey.ts, so the tile's
 * eyebrow, aside and reading can describe exactly what is drawn. Node clicks leave through
 * `onNodeClick` with the node's DESCRIPTOR — the index says what a node is, the handler never
 * infers it from the id's shape.
 *
 * Colours stay hardcoded hex (react-spring cannot interpolate oklch — AGENTS.md → Recharts).
 *
 * Used by: components/cashflow/analisi/tiles/FlussoTile.tsx
 */
'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { ResponsiveSankey } from '@nivo/sankey';
import { LABEL_TEXT_COLORS, type SankeyNode, type SankeyNodeDescriptor, type SankeyView } from '@/lib/utils/cashflowSankey';
import { formatCurrencyForSankey, formatPercentage } from '@/lib/services/chartService';
import { chartReveal, fadeVariants } from '@/lib/utils/motionVariants';

interface CashflowSankeyChartProps {
  view: SankeyView;
  /** Keyed on identity so switching views remounts the reveal animation. */
  viewKey: string;
  /** Compact layout: labels inside, thinner nodes, no gradients. */
  isMobile: boolean;
  /** The plot's height, from the view's widest column (`resolveSankeyHeight`) — never a fixed 500. */
  height: number;
  /** Inside a type's own view a type node is a no-op — the tooltip must not promise a drill. */
  drilled: boolean;
  /** The svg's accessible name: what is drawn, in the tile's words. */
  ariaLabel: string;
  onNodeClick: (descriptor: SankeyNodeDescriptor, color: string) => void;
}

export function CashflowSankeyChart({ view, viewKey, isMobile, height, drilled, ariaLabel, onNodeClick }: CashflowSankeyChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const prefersReducedMotion = useReducedMotion();

  // Nivo receives the graph only — never the descriptor index, which is ours.
  const chartData = useMemo(() => ({ nodes: view.nodes, links: view.links }), [view]);

  // Total for the tooltip shares: in the budget view only the income links (which all end at
  // the Budget node) are summed; in a drill-down every link leaves the same root.
  const totalAmount = useMemo(() => {
    const budgetNodeId = view.nodes.find((node) => view.index.get(node.id)?.kind === 'budget')?.id;
    return view.links.reduce((sum, link) => (drilled || link.target === budgetNodeId ? sum + link.value : sum), 0);
  }, [view, drilled]);

  // The spacing is the floor under an 11px label: with 10px two tiny nodes' labels touched.
  const chartConfig = isMobile
    ? {
        margin: { top: 20, right: 60, bottom: 20, left: 60 },
        nodeThickness: 15,
        nodeSpacing: 10,
        nodeBorderWidth: 1,
        enableLinkGradient: false,
        labelPosition: 'inside' as const,
        labelOffset: 0,
      }
    : {
        margin: { top: 40, right: 160, bottom: 40, left: 160 },
        nodeThickness: 20,
        nodeSpacing: 14,
        nodeBorderWidth: 2,
        enableLinkGradient: true,
        labelPosition: 'outside' as const,
        labelOffset: 12,
      };

  if (view.nodes.length === 0 || view.links.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">Nessun flusso nel periodo.</p>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        variants={prefersReducedMotion ? fadeVariants : chartReveal}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{ height }}
      >
        <ResponsiveSankey
          data={chartData}
          margin={chartConfig.margin}
          // `left`: a node sits at its depth from the sources, so a category without a
          // subcategory layer stays in the categories' column and the savings node beside
          // the types — `justify` pushed every leaf to the last column, 54 nodes deep.
          align="start"
          role="img"
          ariaLabel={ariaLabel}
          colors={{ datum: 'nodeColor' }}
          valueFormat={(value) => formatCurrencyForSankey(value)}
          animate={!prefersReducedMotion}
          motionConfig="gentle"
          nodeOpacity={1}
          nodeHoverOpacity={0.84}
          nodeThickness={chartConfig.nodeThickness}
          nodeSpacing={chartConfig.nodeSpacing}
          nodeBorderWidth={chartConfig.nodeBorderWidth}
          nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}
          nodeBorderRadius={3}
          linkOpacity={isDark ? 0.68 : 0.42}
          linkHoverOpacity={isDark ? 0.88 : 0.62}
          linkContract={3}
          enableLinkGradient={chartConfig.enableLinkGradient}
          // No `|| node.id` fallback: ids are namespaced, and a missing label would put
          // "cat:fixed:aB3xK9" on screen. SankeyNode.label is required precisely so that
          // cannot happen; the cast is Nivo's accessor type omitting `label`.
          label={(node) => (node as unknown as SankeyNode).label}
          labelPosition={chartConfig.labelPosition}
          labelPadding={chartConfig.labelOffset}
          labelOrientation="horizontal"
          // One neutral per mode (see LABEL_TEXT_COLORS): a label is read, not coloured.
          labelTextColor={isDark ? LABEL_TEXT_COLORS.dark : LABEL_TEXT_COLORS.light}
          // Links reach this callback too; only node data carries an id.
          onClick={(data) => {
            if (!('id' in data)) return;
            const descriptor = view.index.get(data.id);
            if (descriptor) onNodeClick(descriptor, data.color);
          }}
          nodeTooltip={({ node }) => {
            const kind = view.index.get(node.id)?.kind;
            return (
              <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                <strong>{node.label}</strong>
                <br />
                <span className="font-mono tabular-nums">{formatCurrencyForSankey(node.value || 0)}</span>
                <br />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatPercentage(totalAmount > 0 ? ((node.value || 0) / totalAmount) * 100 : 0, 1)}
                </span>
                {(kind === 'category' || kind === 'subCategory') && (
                  <>
                    <br />
                    <span className="text-xs italic text-muted-foreground">Click per aprire la scheda</span>
                  </>
                )}
                {!drilled && kind === 'expenseType' && (
                  <>
                    <br />
                    <span className="text-xs italic text-muted-foreground">Click per il dettaglio per tipologia</span>
                  </>
                )}
              </div>
            );
          }}
          theme={{
            tooltip: {
              container: {
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                color: 'var(--popover-foreground)',
                fontSize: '14px',
              },
            },
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
