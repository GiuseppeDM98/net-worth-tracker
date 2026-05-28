'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dividend } from '@/types/dividend';
import { CalendarDayCell } from './CalendarDayCell';
import { DividendDetailsDialog } from './DividendDetailsDialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getItalyMonth, getItalyYear, getItalyDate, getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { EmptyState, CalendarEmptyIcon } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { chartShellSettle, metricSettleTransition } from '@/lib/utils/motionVariants';

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

// Abbreviated labels shown in the column header row
const ITALIAN_DAY_ABBR = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Full names used in aria-label on each column header for screen readers
const ITALIAN_DAY_FULL = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
];

interface DividendCalendarProps {
  dividends: Dividend[];
  onDateClick: (date: Date) => void;
  selectedDate?: Date | null;
}

export function DividendCalendar({ dividends, onDateClick, selectedDate }: DividendCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(getItalyMonth());
  const [currentYear, setCurrentYear] = useState(getItalyYear());
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * 42-day grid (6 weeks × 7 days) starting on Monday.
   * Always 6 rows so the calendar height stays constant regardless of month layout.
   */
  const calendarGrid = useMemo(() => {
    const grid: Date[] = [];
    const firstDay = new Date(currentYear, currentMonth - 1, 1);

    // Convert JS day-of-week (0=Sun) to ISO (1=Mon, 7=Sun)
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
    const day = date.getDate();
    const key = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return dividendsByDate.get(key) || [];
  };

  // Sync calendar view when the parent sets a selectedDate in a different month
  useEffect(() => {
    if (!selectedDate) return;
    const nextDate = getItalyDate(selectedDate);
    const { month, year } = getItalyMonthYear(nextDate);
    if (month !== currentMonth) setCurrentMonth(month);
    if (year !== currentYear) setCurrentYear(year);
  }, [selectedDate, currentMonth, currentYear]);

  const handlePreviousMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const handleDateClick = (date: Date) => {
    const dateDividends = getDividendsForDate(date);
    if (dateDividends.length > 0) {
      setDetailDate(date);
      setDialogOpen(true);
      onDateClick(date);
    }
  };

  const isToday = (date: Date): boolean => {
    const today = getItalyDate();
    const checkDate = getItalyDate(date);
    return (
      checkDate.getDate() === today.getDate() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (date: Date): boolean => {
    const { month, year } = getItalyMonthYear(date);
    return month === currentMonth && year === currentYear;
  };

  const dividendsInCurrentMonth = calendarGrid.filter(date => {
    if (!isCurrentMonth(date)) return false;
    return getDividendsForDate(date).length > 0;
  }).length;

  const selectedDateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : null;

  const focusedDividends = selectedDate ? getDividendsForDate(selectedDate) : [];
  const focusedNetTotal = focusedDividends.reduce((sum, div) => sum + (div.netAmountEur ?? div.netAmount), 0);

  return (
    <div className="space-y-4">
      {/* Month navigation header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h3
              key={`${currentYear}-${currentMonth}`}
              className="text-lg font-semibold"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={metricSettleTransition}
            >
              {ITALIAN_MONTHS[currentMonth - 1]} {currentYear}
            </motion.h3>
          </AnimatePresence>
          <p className="text-xs text-muted-foreground">
            {dividendsInCurrentMonth === 0
              ? 'Nessun pagamento previsto nel mese visualizzato'
              : `${dividendsInCurrentMonth} ${dividendsInCurrentMonth === 1 ? 'giorno con pagamento' : 'giorni con pagamenti'} nel mese`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePreviousMonth}
            aria-label="Mese precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextMonth}
            aria-label="Mese successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedDate && focusedDividends.length > 0 && (
        <motion.div
          variants={chartShellSettle}
          initial="idle"
          animate="settle"
          className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2"
        >
          <div className="flex flex-col gap-1 desktop:flex-row desktop:items-center desktop:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Focus calendario
              </p>
              <p className="text-sm font-medium">
                {formatDate(selectedDate)} · {focusedDividends.length}{' '}
                {focusedDividends.length === 1 ? 'pagamento' : 'pagamenti'}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Netto previsto{' '}
              <span className="font-semibold text-foreground">{formatCurrency(focusedNetTotal)}</span>
            </p>
          </div>
        </motion.div>
      )}

      {/*
        role="grid" exposes this as a navigable calendar grid to screen readers.
        The header row uses role="columnheader" and each week uses role="row"
        so AT can announce position as "row X, column Y" while navigating.
      */}
      <motion.div
        role="grid"
        aria-label="Calendario pagamenti dividendi"
        variants={chartShellSettle}
        initial="idle"
        animate="settle"
        className="overflow-hidden rounded-lg border border-border"
      >
        {/* Column headers */}
        <div role="row" className="grid grid-cols-7 bg-muted">
          {ITALIAN_DAY_ABBR.map((day, idx) => (
            <div
              key={day}
              role="columnheader"
              aria-label={ITALIAN_DAY_FULL[idx]}
              className="p-2 text-center text-xs desktop:text-sm font-medium border-r border-border last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Six week rows — slicing the flat 42-cell grid into role="row" groups */}
        {Array.from({ length: 6 }, (_, weekIdx) => (
          <div key={weekIdx} role="row" className="grid grid-cols-7">
            {calendarGrid.slice(weekIdx * 7, weekIdx * 7 + 7).map((date, dayIdx) => {
              const dateDividends = getDividendsForDate(date);
              const normalizedDate = getItalyDate(date);
              const isSelected =
                selectedDateKey ===
                `${normalizedDate.getFullYear()}-${normalizedDate.getMonth()}-${normalizedDate.getDate()}`;

              // Build full accessible label so AT announces date + payment count
              const { month, year } = getItalyMonthYear(date);
              const dayNum = date.getDate();
              const ariaLabel = `${dayNum} ${ITALIAN_MONTHS[month - 1]} ${year}${
                dateDividends.length > 0
                  ? ` — ${dateDividends.length} ${dateDividends.length === 1 ? 'pagamento' : 'pagamenti'}`
                  : ''
              }`;

              return (
                <CalendarDayCell
                  key={weekIdx * 7 + dayIdx}
                  date={date}
                  isCurrentMonth={isCurrentMonth(date)}
                  isToday={isToday(date)}
                  isSelected={isSelected}
                  dividends={dateDividends}
                  onClick={handleDateClick}
                  ariaLabel={ariaLabel}
                />
              );
            })}
          </div>
        ))}
      </motion.div>

      {dividendsInCurrentMonth === 0 && (
        <EmptyState
          icon={<CalendarEmptyIcon />}
          title={`Nessun dividendo previsto per ${ITALIAN_MONTHS[currentMonth - 1]} ${currentYear}`}
        />
      )}

      {detailDate && (
        <DividendDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          date={detailDate}
          dividends={getDividendsForDate(detailDate)}
        />
      )}
    </div>
  );
}
