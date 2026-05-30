/**
 * PeriodPicker — rendering component
 *
 * All state/logic lives in usePeriodPicker (lib/hooks/usePeriodPicker.ts).
 * All types/helpers live in lib/utils/period.ts.
 *
 * Responsive:
 *   - Mobile  (< 640px): vaul Drawer bottom sheet, single-month calendar
 *   - Desktop (≥ 640px): Popover, two-month side-by-side calendar
 */
'use client';

import * as React from 'react';
import { addMonths, subMonths, format } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle,
  DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Calendar } from '@/components/ui/calendar';
import { Button, buttonVariants } from '@/components/ui/button';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { usePeriodPicker } from '@/lib/hooks/usePeriodPicker';
import { type Period, currentMonthPeriod, MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/ui/chip';

// ─── Re-exports for consumers (keeps import path stable) ─────────────────────

export type { Period } from '@/lib/utils/period';
export { periodLabel, periodToRange, currentMonthPeriod } from '@/lib/utils/period';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PeriodPickerProps {
  readonly value: Period;
  readonly onChange: (period: Period) => void;
  readonly availableYears?: number[];
  readonly className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PeriodPicker({ value, onChange, availableYears = [], className }: PeriodPickerProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');
  // Stable reference: preset labels are relative to «today» and don't change mid-session.
  const now = React.useMemo(() => new Date(), []);

  const {
    open, setOpen,
    calendarRange, calendarMonth, setCalendarMonth,
    fromText, toText,
    canApply, label, isCustom, rangeLabel,
    last3Years, last5Months,
    isCurrentMonthActive, isPrevMonthActive, isCurrentYearActive,
    handlePreset, handleRangeSelect, handleApply,
    handleFromTextChange, handleToTextChange,
  } = usePeriodPicker({ value, onChange, availableYears });

  // ── Shared: trigger button ─────────────────────────────────────────────────

  const triggerButton = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-label={`Periodo selezionato: ${label}`}
      className={cn(
        'justify-between gap-2 min-w-[190px] font-normal',
        isCustom && 'text-primary border-primary/40',
        className,
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </span>
      <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
    </Button>
  );

  // ── Shared: preset list (desktop vertical) ──────────────────────────────

  const presets = (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1 px-1">
        Scorciatoie
      </p>
      <PresetButton label="Questo mese" active={isCurrentMonthActive} onClick={() => handlePreset(currentMonthPeriod())} />
      <PresetButton
        label="Mese precedente"
        active={isPrevMonthActive}
        onClick={() => {
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          handlePreset({ kind: 'month', year: prev.getFullYear(), month: prev.getMonth() + 1 });
        }}
      />
      <PresetButton label="Quest'anno" active={isCurrentYearActive} onClick={() => handlePreset({ kind: 'year', year: now.getFullYear() })} />

      {last3Years.length > 0 && (
        <>
          <div className="border-t border-border my-1" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1 px-1">Anni</p>
          {last3Years.map(year => (
            <PresetButton
              key={year}
              label={String(year)}
              active={value.kind === 'year' && value.year === year}
              onClick={() => handlePreset({ kind: 'year', year })}
            />
          ))}
        </>
      )}

      <div className="border-t border-border my-1" />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1 px-1">Mesi</p>
      {last5Months.map(({ year, month }) => (
        <PresetButton
          key={`${year}-${month}`}
          label={`${MONTH_NAMES_SHORT[month - 1]} ${year}`}
          active={value.kind === 'month' && value.year === year && value.month === month}
          onClick={() => handlePreset({ kind: 'month', year, month })}
        />
      ))}
    </div>
  );

  // ── Mobile: chip preset list ───────────────────────────────────────────

  const mobilePresets = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
          Scorciatoie
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip label="Questo mese" active={isCurrentMonthActive} onClick={() => handlePreset(currentMonthPeriod())} />
          <Chip
            label="Mese prec."
            active={isPrevMonthActive}
            onClick={() => {
              const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              handlePreset({ kind: 'month', year: prev.getFullYear(), month: prev.getMonth() + 1 });
            }}
          />
          <Chip label="Quest'anno" active={isCurrentYearActive} onClick={() => handlePreset({ kind: 'year', year: now.getFullYear() })} />
        </div>
      </div>

      {last3Years.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Anni</p>
          <div className="flex flex-wrap gap-2">
            {last3Years.map(year => (
              <Chip
                key={year}
                label={String(year)}
                active={value.kind === 'year' && value.year === year}
                onClick={() => handlePreset({ kind: 'year', year })}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Mesi</p>
        <div className="flex flex-wrap gap-2">
          {last5Months.map(({ year, month }) => (
            <Chip
              key={`${year}-${month}`}
              label={`${MONTH_NAMES_SHORT[month - 1]} ${year}`}
              active={value.kind === 'month' && value.year === year && value.month === month}
              onClick={() => handlePreset({ kind: 'month', year, month })}
            />
          ))}
        </div>
      </div>
    </div>
  );

  // ── Shared: date text inputs + calendar ───────────────────────────────────

  const calendarSection = (numMonths: number) => {
    const isSingle = numMonths === 1;
    return (
      <div className="flex flex-col">
        <div className="flex items-end gap-2 px-3 pt-3 pb-2">
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="period-picker-from" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Da</label>
            <input
              id="period-picker-from"
              type="text"
              value={fromText}
              onChange={handleFromTextChange}
              placeholder="GG/MM/AAAA"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="pb-1.5 text-sm text-muted-foreground">–</span>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="period-picker-to" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">A</label>
            <input
              id="period-picker-to"
              type="text"
              value={toText}
              onChange={handleToTextChange}
              placeholder="GG/MM/AAAA"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Mobile: custom ← month → header replaces the built-in caption/nav */}
        {isSingle && (
          <div className="flex items-center justify-between px-3 pt-1 pb-0">
            <button
              type="button"
              aria-label="Mese precedente"
              onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
              className={cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium capitalize">
              {format(calendarMonth, 'MMMM yyyy', { locale: itLocale })}
            </span>
            <button
              type="button"
              aria-label="Mese successivo"
              onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
              className={cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <Calendar
          mode="range"
          selected={calendarRange}
          onSelect={handleRangeSelect}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          numberOfMonths={numMonths}
          className={cn('rounded-none', isSingle && 'pt-2')}
          {...(isSingle && {
            classNames: {
              nav: 'hidden',
              month_caption: 'hidden',
              // flex-1 on weekday/day fills the row evenly → range highlight forms a continuous band
              weekdays: 'flex',
              weekday: 'flex-1 text-muted-foreground font-normal text-[0.8rem] text-center',
              week: 'flex w-full mt-2',
              day: 'flex-1 h-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
              day_button: 'w-full h-9 p-0 font-normal aria-selected:opacity-100 inline-flex items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            },
          })}
        />
      </div>
    );
  };

  // ── Mobile: vaul Drawer bottom sheet ──────────────────────────────────────

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>Seleziona periodo</DrawerTitle>
            <DrawerDescription className="sr-only">
              Scegli un periodo preimpostato o seleziona un intervallo personalizzato dal calendario.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-2">
            {mobilePresets}

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">oppure</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 px-1">
              Intervallo personalizzato
            </p>
            <div className="border border-border rounded-lg overflow-hidden">
              {calendarSection(1)}
              <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                {rangeLabel}
              </div>
            </div>
          </div>

          <DrawerFooter>
            <Button onClick={handleApply} disabled={!canApply}>Applica</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop: Popover ──────────────────────────────────────────────────────

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 overflow-hidden">
        <div className="flex">
          <div className="flex flex-col border-r border-border">
            {calendarSection(2)}
            <div className="border-t border-border px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{rangeLabel}</span>
              <Button size="sm" onClick={handleApply} disabled={!canApply}>Applica</Button>
            </div>
          </div>
          <div className="p-3 min-w-[150px]">
            {presets}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── PresetButton (desktop vertical list) ────────────────────────────────────

function PresetButton({ label, active, onClick }: Readonly<{ label: string; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
      )}
    >
      {label}
    </button>
  );
}
