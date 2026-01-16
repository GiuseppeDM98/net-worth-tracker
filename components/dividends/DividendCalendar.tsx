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

import { useState, useMemo } from 'react';
import { Dividend } from '@/types/dividend';
import { CalendarDayCell } from './CalendarDayCell';
import { DividendDetailsDialog } from './DividendDetailsDialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getItalyMonth, getItalyYear, getItalyDate, getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';

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
}

export function DividendCalendar({ dividends, onDateClick }: DividendCalendarProps) {
  // Initialize to current month/year in Italy timezone
  const [currentMonth, setCurrentMonth] = useState(getItalyMonth());
  const [currentYear, setCurrentYear] = useState(getItalyYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
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
      setSelectedDate(date);
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

  return (
    <div className="space-y-4">
      {/* Calendar header with month navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {ITALIAN_MONTHS[currentMonth - 1]} {currentYear}
        </h3>
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

      {/* Calendar grid */}
      <div className="rounded-lg border border-border overflow-hidden">
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
            return (
              <CalendarDayCell
                key={index}
                date={date}
                isCurrentMonth={isCurrentMonth(date)}
                isToday={isToday(date)}
                dividends={dateDividends}
                onClick={handleDateClick}
              />
            );
          })}
        </div>
      </div>

      {/* Empty state message */}
      {dividendsInCurrentMonth === 0 && (
        <div className="text-center text-muted-foreground py-8 text-sm">
          Nessun dividendo previsto per {ITALIAN_MONTHS[currentMonth - 1]} {currentYear}
        </div>
      )}

      {/* Dividend details dialog */}
      {selectedDate && (
        <DividendDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          date={selectedDate}
          dividends={getDividendsForDate(selectedDate)}
        />
      )}
    </div>
  );
}
