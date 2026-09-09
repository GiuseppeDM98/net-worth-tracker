/**
 * The payments calendar of Cashflow › Dividendi, INSIDE the Pagamenti tile (2026-08-23).
 *
 * It keeps everything a calendar needs — a 42-cell grid with explicit ARIA rows, month
 * navigation, a day opening its detail dialog — and loses its own card: the outer rounded
 * border and radius are gone, the cell hairlines ARE the frame, because a bordered box inside
 * a tile is a card inside a card (DESIGN.md → Table inside a Tile).
 *
 * The month header states what the month holds with received and announced kept apart, which
 * is the one thing the grid alone cannot say: a cell shows an amount, not whether that amount
 * has actually landed.
 */
'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dividend } from '@/types/dividend';
import { CalendarDayCell } from './CalendarDayCell';
import { DividendDetailsDialog } from './DividendDetailsDialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getItalyMonth, getItalyYear, getItalyDate, getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { metricSettleTransition } from '@/lib/utils/motionVariants';
import { isPaid, type PeriodBounds } from '@/lib/utils/dividendAnalytics';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cn } from '@/lib/utils';

// Abbreviated labels shown in the column header row
const ITALIAN_DAY_ABBR = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Full names used in aria-label on each column header for screen readers
const ITALIAN_DAY_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

interface DividendCalendarProps {
  dividends: Dividend[];
  /** "Now", passed in so the received/announced split matches the rest of the tab exactly. */
  now: Date;
  /**
   * The months the period covers. The calendar cannot browse outside them, because the rows it
   * draws are the period's slice: an arrow that leads to a month with no data would be showing
   * an empty month as a fact rather than as a boundary. When the window IS one month the arrows
   * are not rendered at all — the period picker is that axis, and a dead control is worse than
   * no control.
   */
  bounds: PeriodBounds;
}

