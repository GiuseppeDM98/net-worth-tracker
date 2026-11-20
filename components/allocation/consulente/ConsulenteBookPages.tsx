'use client';

/**
 * The bodies of the book's pages (2026-11-11): each the former report tile's body without its
 * `Tile` — moved, not rewritten — returned as the PIECES the page draws in its own order: the
 * aside beside the eyebrow, the reading line, the figures, the footnote. Hook-free builders, so the
 * book and its print sheet draw the same figures; the components they return (`ProposalRows`,
 * `ProposedPct`) hold the only hooks, the count-up's.
 *
 * The module also holds what the report's column shared: `MARKDOWN_COMPONENTS` (module-level, as
 * ReactMarkdown wants: a stable map keeps the tree mounted), `ROLE_LABEL` and the once-flags of the
 * entrance. They live here, not in `ConsulenteReport.tsx`, so the book never imports the report.
 */

import { useEffect, useState } from 'react';
import type ReactMarkdown from 'react-markdown';
import { Globe } from 'lucide-react';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { OperatingPlan, OperatingPlanRow } from '@/lib/utils/operatingPlan';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import type { GoalPlan, planRoleChanges } from '@/lib/utils/allocationAdviceApply';
import { ADVICE_PLAN_TICK_COPY, BOOK_COPY, describePlanAside, describePlanTaxTotal, describeProposalReading, OPERATING_PLAN_PAGE_COPY, type ProposalClassRow } from '@/lib/utils/allocationAdviceNarrative';
import { ACCUMULO_HREF, ACCUMULO_OPEN_LINK } from '@/lib/utils/accumuloCopy';
import Link from 'next/link';
import { formatCurrency, formatDate, formatNumberIt, formatPercentageIt, formatSignedPoints } from '@/lib/utils/formatters';
import type { Narrative } from '@/lib/utils/narrative';
import { useCountUp } from '@/lib/utils/useCountUp';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AI_CONTROL_ACCENT_CLASS, AI_CONTROL_ACCENT_LABEL_CLASS } from '@/lib/constants/aiAccent';
import { cn } from '@/lib/utils';

/** The footer's buttons: 44 px to touch below `desktop:`, 36 px from it (shared by the book and «Applica»'s plan row). */
export const BUTTON_CLASS = 'h-11 desktop:h-9';

/**
 * Once per JS session (a reload plays them again, a client navigation back does not): the first
 * page's cascade, and the proposal page's count-up — two flags, because a session that opens on
 * another page still counts up when it reaches the proposal.
 */
export const consulenteReportEntrance = { cascade: false, countUp: false };

export const ROLE_LABEL = { tradable: 'negoziabile', frozen: 'non negoziabile', excluded: 'escluso' } as const;

/** Module-level, as ReactMarkdown wants: a stable map keeps the tree mounted across renders. */
export const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => <h3 className="mt-5 text-[15px] font-semibold text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-5 text-[15px] font-semibold text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 text-[14px] font-semibold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="mt-2 text-[14px] leading-[1.6] text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.6] text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-[1.6] text-foreground">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 font-mono text-[12px]">{children}</code>,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-2 py-1 align-top">{children}</td>,
};

/** What a page draws besides its title and its text: the aside beside the eyebrow, the reading line, the figures, the footnote. */
export interface BookPagePieces {
  aside: React.ReactNode;
  reading: Narrative | null;
  body: React.ReactNode;
  footnote: React.ReactNode;
}

const FOOTNOTE_CLASS = 'mt-4 border-t border-border pt-3.5 text-[11px] text-muted-foreground';

/** The proposed percentage of a class: counts up when asked, prints at once otherwise. */
function ProposedPct({ value, animate }: { value: number; animate: boolean }) {
  const counted = useCountUp(animate ? value : null, { once: true, duration: 620 });
  return <span data-proposed-pct="">{formatPercentageIt(animate && counted !== null ? counted : value, 1)}</span>;
}

