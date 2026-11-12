'use client';

/**
 * The Consulente's report read as a BOOK (2026-11-08, the owner: «una specie di libro, dove ogni
 * pagina ha un senso logico da sola e quelle dopo continuano il racconto»): one page at a time on
 * the path's scene card — the model's section, then the figures of the tile it explains —, turned
 * from the card's footer («Indietro» / «Avanti»), jumped to from the rail's labels from `desktop:`
 * and from «Indice» below it, each page an address (`?pagina=`, written with `replaceState` from the
 * gesture). «Applica» is the last page. Which pages exist and which text each carries is
 * `buildBookPages` (lib/utils/allocationAdviceBook.ts); the bodies are ConsulenteBookPages.tsx.
 *
 * The motion (DESIGN.md → The Path-Scene Rule): the WHOLE page slides along the turn and the page
 * that leaves is `inert` for its exit; the page shown at open does not slide, it cascades its
 * blocks once per JS session. No `initial={false}` on the `AnimatePresence`: it would block every
 * descendant's first animation, the cascade included — the first page's stillness is the sliding
 * wrapper's own `initial={false}`. After a turn the headline takes the focus (`useSceneTurn`), and
 * the card's top scrolls into view when it is above the page's scroll box.
 *
 * The page is remembered BY ID by the host (`ConsulenteClient`), so a revision that rewrites the
 * report leaves the reader where the request was made; a page that no longer exists is the cover.
 * The revision's draft lives here (`useRevisionDraft`, called once), so a turn keeps it.
 *
 * A printer gets every page but the two that act, in sequence (`ConsulenteBookPrint`); the grid is
 * `print:hidden`, and app/globals.css opens the shell for the printer only while a sheet is there.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import type { GoalPlan, planRoleChanges } from '@/lib/utils/allocationAdviceApply';
import { bookIndexOf, bookPageUrl, buildBookPages, turnDirection, type BookPage, type BookPageId } from '@/lib/utils/allocationAdviceBook';
import { BOOK_COPY, describeInterviewAside, REVISION_COPY, type ProposalClassRow } from '@/lib/utils/allocationAdviceNarrative';
import { cardItem, sceneVariants, sceneVariantsReduced, staggerContainer } from '@/lib/utils/motionVariants';
import type { PageVerdictModel } from '@/lib/utils/narrative';
import { useCompactLayout } from '@/lib/hooks/useCompactLayout';
import { AI_CONTROL_ACCENT_CLASS, AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { PathRail } from '@/components/ui/path-rail';
import { PageVerdict } from '@/components/ui/page-verdict';
import { NarrativeText } from '@/components/ui/narrative-text';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { TILE_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SCENE_CARD_CLASS, SCENE_GRID_CLASS } from './ConsulenteRun';
import { HEADLINE_CLASS } from './ConsulenteWizard';
import { InterviewBody } from './ConsulenteInterviewTile';
import { describeRevisionAside, RevisionBody, useRevisionDraft, type RevisionDraft } from './ConsulenteRevisionTile';
import {
  applyPieces,
  consulenteReportEntrance,
  goalsPieces,
  instrumentsPieces,
  MARKDOWN_COMPONENTS,
  modelAside,
  proposalPieces,
  risksPieces,
  rolesPieces,
  type ApplyPiecesInput,
  type BookPagePieces,
} from './ConsulenteBookPages';
import { useSceneTurn } from './useSceneTurn';
import type { useConsulenteRevision } from './useConsulenteRevision';

const BUTTON_CLASS = 'h-11 desktop:h-9';
const REMARK_PLUGINS = [remarkGfm];
const VERDICT_LABEL = 'Verdetto del Consulente';

export interface ConsulenteBookProps {
  ownerId: string;
  document: AllocationAdviceDocument;
  verdict: PageVerdictModel;
  proposal: AllocationAdviceProposal | null;
  rows: ProposalClassRow[];
  roles: ReturnType<typeof planRoleChanges>;
  goalPlan: GoalPlan | null;
  revision: ReturnType<typeof useConsulenteRevision>;
  /** «Applica»'s choices and state, owned by the report. */
  apply: ApplyPiecesInput;
  canApply: boolean;
  onApply: () => void;
  /** The page on screen by id (the host's memory); null or unknown is the cover. */
  pageId: string | null;
  onPageChange: (id: BookPageId) => void;
  onRedo: () => void;
}