export function DividendCalendar({ dividends, now, bounds }: DividendCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(getItalyMonth());
  const [currentYear, setCurrentYear] = useState(getItalyYear());
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * 42-day grid (6 weeks × 7 days) starting on Monday. Always 6 rows so the calendar height
   * stays constant regardless of the month's layout — inside a tile that also keeps the row
   * height of the grid stable while navigating.
   */
  const calendarGrid = useMemo(() => {
    const grid: Date[] = [];
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    let dayOfWeek = firstDay.getDay();
    dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - (dayOfWeek - 1));
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      grid.push(date);
    }
    return grid;
  }, [currentMonth, currentYear]);

  /** Group dividends by YYYY-MM-DD key (Italy timezone). */
  const dividendsByDate = useMemo(() => {
    const grouped = new Map<string, Dividend[]>();
    dividends.forEach((dividend) => {
      const paymentDate = toDate(dividend.paymentDate);
      const { month, year } = getItalyMonthYear(paymentDate);
      const day = getItalyDate(paymentDate).getDate();
      const key = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(dividend);
    });
    return grouped;
  }, [dividends]);

  const getDividendsForDate = (date: Date): Dividend[] => {
    const { month, year } = getItalyMonthYear(date);
    const key = `${year}-${month.toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    return dividendsByDate.get(key) || [];
  };

  const isCurrentMonth = (date: Date): boolean => {
    const { month, year } = getItalyMonthYear(date);
    return month === currentMonth && year === currentYear;
  };

  const isToday = (date: Date): boolean => {
    const today = getItalyDate(now);
    const checkDate = getItalyDate(date);
    return (
      checkDate.getDate() === today.getDate() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getFullYear() === today.getFullYear()
    );
  };

  // What the displayed month holds — received and announced counted apart, never summed.
  const monthSummary = useMemo(() => {
    let days = 0;
    let received = 0;
    let announced = 0;
    for (const date of calendarGrid) {
      if (!isCurrentMonth(date)) continue;
      const forDate = getDividendsForDate(date);
      if (forDate.length === 0) continue;
      days += 1;
      for (const dividend of forDate) {
        const net = dividend.netAmountEur ?? dividend.netAmount;
        if (isPaid(dividend, now)) received += net;
        else announced += net;
      }
    }
    return { days, received, announced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarGrid, dividendsByDate, now, currentMonth, currentYear]);

  // How far the arrows may travel — the period's own window.
  const atLowerBound =
    bounds.from !== null &&
    (currentYear < bounds.from.year || (currentYear === bounds.from.year && currentMonth <= bounds.from.month));
  const atUpperBound =
    bounds.to !== null &&
    (currentYear > bounds.to.year || (currentYear === bounds.to.year && currentMonth >= bounds.to.month));
  const showNavigation = !(atLowerBound && atUpperBound);

  // Navigating away from the open day's month closes its dialog HERE, in the handler that
  // causes it — an effect watching the month would be a setState inside an effect for a
  // consequence the click already knows about.
  const handlePreviousMonth = () => {
    setDialogOpen(false);
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else setCurrentMonth(currentMonth - 1);
  };

  const handleNextMonth = () => {
    setDialogOpen(false);
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else setCurrentMonth(currentMonth + 1);
  };

  const handleDateClick = (date: Date) => {
    if (getDividendsForDate(date).length === 0) return;
    setDetailDate(date);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${currentYear}-${currentMonth}`}
              className={TILE_SUB_EYEBROW_CLASS}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={metricSettleTransition}
            >
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1 text-[12px] leading-[1.45] text-muted-foreground">
            {monthSummary.days === 0 ? (
              'Nessun pagamento in questo mese.'
            ) : (
              <>
                <span className="font-mono tabular-nums">{monthSummary.days}</span>{' '}
                {monthSummary.days === 1 ? 'giorno con pagamenti' : 'giorni con pagamenti'}
                {monthSummary.received > 0 && (
                  <>
                    {' · '}
                    <span className="font-mono tabular-nums text-foreground">
                      {cachedFormatCurrencyEUR(monthSummary.received, true)}
                    </span>{' '}
                    incassati
                  </>
                )}
                {monthSummary.announced > 0 && (
                  <>
                    {', '}
                    <span className="font-mono tabular-nums">
                      {cachedFormatCurrencyEUR(monthSummary.announced, true)}
                    </span>{' '}
                    attesi
                  </>
                )}
              </>
            )}
          </p>
        </div>
        {showNavigation && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePreviousMonth}
              disabled={atLowerBound}
              aria-label="Mese precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextMonth}
              disabled={atUpperBound}
              aria-label="Mese successivo"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/*
        role="grid" exposes this as a navigable calendar grid; the header row uses
        role="columnheader" and each week is a role="row", so AT can announce position.
        The frame is the cells' own hairlines — no card inside the tile.
      */}
      <div role="grid" aria-label="Calendario pagamenti dividendi" className="border-l border-t border-border">
        <div role="row" className="grid grid-cols-7">
          {ITALIAN_DAY_ABBR.map((day, idx) => (
            <div
              key={day}
              role="columnheader"
              aria-label={ITALIAN_DAY_FULL[idx]}
              className={cn(TILE_SUB_EYEBROW_CLASS, 'border-b border-r border-border py-2 text-center')}
            >
              <span className="desktop:hidden">{day.charAt(0)}</span>
              <span className="hidden desktop:inline">{day}</span>
            </div>
          ))}
        </div>

        {Array.from({ length: 6 }, (_, weekIdx) => (
          <div key={weekIdx} role="row" className="grid grid-cols-7">
            {calendarGrid.slice(weekIdx * 7, weekIdx * 7 + 7).map((date, dayIdx) => {
              const dateDividends = getDividendsForDate(date);
              const announced = dateDividends.length > 0 && dateDividends.every((d) => !isPaid(d, now));
              const { month, year } = getItalyMonthYear(date);
              const ariaLabel = `${date.getDate()} ${MONTH_NAMES[month - 1]} ${year}${
                dateDividends.length > 0
                  ? ` — ${dateDividends.length} ${dateDividends.length === 1 ? 'pagamento' : 'pagamenti'}${
                      announced ? ' annunciato' : ''
                    }`
                  : ''
              }`;
              return (
                <CalendarDayCell
                  key={weekIdx * 7 + dayIdx}
                  date={date}
                  isCurrentMonth={isCurrentMonth(date)}
                  isToday={isToday(date)}
                  dividends={dateDividends}
                  onClick={handleDateClick}
                  ariaLabel={ariaLabel}
                  announced={announced}
                />
              );
            })}
          </div>
        ))}
      </div>

      {detailDate && (
        <DividendDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          date={detailDate}
          dividends={getDividendsForDate(detailDate)}
          now={now}
        />
      )}
    </div>
  );
}
