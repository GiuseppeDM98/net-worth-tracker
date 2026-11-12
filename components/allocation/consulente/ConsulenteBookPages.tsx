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
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import type { GoalPlan, planRoleChanges } from '@/lib/utils/allocationAdviceApply';
import { BOOK_COPY, describeProposalReading, type ProposalClassRow } from '@/lib/utils/allocationAdviceNarrative';
import { formatCurrency, formatDate, formatNumberIt, formatPercentageIt, formatSignedPoints } from '@/lib/utils/formatters';
import type { Narrative } from '@/lib/utils/narrative';
import { useCountUp } from '@/lib/utils/useCountUp';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
}

/** «Applica»: one checkbox per thing it writes, the plans' warnings and the status line — only when ready with a proposal. */
export function applyPieces(input: ApplyPiecesInput): BookPagePieces {
  const { document, proposal, rows, roles, goalPlan, goalsCount, applyState } = input;
  return {
    aside: document.status === 'applied' && document.applied ? `applicato il ${formatDate(document.applied.at)}` : 'niente è scritto finché non confermi',
    reading: [{ text: document.status === 'applied' ? 'Il piano è già nelle impostazioni: rifai il percorso per cambiarlo.' : input.applySummary }],
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
          <p role="status" className={cn('min-h-[1.25rem] text-[12px]', applyState.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {applyState.phase === 'error' ? applyState.message : applyState.phase === 'writing' ? 'Scrivo…' : applyState.phase === 'done' ? 'Applicato.' : ''}
          </p>
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