const NO_PIECES: BookPagePieces = { aside: null, reading: null, body: null, footnote: null };

/** What the page draws besides its title and its text. `countUp` false prints the percentages at once (the print sheet). */
function piecesOf(page: BookPage, pages: readonly BookPage[], props: ConsulenteBookProps, draft: RevisionDraft, countUp: boolean): BookPagePieces {
  const { document, proposal } = props;
  switch (page.id) {
    case 'copertina':
      // «{model} · {date}» sits on the cover when the cover is the text's first page; in the degenerate book on `report`.
      return { ...NO_PIECES, aside: pages.some((other) => other.id === 'report') ? null : modelAside(document) };
    case 'report':
      return { ...NO_PIECES, aside: modelAside(document) };
    case 'allocazione':
      return proposal ? proposalPieces(props.rows, countUp) : NO_PIECES;
    case 'strumenti':
      return document.instruments ? instrumentsPieces(document.instruments) : NO_PIECES;
    case 'obiettivi':
      return proposal && proposal.goals.length > 0 ? goalsPieces(proposal) : NO_PIECES;
    case 'ruoli':
      return proposal ? rolesPieces(props.roles) : NO_PIECES;
    case 'rischi':
      return proposal ? risksPieces(proposal) : NO_PIECES;
    case 'colloquio':
      return { ...NO_PIECES, aside: describeInterviewAside(document.interview), body: <InterviewBody interview={document.interview} /> };
    case 'modifica':
      return { ...NO_PIECES, aside: describeRevisionAside(draft), reading: [{ text: REVISION_COPY.reading }], body: <RevisionBody draft={draft} /> };
    case 'applica':
      return applyPieces(props.apply);
    default:
      return NO_PIECES;
  }
}

