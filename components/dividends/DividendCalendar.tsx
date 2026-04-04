/**
 * Monthly calendar view for dividend payment dates
 *
 * Features:
 * - Displays dividends by payment date in a monthly grid (6 weeks × 7 days)
 * - Month navigation with previous/next controls
 * - Italian locale (month names, week starts on Monday)
 * - Click a date to see detailed dividend list in dialog
 * - Bidirectional sync: clicking a date filters the table view to that date
 *
 * Design decisions:
 * - Always shows 6 weeks (42 cells) for consistent UI height
 * - Week starts on Monday (Italian/ISO standard)
 * - Shows overflow days from previous/next month in muted style
 * - Uses Italy timezone for all date operations to avoid server/client inconsistencies
 *
 * Algorithm:
 * 1. Generate 42-day grid starting from Monday before first day of month
 * 2. Group dividends by payment date (YYYY-MM-DD key with Italy timezone)
 * 3. Render CalendarDayCell for each date with matching dividends
 * 4. Handle date clicks to open dialog and notify parent for table filtering
 */
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

// Italian month names (full)
const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// Italian day abbreviations (Monday to Sunday)
const ITALIAN_DAY_ABBR = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

interface DividendCalendarProps {
  dividends: Dividend[];
  onDateClick: (date: Date) => void;
  selectedDate?: Date | null;
}

export function DividendCalendar({ dividends, onDateClick, selectedDate }: DividendCalendarProps) {
  // Initialize to current month/year in Italy timezone
  const [currentMonth, setCurrentMonth] = useState(getItalyMonth());
  const [currentYear, setCurrentYear] = useState(getItalyYear());
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * Generate a 42-day calendar grid (6 weeks × 7 days) starting on Monday.
   * Includes overflow days from previous and next months.
   */
  const calendarGrid = useMemo(() => {
    const grid: Date[] = [];

    // First day of the month
    const firstDay = new Date(currentYear, currentMonth - 1, 1);

    // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    // Convert to ISO format (1 = Monday, 7 = Sunday)
    let dayOfWeek = firstDay.getDay();
    dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday becomes 7

    // Calculate start date (may be in previous month)
    // If month starts on Wednesday (3), we need Mon (1) and Tue (2) from previous month
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - (dayOfWeek - 1));

    // Generate 42 days (6 weeks to accommodate all possible month layouts)
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      grid.push(date);
    }

    return grid;
  }, [currentMonth, currentYear]);

  /**
   * Group dividends by payment date (YYYY-MM-DD key).
   * Uses Italy timezone to ensure consistent date keys across server and client.
   */
  const dividendsByDate = useMemo(() => {
    const grouped = new Map<string, Dividend[]>();

    dividends.forEach((dividend) => {
      // Convert paymentDate to Italy timezone
      const paymentDate = toDate(dividend.paymentDate);
      const { month, year } = getItalyMonthYear(paymentDate);
      const day = getItalyDate(paymentDate).getDate();

      // Create YYYY-MM-DD key (zero-padded)
      const key = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(dividend);
    });

    return grouped;
  }, [dividends]);

  /**
   * Get dividends for a specific date
   */
  const getDividendsForDate = (date: Date): Dividend[] => {
    const { month, year } = getItalyMonthYear(date);
    const day = date.getDate();
    const key = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return dividendsByDate.get(key) || [];
  };

  useEffect(() => {
    if (!selectedDate) return;

    const nextDate = getItalyDate(selectedDate);
    const { month, year } = getItalyMonthYear(nextDate);

    if (month !== currentMonth) {
      setCurrentMonth(month);
    }

    if (year !== currentYear) {
      setCurrentYear(year);
    }
  }, [selectedDate, currentMonth, currentYear]);

  /**
   * Handle previous month navigation
   */
  const handlePreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  /**
   * Handle next month navigation
   */
  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  /**
   * Handle date cell click
   * Opens dialog with dividend details and notifies parent to filter table
   */
  const handleDateClick = (date: Date) => {
    const dateDividends = getDividendsForDate(date);
    if (dateDividends.length > 0) {
      setDetailDate(date);
      setDialogOpen(true);
      onDateClick(date); // Notify parent to filter table by this date
    }
  };

  /**
   * Check if a date is today (in Italy timezone)
   */
  const isToday = (date: Date): boolean => {
    const today = getItalyDate();
    const checkDate = getItalyDate(date);
    return (
      checkDate.getDate() === today.getDate() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getFullYear() === today.getFullYear()
    );
  };

  /**
   * Check if a date is in the current displayed month
   */
  const isCurrentMonth = (date: Date): boolean => {
    const { month, year } = getItalyMonthYear(date);
    return month === currentMonth && year === currentYear;
  };

  // Count dividends in current month for empty state
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
      {/* Calendar header with month navigation */}
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
                {formatDate(selectedDate)} · {focusedDividends.length} {focusedDividends.length === 1 ? 'pagamento' : 'pagamenti'}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Netto previsto <span className="font-semibold text-foreground">{formatCurrency(focusedNetTotal)}</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Calendar grid */}
      <motion.div
        variants={chartShellSettle}
        initial="idle"
        animate="settle"
        className="overflow-hidden rounded-lg border border-border"
      >
        {/* Day headers (Monday to Sunday) */}
        <div className="grid grid-cols-7 bg-muted">
          {ITALIAN_DAY_ABBR.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-xs md:text-sm font-medium border-r border-border last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar day cells */}
        <div className="grid grid-cols-7">
          {calendarGrid.map((date, index) => {
            const dateDividends = getDividendsForDate(date);
            const normalizedDate = getItalyDate(date);
            const isSelected = selectedDateKey === `${normalizedDate.getFullYear()}-${normalizedDate.getMonth()}-${normalizedDate.getDate()}`;
            return (
              <CalendarDayCell
                key={index}
                date={date}
                isCurrentMonth={isCurrentMonth(date)}
                isToday={isToday(date)}
                isSelected={isSelected}
                dividends={dateDividends}
                onClick={handleDateClick}
              />
            );
          })}
        </div>
      </motion.div>

      {/* Empty state message */}
      {dividendsInCurrentMonth === 0 && (
        <EmptyState
          icon={<CalendarEmptyIcon />}
          title={`Nessun dividendo previsto per ${ITALIAN_MONTHS[currentMonth - 1]} ${currentYear}`}
        />
      )}

      {/* Dividend details dialog */}
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