/**
 * The class rows. `countUp` is the book's decision at its mount (not played this session, no
 * reduced motion); this mount counts only when the flag is still unset, and an on-screen mount
 * that counted writes it — in an effect, never in render — so turning back never replays.
 */
function ProposalRows({ rows, countUp }: { rows: ProposalClassRow[]; countUp: boolean }) {
  const [animate] = useState(() => countUp && !consulenteReportEntrance.countUp);
  useEffect(() => {
    if (animate) consulenteReportEntrance.countUp = true;
  }, [animate]);
  return (
    <ul className="mt-3 divide-y divide-border" aria-label="Classi">
      {rows.map((row) => (
        <li key={row.assetClass} className="py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-foreground">{row.label}</span>
            <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
              {formatPercentageIt(row.currentPct, 1)} → {row.fixedAmount !== undefined ? `${formatCurrency(row.fixedAmount)} fissi` : <ProposedPct value={row.proposedPct} animate={animate} />}
              {row.fixedAmount === undefined && <span className="ml-2 text-muted-foreground">{formatSignedPoints(row.deltaPp)}</span>}
            </span>
          </div>
          {row.subTargets.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 pl-3">
              {row.subTargets.map((sub) => (
                <li key={sub.name} className="flex items-baseline justify-between gap-3 text-[12px] text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {sub.name}
                    {sub.instrument ? ` · ${sub.instrument}` : ''}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{formatPercentageIt(sub.pct, 0)} della classe</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** «L'allocazione proposta»: the classes against today; the review date and its reason live on «Rischi e revisione». */
export function proposalPieces(rows: ProposalClassRow[], countUp: boolean): BookPagePieces {
  return {
    aside: 'oggi → proposta',
    reading: describeProposalReading(rows),
    body: <ProposalRows rows={rows} countUp={countUp} />,
    footnote: <p className={FOOTNOTE_CLASS}>Percentuali sulla base della pagina Allocazione (negoziabile e non negoziabile, al netto dei debiti).</p>,
  };
}

/** «Gli strumenti»: the sleeves the search covered, the instrument already held first. */
export function instrumentsPieces(instruments: NonNullable<AllocationAdviceDocument['instruments']>): BookPagePieces {
  return {
    aside: instruments.webSearchUsed ? (
      <span className="inline-flex items-center gap-1">
        <Globe className="h-3 w-3" aria-hidden="true" />
        verificati sul web
      </span>
    ) : (
      'senza ricerca web'
    ),
    reading: [{ text: instruments.candidates ? `${instruments.candidates.sleeves.length} sotto-target coperti; lo strumento già in portafoglio, quando c'è, viene prima.` : BOOK_COPY.instrumentsTextOnly }],
    body: instruments.candidates ? (
      <ul className="mt-3 divide-y divide-border" aria-label="Strumenti per sotto-target">
        {instruments.candidates.sleeves.map((sleeve) => (
          <li key={`${sleeve.assetClass}-${sleeve.subTarget}`} className="py-2.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>{sleeve.subTarget}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {sleeve.candidates.map((candidate) => (
                <li key={`${candidate.name}-${candidate.isin ?? ''}`} className="text-[13px] leading-[1.45] text-foreground">
                  <span className="font-medium">{candidate.name}</span>
                  {candidate.alreadyHeld && <span className="ml-1.5 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">in portafoglio</span>}
                  <span className="text-muted-foreground">
                    {candidate.isin ? ` · ${candidate.isin}` : ''}
                    {candidate.ticker ? ` · ${candidate.ticker}` : ''}
                    {candidate.ter !== undefined ? ` · TER ${formatPercentageIt(candidate.ter, 2)}` : ''}
                    {candidate.duration !== undefined ? ` · duration ${formatNumberIt(candidate.duration, 1)} anni` : ''}
                    {candidate.policy ? ` · ${candidate.policy}` : ''}
                    {` · ${candidate.exchange}`}
                  </span>
                  {candidate.note && <p className="text-[12px] text-muted-foreground">{candidate.note}</p>}
                </li>
              ))}
            </ul>
            {sleeve.caveat && <p className="mt-1 text-[12px] text-warning-foreground">{sleeve.caveat}</p>}
          </li>
        ))}
      </ul>
    ) : null,
    footnote: null,
  };
}

/** «Gli obiettivi»: each goal with the instruments held that cover it and their share. */
export function goalsPieces(proposal: AllocationAdviceProposal): BookPagePieces {
  return {
    aside: `${proposal.goals.length} nel piano`,
    reading: [{ text: 'Ogni obiettivo con gli strumenti posseduti che lo coprono e la quota di ciascuno.' }],
    body: (
      <ul className="mt-3 divide-y divide-border">
        {proposal.goals.map((goal) => (
          <li key={`${goal.goalId ?? 'new'}-${goal.name}`} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-foreground">
                {goal.name}
                {!goal.goalId && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">nuovo</span>}
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                {goal.targetAmount !== undefined ? formatCurrency(goal.targetAmount) : 'senza target'}
                {goal.targetDateIso ? ` · ${formatDate(new Date(goal.targetDateIso))}` : ''}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {goal.assignments.length === 0 ? 'Nessuno strumento assegnato.' : goal.assignments.map((row) => `${row.assetName} ${formatPercentageIt(row.percentage, 0)}`).join(' · ')}
            </p>
            {goal.rationale && <p className="mt-0.5 text-[12px] leading-[1.45] text-foreground">{goal.rationale}</p>}
          </li>
        ))}
      </ul>
    ),
    footnote: null,
  };
}

/** «Casa, fondi pensione e illiquidi»: what enters the targets' base and what stays out, against today. */
export function rolesPieces(roles: ReturnType<typeof planRoleChanges>): BookPagePieces {
  return {
    aside: `${roles.changes.length} ${roles.changes.length === 1 ? 'cambio' : 'cambi'}`,
    reading: [{ text: 'Cosa entra nella base dei target e cosa resta fuori, rispetto a oggi.' }],
    body: (
      <>
        <ul className="mt-3 divide-y divide-border">
          {roles.changes.map((change) => (
            <li key={change.assetId} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-foreground">{change.assetName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {ROLE_LABEL[change.from]} → <span className="text-foreground">{ROLE_LABEL[change.to]}</span>
                </span>
              </div>
              {change.reason && <p className="text-[12px] leading-[1.45] text-muted-foreground">{change.reason}</p>}
            </li>
          ))}
        </ul>
        {roles.unmatched.length > 0 && <p className="mt-3 text-[12px] text-warning-foreground">Non trovati fra i tuoi strumenti, ignorati: {roles.unmatched.join(', ')}.</p>}
      </>
    ),
    footnote: null,
  };
}

/** «Rischi e revisione»: the review date beside the eyebrow, its reason as the reading, the risks as rows (none with zero). */
export function risksPieces(proposal: AllocationAdviceProposal): BookPagePieces {
  return {
    aside: BOOK_COPY.reviewAside(formatDate(new Date(proposal.reviewByIso))),
    reading: [{ text: proposal.reviewReason }],
    body:
      proposal.risks.length > 0 ? (
        <ul className="mt-3 divide-y divide-border" aria-label="Rischi">
          {proposal.risks.map((risk, index) => (
            <li key={index} className="py-2.5 text-[13px] leading-[1.45] text-foreground">
              {risk}
            </li>
          ))}
        </ul>
      ) : null,
    footnote: null,
  };
}

/**
 * «Il piano operativo» (2026-11-19): the stored plan as three groups — what it buys at which
 * weight, what it stops buying, what it sells and when, with the app's figures in mono — then the
 * taxes' total, the review month, where it departs from the report and the app's corrections. The
 * names come from `plan.instruments` by key: no asset is read.
 */
export function planPieces(plan: OperatingPlan): BookPagePieces {
  const nameOf = (ref: string) => plan.instruments.find((instrument) => instrument.ref === ref)?.name ?? ref;
  const of = (action: OperatingPlanRow['action']) => plan.rows.filter((row) => row.action === action);
  const buys = of('buy');
  const holds = of('hold');
  const sells = of('sell');
  const taxTotal = describePlanTaxTotal(sells);
  const group = (label: string, rows: OperatingPlanRow[], line: (row: OperatingPlanRow) => React.ReactNode) =>
    rows.length === 0 ? null : (
      <div className="mt-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
        <ul className="mt-1 divide-y divide-border" aria-label={label}>
          {rows.map((row) => (
            <li key={row.ref} className="py-2.5">
              {line(row)}
              {row.reason && <p className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">{row.reason}</p>}
            </li>
          ))}
        </ul>
      </div>
    );
  const sentences = (label: string, items: readonly string[]) =>
    items.length === 0 ? null : (
      <div className="mt-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
        <ul className="mt-1 flex flex-col gap-1" aria-label={label}>
          {items.map((item, index) => (
            <li key={index} className="text-[12px] leading-[1.45] text-foreground">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  return {
    aside: describePlanAside(plan),
    reading: [{ text: plan.summary }],
    body: (
      <>
        {group(OPERATING_PLAN_PAGE_COPY.buy, buys, (row) => (
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-[13px] text-foreground">{nameOf(row.ref)}</span>
            <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
              {row.targetPercentage === 0 && sells.some((sale) => sale.reinvestInto === row.ref) ? OPERATING_PLAN_PAGE_COPY.bySwap : formatPercentageIt(row.targetPercentage, 2)}
            </span>
          </div>
        ))}
        {group(OPERATING_PLAN_PAGE_COPY.hold, holds, (row) => (
          <span className="text-[13px] text-foreground">{nameOf(row.ref)}</span>
        ))}
        {group(OPERATING_PLAN_PAGE_COPY.sell, sells, (row) => (
          // The figures wrap under the name at 390: each part is a chunk of its own.
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="min-w-0 text-[13px] text-foreground">{nameOf(row.ref)}</span>
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {[
                row.sellQuantity !== undefined ? `${formatNumberIt(row.sellQuantity, 0)} quote` : OPERATING_PLAN_PAGE_COPY.allShares,
                `${row.sellMonth ?? 1}º mese`,
                `circa ${formatCurrency(row.estimatedProceedsEur ?? 0)}`,
                typeof row.estimatedTaxEur === 'number' ? `tasse stimate ${formatCurrency(row.estimatedTaxEur)}` : OPERATING_PLAN_PAGE_COPY.taxUnknown[row.taxUnknownReason ?? 'rate'],
                ...(row.reinvestInto ? [OPERATING_PLAN_PAGE_COPY.swapBuys(nameOf(row.reinvestInto))] : []),
              ].join(' · ')}
            </span>
          </div>
        ))}
        {taxTotal && <p className="mt-3 text-[12px] text-foreground">{taxTotal}</p>}
        {plan.reviewMonth !== undefined && (
          <p className="mt-2 text-[12px] leading-[1.45] text-foreground">
            Da riguardare al {plan.reviewMonth}º mese{plan.reviewReason ? `: ${plan.reviewReason}` : '.'}
          </p>
        )}
        {sentences(OPERATING_PLAN_PAGE_COPY.departures, plan.departures)}
        {sentences(OPERATING_PLAN_PAGE_COPY.corrections, plan.corrections)}
      </>
    ),
    footnote: <p className={FOOTNOTE_CLASS}>{OPERATING_PLAN_PAGE_COPY.footnote}</p>,
  };
}

/**
 * The row on «Applica» while the report has no usable plan (2026-11-19): absent, running, failed
 * with its sentence, unusable with the last correction; the button asks the model (The AI-Accent
 * Rule) and hides while the plan is being written.
 */
export interface PlanRow {
  state: 'absent' | 'running' | 'failed' | 'unusable';
  message: string | null;
  onWrite: () => void;
  disabled: boolean;
}

function PlanRowBlock({ row }: { row: PlanRow }) {
  const sentence = row.state === 'absent' ? OPERATING_PLAN_PAGE_COPY.rowAbsent : row.state === 'running' ? OPERATING_PLAN_PAGE_COPY.rowRunning : row.message ?? OPERATING_PLAN_PAGE_COPY.rowAbsent;
  return (
    <div data-plan-row={row.state} className="flex flex-col gap-2 border-t border-border pt-3 tablet:flex-row tablet:items-center tablet:justify-between">
      <p role="status" className={cn('text-[12px] leading-[1.45]', row.state === 'failed' || row.state === 'unusable' ? 'text-warning-foreground' : 'text-muted-foreground')}>
        {sentence}
      </p>
      {row.state !== 'running' && (
        <Button type="button" variant="outline" className={cn(BUTTON_CLASS, 'shrink-0', AI_CONTROL_ACCENT_CLASS, AI_CONTROL_ACCENT_LABEL_CLASS)} onClick={row.onWrite} disabled={row.disabled}>
          {OPERATING_PLAN_PAGE_COPY.action}
        </Button>
      )}
    </div>
  );
}

export type ApplyState = { phase: 'idle' } | { phase: 'writing' } | { phase: 'error'; message: string } | { phase: 'done' };

/** «Applica»'s inputs: the document, the plans, the three choices and the write's state — all owned by the report. */
export interface ApplyPiecesInput {
  document: AllocationAdviceDocument;
  proposal: AllocationAdviceProposal | null;
  rows: ProposalClassRow[];
  roles: ReturnType<typeof planRoleChanges>;
  goalPlan: GoalPlan | null;
  goalsCount: number;
  applySummary: string;
  applyTargets: boolean;
  setApplyTargets: (value: boolean) => void;
  applyRoles: boolean;
  setApplyRoles: (value: boolean) => void;
  applyGoals: boolean;
  setApplyGoals: (value: boolean) => void;
  applyState: ApplyState;
  /** The operating plan's row (2026-11-19); null when the report has a usable plan (`operatingPlanOf`). */
  planRow: PlanRow | null;
  /**
   * The plan of accumulation's tick (2026-11-20, `ConsulentePlanTick` loaded on demand): in its 'tick'
   * mode after the three checkboxes on a ready report, in its 'button' mode on an applied one; null
   * without a usable operating plan.
   */
  planTick: React.ReactNode | null;
  /** The plan the document records: its sentence, and why the model was not written by THIS press. */
  planDone: { sentence: string; modelNote: string | null } | null;
  /** Why THIS press did not create the plan (`describeAdvicePlanFailure`). */
  planFailure: string | null;
  /** «Crea il piano di accumulo» on an applied report; null while the plan cannot be created now. */
  onCreatePlan: (() => void) | null;
  creatingPlan: boolean;
}

/** The applied body's plan branch: created → its sentence and the link; else the failure, the tick and the button. */
function AppliedPlanBlock({ input }: { input: ApplyPiecesInput }) {
  if (input.planDone) {
    return (
      <div data-plan-done="" className="flex flex-col gap-2">
        <p role="status" className="text-[13px] leading-[1.45] text-foreground">{input.planDone.sentence}</p>
        {input.planDone.modelNote && <p className="text-[12px] text-warning-foreground">{input.planDone.modelNote}</p>}
        <Button asChild variant="outline" className={cn(BUTTON_CLASS, 'w-fit')}>
          <Link href={ACCUMULO_HREF}>{ACCUMULO_OPEN_LINK}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div data-plan-create="" className="flex flex-col gap-3">
      {input.planFailure && <p role="alert" className="text-[12px] leading-[1.45] text-destructive">{input.planFailure}</p>}
      {input.planTick}
      {/* No model is asked: never accented (The AI-Accent Rule). */}
      <Button type="button" className={cn(BUTTON_CLASS, 'w-fit')} disabled={!input.onCreatePlan || input.creatingPlan} onClick={() => input.onCreatePlan?.()}>
        {input.creatingPlan ? ADVICE_PLAN_TICK_COPY.creating : ADVICE_PLAN_TICK_COPY.createAction}
      </Button>
    </div>
  );
}

/**
 * «Applica»: on a ready report one checkbox per thing it writes — the plan of accumulation's among
 * them —, the plans' warnings and the status line; once applied, the plan the document records, else
 * the way to create it; in both, the operating plan's row while there is no plan.
 */
export function applyPieces(input: ApplyPiecesInput): BookPagePieces {
  const { document, proposal, rows, roles, goalPlan, goalsCount, applyState } = input;
  return {
    aside: document.status === 'applied' && document.applied ? `applicato il ${formatDate(document.applied.at)}` : 'niente è scritto finché non confermi',
    reading: [{ text: document.status === 'applied' ? "L'allocazione è già nelle impostazioni: rifai il percorso per cambiarla." : input.applySummary }],
    body:
      document.status === 'ready' && proposal ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Checkbox id="apply-targets" checked={input.applyTargets} onCheckedChange={(checked) => input.setApplyTargets(checked === true)} className="mt-0.5" disabled={applyState.phase === 'writing'} />
            <Label htmlFor="apply-targets" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
              I target e i sotto-target in Impostazioni → Allocazione ({rows.filter((row) => row.proposedPct > 0 || row.fixedAmount !== undefined).length} classi). Sostituiscono quelli di oggi.
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="apply-roles" checked={input.applyRoles} onCheckedChange={(checked) => input.setApplyRoles(checked === true)} className="mt-0.5" disabled={applyState.phase === 'writing' || roles.changes.length === 0} />
            <Label htmlFor="apply-roles" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
              I ruoli degli asset ({roles.changes.length} {roles.changes.length === 1 ? 'cambio' : 'cambi'}).
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="apply-goals" checked={input.applyGoals} onCheckedChange={(checked) => input.setApplyGoals(checked === true)} className="mt-0.5" disabled={applyState.phase === 'writing' || goalsCount === 0} />
            <Label htmlFor="apply-goals" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
              Gli obiettivi e le quote
              {goalPlan && goalsCount > 0
                ? ` (${[goalPlan.created.length > 0 ? `${goalPlan.created.length} nuovi` : null, goalPlan.updated.length > 0 ? `${goalPlan.updated.length} aggiornati` : null, goalPlan.removed.length > 0 ? `${goalPlan.removed.length} eliminati` : null].filter(Boolean).join(', ')})`
                : ' (nessuna modifica)'}
              .
            </Label>
          </div>
          {goalPlan && goalPlan.unmatched.length > 0 && <p className="text-[12px] text-warning-foreground">Quote su strumenti non trovati, ignorate: {goalPlan.unmatched.join(', ')}.</p>}
          {goalPlan && goalPlan.rescaled.length > 0 && <p className="text-[12px] text-warning-foreground">Quote ridotte perché superavano il 100% dello strumento: {goalPlan.rescaled.join(', ')}.</p>}
          {input.planTick}
          <p role="status" className={cn('min-h-[1.25rem] text-[12px]', applyState.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {applyState.phase === 'error' ? applyState.message : applyState.phase === 'writing' ? 'Scrivo…' : applyState.phase === 'done' ? 'Applicato.' : ''}
          </p>
          {input.planRow && <PlanRowBlock row={input.planRow} />}
        </div>
      ) : document.status === 'applied' && (input.planDone || input.planTick || input.planRow) ? (
        // After the write: the plan the document records, else the way to create it, else the operating plan's row.
        <div className="mt-3 flex flex-col gap-3">
          {input.planDone || input.planTick ? <AppliedPlanBlock input={input} /> : input.planRow && <PlanRowBlock row={input.planRow} />}
        </div>
      ) : null,
    footnote: null,
  };
}

/** «{model} · {date}» of the text's source — the review's report, else the strategy; null without text. */
export function modelAside(document: AllocationAdviceDocument): string | null {
  const source = document.report ?? document.strategy;
  return source ? `${source.model} · ${formatDate(source.finishedAt)}` : null;
}
