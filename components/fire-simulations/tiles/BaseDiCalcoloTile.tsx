'use client';

/**
 * BASE DI CALCOLO — «su cosa è calcolato?»: the four inputs of the FIRE number as flat rows
 * (the net worth the page runs on, the expenses, the savings, the SWR — each with the window or
 * the rule it comes from as a caption) and, under them, the page's ONE live control: the
 * pension-lock switch.
 *
 * WHY the switch lives here and saves on change (the canvas's proposal, chosen 2026-08-25): it
 * changes the BASE — which capital counts today — so it belongs beside the figure it changes,
 * and a switch that only previewed would leave the reader hunting for a Salva button two
 * disclosures down. The SWR, the residence and the RITA details keep their form with an explicit
 * save in «Parametri»: a number typed needs a moment of commitment, a switch does not. In demo
 * mode the switch is disabled and the caption says so — never a `title` (AGENTS → Accessibility).
 *
 * The tile computes nothing: the rows read `FireBase`, the caption reads `describeLock(lock)`.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { FireLock } from '@/lib/utils/fireSummary';
import { describePensionRow, describeTaxRow, formatRate, type FireBase } from '@/lib/utils/fireNarrative';
import { NO_HONEST } from '@/lib/utils/fireSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface BaseDiCalcoloTileProps {
  reading: Narrative;
  aside: string | null;
  base: FireBase;
  lock: FireLock;
  /** `describeLock(lock)`. */
  lockCaption: Narrative;
  onLockChange: (active: boolean) => void;
  /** While the save is in flight, or in demo mode. */
  lockDisabled: boolean;
  /** Visible reason for a disabled switch («non modificabile in demo»); null when enabled. */
  lockDisabledReason: string | null;
  footer: Narrative;
  /** The calendar year, for «già in corso» on a pension that has started. */
  currentYear: number;
  className?: string;
}

function Row({ label, caption, value }: { label: string; caption?: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        {/* A caption is a fact (the window, the rule), so it takes the full muted ink: at /70 it
            measured 2,60:1 in light (2026-09-22). */}
        {caption && <span className="block text-[11px] leading-[1.4] text-muted-foreground">{caption}</span>}
      </span>
      {/* An absence prints «—» in the muted ink: a state, never a figure of 0. */}
      <span className={cn('shrink-0 font-mono text-[14px] tabular-nums', value === null ? 'text-muted-foreground' : 'text-foreground')}>{value ?? '—'}</span>
    </div>
  );
}

export function BaseDiCalcoloTile({ reading, aside, base, lock, lockCaption, onLockChange, lockDisabled, lockDisabledReason, footer, currentYear, className }: BaseDiCalcoloTileProps) {
  const honest = base.honest ?? NO_HONEST;
  const pensionRow = describePensionRow(honest, currentYear);
  const taxRow = describeTaxRow(honest);
  const netWorthCaption = [
    `casa di abitazione ${base.includesResidence ? 'inclusa' : 'esclusa'}`,
    lock.active && lock.lockedValue > 0 ? 'fondo pensione bloccato escluso' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <Tile eyebrow="Base di calcolo" aside={aside ?? undefined} reading={reading} ariaLabel="Base di calcolo del FIRE" className={cn('@container', className)}>
      {/* On a wide cell (the 7-column slot from desktop:) the lock block sits BESIDE the rows, in a
          second column, so the tile is as tall as its four rows and not as tall as their sum: it
          shares a row with nothing, and it must not stretch past its own content. Below that width
          the block follows the rows, under a rule. A container query, because the same tile is a
          full-width card on a phone and a half on a tablet (AGENTS → Tailwind Breakpoints). */}
      <div className="grid grid-cols-1 gap-x-6 @[560px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="mt-2.5 flex flex-col divide-y divide-border">
          <Row label="Patrimonio FIRE" caption={netWorthCaption} value={cachedFormatCurrencyEUR(base.netWorth, true)} />
          <Row label="Spese annue" caption={`${cachedFormatCurrencyEUR(base.monthlyExpenses, true)} al mese`} value={cachedFormatCurrencyEUR(base.annualExpenses, true)} />
          <Row label="Risparmio annuo" caption={`${cachedFormatCurrencyEUR(base.monthlySavings, true)} al mese`} value={cachedFormatCurrencyEUR(base.annualSavings, true)} />
          <Row label="Safe Withdrawal Rate" caption="numero FIRE = spese ÷ SWR" value={formatRate(base.swr)} />
          {/* The two rows that make the number honest (2026-09-24): each is either in the number
              or declared out with its reason — never silently assumed. */}
          <Row label="Pensioni statali" caption={pensionRow.caption} value={pensionRow.value} />
          <Row label="Tasse sui prelievi" caption={taxRow.caption} value={taxRow.value} />
        </div>

        <div className="mt-3.5 flex items-start justify-between gap-3 border-t border-border pt-3.5 @[560px]:mt-2.5 @[560px]:border-t-0 @[560px]:border-l @[560px]:py-[9px] @[560px]:pl-6">
          <label htmlFor="fire-pension-lock" className={cn('min-w-0', !lockDisabled && 'cursor-pointer')}>
            <span className="block text-[13px] text-foreground">Fondo pensione bloccato</span>
            <NarrativeText segments={lockCaption} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
            {lockDisabledReason && <span className="block text-[11px] leading-[1.4] text-muted-foreground">{lockDisabledReason}</span>}
          </label>
          <Switch
            id="fire-pension-lock"
            checked={lock.active}
            disabled={lockDisabled}
            onCheckedChange={onLockChange}
            aria-label="Considera il fondo pensione come capitale bloccato fino allo sblocco"
            className="mt-0.5 shrink-0"
          />
        </div>
      </div>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
