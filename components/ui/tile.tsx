import type { ReactNode } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Narrative } from '@/lib/utils/narrative';
import { sectionPanelId, sectionTriggerId } from '@/lib/utils/mobileSections';
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NarrativeText } from '@/components/ui/narrative-text';

/**
 * A row of the small-screen composition, as `useMobileSections().collapse(id)` hands it to a
 * tile (The Closed-Row Rule, doc/mobile/MOB-02 § 4.2). The same object until the row changes.
 */
export interface TileCollapse {
  /** The `section`'s id; the trigger is `<id>-trigger`, the panel `<id>-panel`. */
  id: string;
  open: boolean;
  /** Open now, or opened once in this visit: the content is in the DOM and stays. */
  mounted: boolean;
  /** The read behind the tile failed: red eyebrow, open on every visit until dismissed. */
  failed: boolean;
  onOpenChange(open: boolean): void;
}

interface TileBaseProps {
  /** The tile's question, as the small uppercase label. */
  eyebrow: string;
  /** Short context on the right of the eyebrow (a period, a count, a scope). */
  aside?: ReactNode;
  /**
   * What a CLOSED row says beside its eyebrow, in words — «per mese», «3 note» — never an amount
   * nor a count of figures (The Closed-Row Rule). Ignored without `collapse`.
   */
  asideWhenClosed?: string;
  /** The one-line reading under the eyebrow: the answer in words, before the numbers. */
  reading?: Narrative | null;
  /** Optional accessible label for the section; defaults to the eyebrow. */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A tile is either the open tile of every width (an optional anchor `id`) or a row of the phone
 * composition, whose `section` takes `collapse.id`: passing both ids is a type error.
 */
type TileProps = TileBaseProps &
  ({ collapse: TileCollapse; id?: never } | { collapse?: undefined; id?: string });

/**
 * A text action inside a tile's 11px footer («Aggiungi conto», «Mostra tutte», a link to the
 * page that owns the depth): the words stay 11px, the TARGET does not — 32px on a pointer (the
 * dense-list floor), 44px on touch — through vertical padding folded back by a negative margin,
 * so the footer's rhythm is unchanged (measured 75×17 and 60×17 on 2026-09-14).
 */
export const TILE_FOOTER_ACTION_CLASS =
  'inline-flex min-h-8 -my-2 items-center text-foreground underline-offset-2 hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:-my-3.5';

/** The eyebrow every tile, every hero and the compact page header share. */
export const TILE_EYEBROW_CLASS =
  'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

/** A smaller eyebrow for labels INSIDE a tile (a KPI name, a list title). */
export const TILE_SUB_EYEBROW_CLASS =
  'text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/**
 * Grid-cell wrapper for a tile: the tile stretches to the row height so `mt-auto` footers
 * align across a row. Pair with the desktop span (`desktop:col-span-N`). Never an `order-*`: the
 * DOM order is the reading order on every width (doc/mobile/README.md § 9, decisions 1 and 11).
 */
export const TILE_CELL_CLASS = 'flex min-w-0 [&>section]:flex-1';

/**
 * The cell of a ROW of the composition: below `desktop:` it does not stretch, or at 768 a closed
 * row beside an open one would be pulled to the open one's height and read as an empty card
 * (doc/mobile/MOB-02 § 4.2). At 1440 it is `TILE_CELL_CLASS`.
 */
export const TILE_ROW_CELL_CLASS = `${TILE_CELL_CLASS} max-desktop:self-start`;

/**
 * The block of a tile that the verdict's strip already prints, hidden on a phone (The
 * Lifted-Figure Rule): a key from `liftedBlocks(strip, section)` takes this class.
 */
export const LIFTED_FIGURE_CLASS = 'max-tablet:hidden';

/** The card every tile and every error notice is made of. */
export const TILE_SURFACE_CLASS = 'flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-sm';

/** The curve of every row's opening: the 400/35 spring over 300 ms (`--ease-spring`, globals.css). */
const ROW_MOTION_CLASS = 'motion-safe:duration-300 motion-safe:ease-spring';

interface TileRowShellProps {
  collapse: TileCollapse;
  /** The trigger's label, already styled — the eyebrow, or an error notice's red eyebrow with its icon. */
  eyebrow: ReactNode;
  ariaLabel: string;
  asideWhenClosed?: string;
  /**
   * The words beside the eyebrow while OPEN — a text aside stays in the trigger row at every state
   * (seen on 2026-10-10: moved into the panel it was clipped under the trigger and jumped on every
   * tap). A control cannot sit inside the button: it goes in the panel, first row.
   */
  asideWhenOpen?: string;
  /** `alert` on an error notice that is the page's live node; absent = a region named by `ariaLabel`. */
  role?: 'alert';
  className?: string;
  children: ReactNode;
}

/**
 * The shape of a closed-or-open row, shared by `Tile` and `ErrorNotice` so the census and the
 * specs read ONE contract (`scripts/mobileCensus.mjs`, `isClosedRow`): `section.rounded-2xl[id]`
 * → `h3 > button[aria-expanded][aria-controls=<id>-panel]`, then the panel.
 *
 * Radix's `Collapsible` gives the trigger its toggle and `data-state`; its `CollapsibleContent` is
 * NOT used — it unmounts the children when closed and offers no closing transition — so the panel
 * is a `grid-rows-[0fr] → [1fr]` of our own, `inert` while closed, with no `role` (the `section`
 * is already the landmark; a `region` per panel would double them, up to sixteen on the
 * Panoramica). `aria-controls` is written on the button AFTER Radix's spread, which would
 * otherwise name its own `contentId`.
 */
export function TileRowShell({ collapse, eyebrow, ariaLabel, asideWhenClosed, asideWhenOpen, role, className, children }: TileRowShellProps) {
  const { id, open } = collapse;
  const asideText = open ? asideWhenOpen : asideWhenClosed;
  return (
    <Collapsible open={open} onOpenChange={collapse.onOpenChange} asChild>
      <section id={id} role={role} aria-label={ariaLabel} className={cn(TILE_SURFACE_CLASS, 'scroll-mt-24', className)}>
        <h3 className="m-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              id={sectionTriggerId(id)}
              aria-expanded={open}
              aria-controls={sectionPanelId(id)}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-5 text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {eyebrow}
              <span className="flex shrink-0 items-center gap-2">
                {asideText && <span className="text-[10px] text-muted-foreground">{asideText}</span>}
                <ChevronDown
                  className={cn('h-4 w-4 text-muted-foreground motion-safe:transition-transform', ROW_MOTION_CLASS, open && 'rotate-180')}
                  aria-hidden="true"
                />
              </span>
            </button>
          </CollapsibleTrigger>
        </h3>
        <div
          id={sectionPanelId(id)}
          data-state={open ? 'open' : 'closed'}
          inert={!open}
          className={cn('grid motion-safe:transition-[grid-template-rows]', ROW_MOTION_CLASS, open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        >
          {/* The panel is there, the content is not until the first opening (The Closed-Row Rule):
              a never-opened row has an EMPTY panel. `min-h-0` with `overflow-hidden`: the child of a
              `0fr` track does not shrink below its min-content without it. The padding sits on the
              GRANDCHILD, or it stays visible at 0fr. */}
          {collapse.mounted && (
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col px-5 pb-5">{children}</div>
            </div>
          )}
        </div>
      </section>
    </Collapsible>
  );
}

/**
 * One tile of a redesigned page (DESIGN.md → §5 Tile). Every tile answers ONE question: the
 * eyebrow names it, the reading answers it in a sentence, the body shows the numbers. The
 * shell is the app's card (bg-card, 1px border, 16px radius, the Lift shadow) written as a
 * naked `section` so the tile controls its own flex column — `mt-auto` footers rely on it.
 *
 * With `collapse` (below `desktop:`, from `useMobileSections`) the tile is a ROW (The Closed-Row
 * Rule): the eyebrow becomes the trigger, `asideWhenClosed` stands beside it while closed and a
 * text `aside` while open (a control aside opens the panel instead), and the reading and the
 * children mount on the first opening and stay (`TileRowShell`). Without it, the tile of every
 * width — nothing changes at 1440.
 */
export function Tile(props: TileProps) {
  const { eyebrow, aside, asideWhenClosed, reading, ariaLabel, className, children, collapse } = props;

  if (collapse) {
    // A text aside keeps its place beside the eyebrow, open or closed; a control (NoteTile's
    // «Aggiungi») cannot nest in the trigger and opens the panel instead.
    const asideText = typeof aside === 'string' ? aside : undefined;
    const asideControl = asideText === undefined ? aside : undefined;
    const label = (
      <span className={cn(TILE_EYEBROW_CLASS, 'flex min-w-0 items-center gap-1.5', collapse.failed && 'text-destructive')}>
        {collapse.failed && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0">{eyebrow}</span>
        {collapse.failed && <span className="sr-only">, lettura fallita</span>}
      </span>
    );
    return (
      <TileRowShell
        collapse={collapse}
        eyebrow={label}
        ariaLabel={ariaLabel ?? eyebrow}
        asideWhenClosed={asideWhenClosed}
        asideWhenOpen={asideText}
        className={className}
      >
        {asideControl && <div className="mb-1 flex justify-end text-[10px] text-muted-foreground">{asideControl}</div>}
        {reading && <NarrativeText segments={reading} className="text-[13px] leading-[1.45] text-foreground" />}
        {children}
      </TileRowShell>
    );
  }

  return (
    <section id={props.id} aria-label={ariaLabel ?? eyebrow} className={cn(TILE_SURFACE_CLASS, 'p-5', className)}>
      {/* The head wraps: an aside that carries controls (a pill, a select, two actions) drops under the
          eyebrow on a phone instead of pushing the tile past the viewport. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        {/* A heading, not a paragraph: a page of nine tiles listed two headings (the title and the
            verdict) to a screen reader, which navigates a long page by them. `h3` under the verdict's
            `h2`; the class carries every metric, so nothing changes on screen. */}
        <h3 className={TILE_EYEBROW_CLASS}>{eyebrow}</h3>
        {aside && <div className="min-w-0 max-w-full shrink-0 text-[10px] text-muted-foreground">{aside}</div>}
      </div>
      {reading && (
        <NarrativeText segments={reading} className="mt-2 text-[13px] leading-[1.45] text-foreground" />
      )}
      {children}
    </section>
  );
}
