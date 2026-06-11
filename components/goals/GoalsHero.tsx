/**
 * GoalsHero (A1 / A2 / A7) — the one-glance verdict for the Obiettivi tab.
 *
 * Trade Republic asymmetric bento: dominant allocated total (left) + the actual decision
 * metric (right) — how many goals are behind, with the nearest deadline surfaced. Below,
 * three KPI chips replace the old equal-weight rows: "Da accantonare / mese" (the actionable
 * sum, replacing the meaningless Progresso Medio average), "Non assegnato" (now expandable
 * to the free assets — A7), and "Prossima scadenza".
 *
 * The count-up is isolated in a leaf so each frame re-renders only that span.
 */

'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR, formatCurrency } from '@/lib/utils/formatters';
import { GoalsVerdictSummary } from '@/lib/utils/goalTrajectory';
import { formatMonthsToDeadline } from './goalVerdictMeta';

export interface FreeAsset {
  id: string;
  name: string;
  ticker?: string;
  freeValue: number;
  freePct: number;
}

interface GoalsHeroProps {
  allocatedTotal: number;
  goalCount: number;
  summary: GoalsVerdictSummary;
  unassignedValue: number;
  freeAssets: FreeAsset[];
  ready: boolean;
}

function HeroValue({ value }: { value: number }) {
  const animated = useCountUp(value, { duration: 620, once: true, fromPrevious: true });
  return <>{cachedFormatCurrencyEUR(animated ?? value)}</>;
}

function Verdict({ summary, goalCount }: { summary: GoalsVerdictSummary; goalCount: number }) {
  if (goalCount === 0) {
    return <p className="mt-2 text-2xl font-bold leading-none text-muted-foreground">--</p>;
  }
  if (summary.offTrack > 0) {
    return (
      <>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="font-mono text-[32px] font-bold leading-none tabular-nums text-destructive">
            {summary.offTrack}
          </span>
          <span className="text-sm text-muted-foreground">
            {summary.offTrack === 1 ? 'obiettivo in ritardo' : 'obiettivi in ritardo'}
          </span>
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {summary.onTrack} in linea · {summary.reached} raggiunti
        </p>
      </>
    );
  }
  if (summary.reached === goalCount) {
    return (
      <p className="mt-2 text-2xl font-bold leading-none text-positive">Tutti raggiunti</p>
    );
  }
  return (
    <>
      <p className="mt-2 text-2xl font-bold leading-none text-positive">In linea</p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {summary.onTrack} in linea · {summary.reached} raggiunti
      </p>
    </>
  );
}

function KpiChip({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </p>
      <p className="mt-1 font-mono text-[22px] font-bold leading-none tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Mobile/tablet flat-list row: label (+sub) left, value right with full room. */
function KpiRow({
  label,
  value,
  sub,
  expandable,
  expanded,
  onToggle,
}: {
  label: string;
  value: string;
  sub?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
          {label}
          {expandable && (
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          )}
        </p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <p className="shrink-0 text-right font-mono text-lg font-bold tabular-nums text-foreground">
        {value}
      </p>
    </>
  );

  if (expandable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-center justify-between gap-3 px-4 py-3">{inner}</div>;
}

export function GoalsHero({
  allocatedTotal,
  goalCount,
  summary,
  unassignedValue,
  freeAssets,
  ready,
}: GoalsHeroProps) {
  const reducedMotion = useReducedMotion();
  const [freeOpen, setFreeOpen] = useState(false);

  const nearestLabel = formatMonthsToDeadline(summary.nearest?.monthsToDeadline ?? null);
  const hasFree = freeAssets.length > 0;

  // KPI values, derived once and shared by the mobile list + desktop grid (responsive duplication).
  const saveValue = summary.withDeadline > 0 ? formatCurrency(summary.totalRequiredMonthly) : '--';
  const saveSub =
    summary.withDeadline > 0
      ? `${summary.withDeadline} ${summary.withDeadline === 1 ? 'obiettivo datato' : 'obiettivi datati'}`
      : 'Nessuna scadenza';
  const unassignedSub = hasFree
    ? `${freeAssets.length} asset con quota libera`
    : 'Tutto assegnato';
  const deadlineValue = nearestLabel
    ? nearestLabel === 'scaduto'
      ? 'Scaduto'
      : nearestLabel.replace('tra ', '')
    : '--';

  return (
    <div className="space-y-3">
      {/* Bento: allocated total + verdict */}
      <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Patrimonio allocato
          </p>
          <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[54px]">
            {ready && goalCount > 0 ? <HeroValue value={allocatedTotal} /> : '--'}
          </p>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {goalCount} {goalCount === 1 ? 'obiettivo' : 'obiettivi'} · valori correnti
          </p>
        </div>

        <div className="flex h-full flex-col justify-center rounded-2xl border border-border bg-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Obiettivi
          </p>
          <Verdict summary={summary} goalCount={goalCount} />
          {summary.nearest && nearestLabel && (
            <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: summary.nearest.color }}
              />
              <span className="truncate text-xs text-muted-foreground" title={summary.nearest.goalName}>
                {summary.nearest.goalName}
              </span>
              <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
                {nearestLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI metrics — flat divide-y list below desktop (value right-aligned, full room),
          3-col chip grid at desktop (responsive duplication). */}
      {goalCount > 0 && (
        <>
          {/* Mobile / tablet: flat list */}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card desktop:hidden">
            <KpiRow label="Da accantonare / mese" value={saveValue} sub={saveSub} />
            <KpiRow
              label="Non assegnato"
              value={formatCurrency(unassignedValue)}
              sub={unassignedSub}
              expandable={hasFree}
              expanded={freeOpen}
              onToggle={() => setFreeOpen((o) => !o)}
            />
            <KpiRow label="Prossima scadenza" value={deadlineValue} sub={summary.nearest?.goalName} />
          </div>

          {/* Desktop: chip grid */}
          <div className="hidden gap-3 desktop:grid desktop:grid-cols-3">
            <KpiChip label="Da accantonare / mese" value={saveValue} sub={saveSub} />
            <button
              type="button"
              onClick={() => hasFree && setFreeOpen((o) => !o)}
              aria-expanded={hasFree ? freeOpen : undefined}
              disabled={!hasFree}
              className={`rounded-xl bg-muted/40 px-4 py-3 text-left transition-colors ${
                hasFree ? 'hover:bg-muted/60' : 'cursor-default'
              }`}
            >
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                Non assegnato
                {hasFree && (
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${
                      freeOpen ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </p>
              <p className="mt-1 font-mono text-[22px] font-bold leading-none tabular-nums text-foreground">
                {formatCurrency(unassignedValue)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{unassignedSub}</p>
            </button>
            <KpiChip label="Prossima scadenza" value={deadlineValue} sub={summary.nearest?.goalName} />
          </div>
        </>
      )}

      {/* Free-asset breakdown (A7) */}
      {hasFree && freeOpen && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, height: 0 }}
          animate={reducedMotion ? undefined : { opacity: 1, height: 'auto' }}
          transition={reducedMotion ? undefined : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="rounded-xl border border-border bg-card">
            <p className="px-4 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">
              Asset con quota ancora libera da assegnare
            </p>
            <ul className="divide-y divide-border">
              {freeAssets.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                    {a.ticker && (
                      <p className="font-mono text-[11px] text-muted-foreground/70">{a.ticker}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-medium tabular-nums text-foreground">
                      {formatCurrency(a.freeValue)}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {a.freePct.toFixed(0)}% libero
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </div>
  );
}