/** The page's text, drawn as the report's text tile drew it before the book (2026-11-11). */
function PageText({ text }: { text: string }) {
  return (
    <div className="mt-3">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/**
 * The sliding page. A component of its own so it reads `useIsPresent()`: AnimatePresence renders
 * the leaving page with its last props, so its `inert` must come from inside it.
 */
function BookPageSlide({ pageId, direction, reduced, turned, cascade, onSettled, children }: { pageId: BookPageId; direction: 1 | -1; reduced: boolean; turned: boolean; cascade: boolean; onSettled: () => void; children: ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      data-scene={pageId}
      data-turn={direction === 1 ? 'forward' : 'back'}
      inert={!isPresent}
      custom={direction}
      variants={reduced ? sceneVariantsReduced : sceneVariants}
      initial={turned ? 'enter' : false}
      animate="center"
      exit="exit"
      onAnimationComplete={(definition) => {
        if (definition === 'center') onSettled();
      }}
    >
      <motion.div variants={staggerContainer} initial={!turned && cascade ? 'hidden' : false} animate="visible">
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ConsulenteBook(props: ConsulenteBookProps) {
  const { ownerId, document, verdict, proposal, roles, revision, pageId, onPageChange, onRedo } = props;
  const reduced = useReducedMotion() === true;
  const [indexOpen, setIndexOpen] = useState(false);
  // False until the first turn of this mount: the page shown at open neither slides nor re-cascades after it.
  const [turned, setTurned] = useState(false);
  const [plays] = useState(() => ({ cascade: !consulenteReportEntrance.cascade && !reduced, countUp: !consulenteReportEntrance.countUp && !reduced }));
  const targetRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const { direction, turn: sceneTurn, move, focusTarget } = useSceneTurn(targetRef);
  const draft = useRevisionDraft(ownerId, document, revision);
  const compact = useCompactLayout();

  useEffect(() => {
    consulenteReportEntrance.cascade = true;
  }, []);

  const pages = buildBookPages({
    markdown: document.report?.markdown ?? document.strategy?.markdown ?? null,
    source: document.report ? 'report' : document.strategy ? 'strategy' : null,
    hasProposal: proposal !== null,
    hasInstruments: document.instruments !== null,
    hasGoals: proposal !== null && proposal.goals.length > 0,
    hasRoles: proposal !== null && roles.changes.length + roles.unmatched.length > 0,
    hasInterview: (document.interview?.rounds.length ?? 0) > 0,
    hasReport: document.report !== null,
  });
  const index = bookIndexOf(pages, pageId);
  const page = pages[index];
  const isLast = index === pages.length - 1;
  const pieces = piecesOf(page, pages, props, draft, plays.countUp);
  const eyebrow = BOOK_COPY.eyebrow(index + 1, pages.length, page.title);
  const writing = props.apply.applyState.phase === 'writing';
  const done = props.apply.applyState.phase === 'done';

  const turnTo = (next: number, options?: { always?: boolean }) => {
    if (next === index || next < 0 || next >= pages.length) return;
    const card = cardRef.current;
    const scrollTop = window.document.getElementById('page-main')?.getBoundingClientRect().top ?? 0;
    if (card && card.getBoundingClientRect().top < scrollTop) card.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    move(
      turnDirection(index, next),
      () => {
        setTurned(true);
        onPageChange(pages[next].id);
        window.history.replaceState(null, '', bookPageUrl(window.location.pathname, window.location.search, pages[next].id));
      },
      options
    );
  };

  const eyebrowClass = cn(TILE_EYEBROW_CLASS, page.generated && AI_GENERATED_EYEBROW_CLASS);

  return (
    <>
      {/* `items-start`: a short page's card hugs its text instead of stretching to the ten-row rail (the footer
          would float mid-card); the path's grid keeps the stretch. */}
      <div className={cn(SCENE_GRID_CLASS, 'desktop:items-start print:hidden')} data-consulente-report="">
        <PathRail mode="book" pages={pages} current={index} interactive={!compact} onSelect={(next) => turnTo(next)} />
        <section
          ref={cardRef}
          aria-label={eyebrow}
          data-generated={page.generated ? '' : undefined}
          className={cn(TILE_SURFACE_CLASS, SCENE_CARD_CLASS, 'scroll-mt-4 desktop:scroll-mt-5', page.generated && AI_GENERATED_SURFACE_CLASS)}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <BookPageSlide key={page.id} pageId={page.id} direction={direction} reduced={reduced} turned={turned} cascade={plays.cascade} onSettled={() => focusTarget(sceneTurn)}>
              <motion.div variants={cardItem} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                {/* One h2 per page: the eyebrow, or on the cover the verdict's own. */}
                {page.id === 'copertina' ? <p className={eyebrowClass}>{eyebrow}</p> : <h2 className={eyebrowClass}>{eyebrow}</h2>}
                {pieces.aside && <div className="min-w-0 max-w-full shrink-0 text-[10px] text-muted-foreground">{pieces.aside}</div>}
              </motion.div>
              <motion.div variants={cardItem}>
                {page.id === 'copertina' ? (
                  <div ref={targetRef as RefObject<HTMLDivElement | null>} tabIndex={-1} className="mt-3 outline-none">
                    <PageVerdict verdict={verdict} ariaLabel={VERDICT_LABEL} />
                  </div>
                ) : (
                  <p ref={targetRef as RefObject<HTMLParagraphElement | null>} tabIndex={-1} className={cn(HEADLINE_CLASS, 'mt-3 outline-none')}>
                    {page.title}
                  </p>
                )}
              </motion.div>
              {pieces.reading && (
                <motion.div variants={cardItem}>
                  <NarrativeText segments={pieces.reading} className="mt-2 text-[13px] leading-[1.45] text-foreground" />
                </motion.div>
              )}
              {page.text !== null && (
                <motion.div variants={cardItem}>
                  <PageText text={page.text} />
                </motion.div>
              )}
              {pieces.body && <motion.div variants={cardItem}>{pieces.body}</motion.div>}
              {pieces.footnote && <motion.div variants={cardItem}>{pieces.footnote}</motion.div>}
              <motion.div variants={cardItem} className="mt-6 flex flex-col gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
                {/* The page's buttons first: below `tablet:` a column, the filled one on top; from it a row, «Avanti» rightmost. */}
                <div className="flex flex-col gap-2 tablet:order-2 tablet:flex-row">
                  {page.id === 'modifica' && (
                    <>
                      <Button type="button" className={cn(BUTTON_CLASS, 'border border-transparent tablet:order-2', AI_CONTROL_ACCENT_CLASS)} onClick={draft.primary.onClick} disabled={draft.primary.disabled}>
                        {draft.primary.label}
                      </Button>
                      {draft.showSkip && (
                        <Button type="button" variant="outline" className={cn(BUTTON_CLASS, 'tablet:order-1')} onClick={draft.skipQuestions} disabled={draft.revising}>
                          Salta le domande
                        </Button>
                      )}
                    </>
                  )}
                  {page.id === 'applica' && (
                    <>
                      {document.status === 'ready' && (
                        <Button type="button" className={cn(BUTTON_CLASS, 'tablet:order-2')} disabled={!props.canApply || writing || done} onClick={props.onApply}>
                          Applica alle impostazioni
                        </Button>
                      )}
                      <Button type="button" variant="outline" className={cn(BUTTON_CLASS, 'tablet:order-1')} onClick={onRedo}>
                        Rifai il percorso
                      </Button>
                    </>
                  )}
                  {!isLast && (
                    <Button type="button" variant={page.id === 'modifica' ? 'outline' : 'default'} className={cn(BUTTON_CLASS, 'tablet:order-3')} onClick={() => turnTo(index + 1)}>
                      {BOOK_COPY.next}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 tablet:order-1 tablet:flex">
                  <Button type="button" variant="outline" className={BUTTON_CLASS} disabled={index === 0} onClick={() => turnTo(index - 1)}>
                    {BOOK_COPY.back}
                  </Button>
                  <Button type="button" variant="outline" className={cn(BUTTON_CLASS, 'desktop:hidden')} onClick={() => setIndexOpen(true)}>
                    {BOOK_COPY.index}
                  </Button>
                </div>
              </motion.div>
            </BookPageSlide>
          </AnimatePresence>
        </section>
      </div>

      <ResponsiveModal
        open={indexOpen}
        onClose={() => setIndexOpen(false)}
        returnFocusTo={targetRef}
        eyebrow={BOOK_COPY.indexEyebrow(pages.length)}
        title={BOOK_COPY.indexTitle}
        reading={BOOK_COPY.indexReading}
      >
        <ol className="divide-y divide-border">
          {pages.map((row, rowIndex) => (
            <li key={row.id}>
              <button
                type="button"
                aria-current={rowIndex === index ? 'page' : undefined}
                onClick={() => {
                  setIndexOpen(false);
                  turnTo(rowIndex, { always: true });
                }}
                className={cn('flex min-h-11 w-full items-center text-left text-[14px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring', rowIndex === index && 'font-semibold')}
              >
                {rowIndex + 1} · {row.title}
              </button>
            </li>
          ))}
        </ol>
      </ResponsiveModal>

      <ConsulenteBookPrint pages={pages} verdict={verdict} piecesFor={(printed) => piecesOf(printed, pages, props, draft, false)} />
    </>
  );
}

/**
 * The print sheet: the verdict, then every page but «Chiedi una modifica» and «Applica», in order —
 * its title as an `h2`, the aside, the reading, the text, the figures, the footnote. No motion, no
 * accent, no button; the percentages printed at once. Hidden on screen.
 */
function ConsulenteBookPrint({ pages, verdict, piecesFor }: { pages: readonly BookPage[]; verdict: PageVerdictModel; piecesFor: (page: BookPage) => BookPagePieces }) {
  return (
    <div data-book-print="" className="hidden print:block">
      <PageVerdict verdict={verdict} ariaLabel={VERDICT_LABEL} />
      {pages
        .filter((page) => page.id !== 'modifica' && page.id !== 'applica')
        .map((page) => {
          const pieces = piecesFor(page);
          return (
            <section key={page.id} className="mt-6 break-inside-avoid-page">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                <h2 className={TILE_EYEBROW_CLASS}>{page.title}</h2>
                {pieces.aside && <div className="text-[10px] text-muted-foreground">{pieces.aside}</div>}
              </div>
              {pieces.reading && <NarrativeText segments={pieces.reading} className="mt-2 text-[13px] leading-[1.45] text-foreground" />}
              {page.text !== null && <PageText text={page.text} />}
              {pieces.body}
              {pieces.footnote}
            </section>
          );
        })}
    </div>
  );
}
