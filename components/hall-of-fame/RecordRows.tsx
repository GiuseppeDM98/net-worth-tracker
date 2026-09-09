import type { HallOfFameNote } from '@/types/hall-of-fame';
import type { RecordCategory, RecordEntry } from '@/lib/utils/hallOfFameSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NoteTrigger } from '@/components/hall-of-fame/NoteTrigger';

interface RecordRowsProps {
  rows: RecordEntry[];
  /** Decides how the figures are set — see `readingOf` below. */
  category: RecordCategory;
  /** How many positions to draw; the rest stay in the Dettaglio's full table. */
  limit?: number;
  /** Every note of the account; a row shows a marker when one is filed under this ranking. */
  notes?: HallOfFameNote[];
  sectionKey?: HallOfFameNote['sections'][number];
  onNoteClick?: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
  /** Width of the period column; a narrow tile passes a smaller one so the bar keeps a track. */
  labelClassName?: string;
  ariaLabel: string;
}

/**
 * How each ranking sets its figures.
 *
 * The rule lives here once: a net-worth change is a gain or a loss and takes the sign tokens
 * with a typographic sign; an income and a COST are neither — a cost is the size of a cost, not
 * a loss (AGENTS.md → Sign tokens mean gain and loss, and nothing else) — and a savings rate is
 * a proportion, so it is printed unsigned beside a signed amount.
 */
function readingOf(category: RecordCategory): { signedValue: boolean; signedPercentage: boolean } {
  switch (category) {
    case 'growth':
    case 'decline':
      return { signedValue: true, signedPercentage: true };
    case 'savings':
      return { signedValue: true, signedPercentage: false };
    default:
      return { signedValue: false, signedPercentage: false };
  }
}

/**
 * The bar takes the chart slot the app already uses for that quantity: `--chart-1` for net worth
 * and for spending, `--chart-2` for money coming in and money kept. Three tiles all painted with
 * the net-worth slot would say the three rankings measure the same thing.
 */
function barColorOf(category: RecordCategory): string {
  return category === 'income' || category === 'savings' ? 'var(--chart-2)' : 'var(--chart-1)';
}

const MINUS = '−';

/**
 * The ranked rows of a record board: position · period · 3px bar · figure · percentage.
 *
 * The bar encodes the RANK — the leading row fills the track — so a ranking where nothing
 * dominates still reads at a glance, the same rule `RankedRows` follows for compositions. It is
 * a separate component because a record is not a share of a total: it carries a position, its
 * value can be negative, and its percentage is a variation rather than a slice.
 */
export function RecordRows({
  rows,
  category,
  limit,
  notes,
  sectionKey,
  onNoteClick,
  labelClassName,
  ariaLabel,
}: RecordRowsProps) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (shown.length === 0) return null;

  const { signedValue, signedPercentage } = readingOf(category);
  const barColor = barColorOf(category);
  const maxValue = Math.max(...shown.map((row) => Math.abs(row.value)), 0);
  const labelWidth = labelClassName ?? 'w-[72px]';

  return (
    <ul className="flex flex-col divide-y divide-border" aria-label={ariaLabel}>
      {shown.map((row, index) => (
        <li key={row.key} className="group flex items-center gap-2.5 py-[9px]">
          <span className="w-[14px] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {index + 1}
          </span>

          <span className={cn('flex shrink-0 items-center gap-1.5 text-[13px] text-foreground', labelWidth)}>
            <span className="truncate">{row.label}</span>
            {row.isCurrent && <span className={cn(TILE_SUB_EYEBROW_CLASS, 'shrink-0')}>ora</span>}
          </span>

          <div className="h-[3px] min-w-[28px] flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
            <div
              className="h-full rounded-full"
              style={{
                width: `${maxValue > 0 ? (Math.abs(row.value) / maxValue) * 100 : 0}%`,
                background: barColor,
              }}
            />
          </div>

          <span
            className={cn(
              'shrink-0 text-right font-mono text-[13px] tabular-nums',
              signedValue ? signTextClass(row.value) : 'text-foreground',
            )}
          >
            {signedValue && (row.value >= 0 ? '+' : MINUS)}
            {cachedFormatCurrencyEUR(Math.abs(row.value), true)}
          </span>

          {row.percentage !== null && (
            <span className="w-[46px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {signedPercentage && (row.percentage >= 0 ? '+' : MINUS)}
              {formatPercentage(Math.abs(row.percentage), 1)}
            </span>
          )}

          {notes && sectionKey && onNoteClick && (
            <NoteTrigger
              notes={notes}
              sectionKey={sectionKey}
              year={row.year}
              month={row.month}
              onNoteClick={onNoteClick}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
