'use client';

import { useState, useRef, useEffect, useId, type ReactNode, type ChangeEvent } from 'react';
import { Check, X, Plus, SearchX, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { usePopperSheet } from '@/components/ui/popper-sheet';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  color?: string;
  /** Optional rendered icon shown in the dropdown and as left adornment when selected. */
  icon?: ReactNode;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  /**
   * The field's name («Categoria», «Strumento»): the title of the sheet a phone opens, and what
   * its search field is named after. The host's `<Label htmlFor={id}>` still names the control.
   */
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  showBadge?: boolean;
  onClear?: () => void;
  id?: string;
  /** When provided, renders a "+ Aggiungi [name]" item at the bottom of the dropdown. */
  onCreateOption?: (searchQuery: string) => void;
  /** Label for the create item when no search query is typed (default: "Aggiungi"). */
  createOptionLabel?: string;
  /** A refused field: the input takes `aria-invalid`, so a form's refusal can mark and focus it. */
  'aria-invalid'?: boolean;
  /** Extra classes on the input — a 44px height on a phone, where the modal is a drawer. */
  className?: string;
}

/**
 * Searchable combobox with dropdown filtering and optional color badges.
 *
 * Above 768px a text input filters the options as the user types, the list floating under it.
 * Below (owner, 2026-11-06: «every dropdown in a separate window on a phone», the width at which
 * `ResponsiveModal` is a drawer) the control is a button that opens a bottom-sheet `Drawer` with
 * the search field at its top and thumb-sized rows — the same `Drawer` the modal uses, so a
 * category picked inside a form on a phone is a sheet over a sheet, as `MultiSelect` already is.
 * The search field is not focused on open (doc/guide/dialog.md: below 769px nothing takes the
 * focus, or the keyboard covers the list on every opening); it is one tap away.
 *
 * @param options - Array of selectable options with value, label, and optional color
 * @param value - Currently selected option value
 * @param onValueChange - Callback fired when selection changes
 * @param label - The field's name: the sheet's title
 * @param placeholder - Text shown when no option is selected (default: "Seleziona...")
 * @param searchPlaceholder - Text shown in input when focused (default: "Cerca...")
 * @param disabled - Disables the input and prevents interaction
 * @param emptyMessage - Text shown when no options match search query
 * @param showBadge - Display selected option as badge below input (default: true)
 * @param onClear - Optional callback to clear selection (enables clear button in badge)
 * @param id - HTML id attribute for the input element
 */
export function SearchableCombobox({
  options,
  value,
  onValueChange,
  label,
  placeholder = 'Seleziona...',
  searchPlaceholder = 'Cerca...',
  disabled = false,
  emptyMessage = 'Nessun risultato trovato',
  showBadge = true,
  onClear,
  id,
  onCreateOption,
  createOptionLabel = 'Aggiungi',
  'aria-invalid': ariaInvalid,
  className,
}: Readonly<SearchableComboboxProps>) {
  // === State Management ===

  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sheet = usePopperSheet();
  const sheetId = useId();

  // === Filtering and Display Logic ===

  // Filter options based on search query
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Hide "Aggiungi" when the search query exactly matches an existing option
  const hasExactMatch = searchQuery.trim().length > 0 &&
    options.some((opt) => opt.label.toLowerCase() === searchQuery.trim().toLowerCase());

  // Get selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Calculate display value: show selected label when not focused, search query when focused
  const displayValue = isFocused ? searchQuery : (selectedOption?.label || '');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup blur timeout on unmount
  useEffect(() => () => { if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current); }, []);

  // === Event Handlers ===

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setIsDropdownOpen(false);
    setSearchQuery('');
    setIsFocused(false);
  };

  const handleCreate = () => {
    const name = searchQuery.trim();
    setIsDropdownOpen(false);
    setSearchQuery('');
    setIsFocused(false);
    onCreateOption?.(name);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setIsDropdownOpen(true);
  };

  const handleBlur = () => {
    // Use 200ms delay to allow click events on dropdown items to register
    // before the blur event closes the dropdown. Without this delay, clicking
    // an option would trigger blur first, closing the dropdown and preventing
    // the click handler from firing.
    blurTimeoutRef.current = setTimeout(() => {
      setIsFocused(false);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }, 200);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!isDropdownOpen) {
      setIsDropdownOpen(true);
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
    setSearchQuery('');
  };

  // Icon of the currently selected option (only shown when not focused).
  const selectedIcon: ReactNode | null = !isFocused ? (selectedOption?.icon ?? null) : null;

  const rows = (
    <OptionRows
      options={filteredOptions}
      value={value}
      onSelect={handleSelect}
      onCreate={onCreateOption ? handleCreate : undefined}
      showCreate={!!onCreateOption && !hasExactMatch}
      createLabel={searchQuery.trim() ? `${createOptionLabel} "${searchQuery.trim()}"` : createOptionLabel}
      emptyMessage={emptyMessage}
      size={sheet ? 'sheet' : 'dense'}
    />
  );

  // === Rendering ===

  const badge = showBadge && selectedOption && value !== '' && (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
      {selectedOption.icon ? (
        <span className="text-muted-foreground flex-shrink-0">{selectedOption.icon}</span>
      ) : selectedOption.color ? (
        <div
          className="w-3 h-3 rounded-full border border-gray-300"
          style={{ backgroundColor: selectedOption.color }}
        />
      ) : null}
      <span className="text-sm font-medium">{selectedOption.label}</span>
      {onClear && (
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto hover:bg-accent rounded-full p-0.5 transition-colors"
          aria-label="Rimuovi selezione"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );

  if (sheet) {
    return (
      <div className="space-y-2">
        {/* noBodyStyles / repositionInputs={false}: the same two settings as ResponsiveModal's
            drawer (the keyboard would shift the sheet and not restore it). The trigger is a Radix
            Trigger so the focus comes back to it when the sheet closes. */}
        <Drawer
          open={isDropdownOpen}
          onOpenChange={(open) => {
            setIsDropdownOpen(open);
            if (!open) setSearchQuery('');
          }}
          noBodyStyles
          repositionInputs={false}
        >
          <DrawerTrigger asChild>
            <button
              type="button"
              id={id}
              disabled={disabled}
              // A combobox that opens a dialog, like the Select's trigger: the role takes
              // `aria-invalid`, which a plain button does not.
              role="combobox"
              aria-haspopup="dialog"
              aria-expanded={isDropdownOpen}
              aria-controls={sheetId}
              aria-invalid={ariaInvalid || undefined}
              className={cn(
                // The Input's own shell, so a field and a picker read as one kind of control.
                'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
              )}
            >
              {selectedOption?.icon && (
                <span className="shrink-0 text-muted-foreground">{selectedOption.icon}</span>
              )}
              <span className={cn('min-w-0 flex-1 truncate', !selectedOption && 'text-muted-foreground')}>
                {selectedOption?.label ?? placeholder}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
            </button>
          </DrawerTrigger>
          <DrawerContent id={sheetId} minHeight="medium">
            <DrawerHeader className="border-b px-4 pb-3 pt-2 text-left">
              <DrawerTitle className="text-[20px] font-semibold leading-[1.25] tracking-[-0.01em]">{label}</DrawerTitle>
              <DrawerDescription className="sr-only">Cerca nell’elenco e tocca una voce per sceglierla.</DrawerDescription>
              <Input
                aria-label={`Cerca ${label.toLowerCase()}`}
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="mt-2 h-11"
              />
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto py-2">{rows}</div>
          </DrawerContent>
        </Drawer>
        {badge}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative" ref={dropdownRef}>
        {/* Left icon adornment — shown when an option with an icon is selected */}
        {selectedIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {selectedIcon}
          </span>
        )}
        <Input
          id={id}
          aria-invalid={ariaInvalid || undefined}
          placeholder={isFocused ? searchPlaceholder : placeholder}
          value={displayValue}
          onChange={handleSearchChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(selectedIcon && 'pl-9', className)}
        />
        {isFocused && isDropdownOpen && !disabled && (
          // Use bg-popover + border-border to match the shadcn Select dropdown appearance
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground">
            {rows}
          </div>
        )}
      </div>
      {badge}
    </div>
  );
}

interface OptionRowsProps {
  options: ComboboxOption[];
  value: string;
  onSelect: (value: string) => void;
  onCreate?: () => void;
  showCreate: boolean;
  createLabel: string;
  emptyMessage: string;
  /** `dense` under the desktop input (32px rows), `sheet` in the phone's drawer (44px rows). */
  size: 'dense' | 'sheet';
}

/** The option list, shared by the floating dropdown and the sheet: rows, the create row, the absence. */
function OptionRows({ options, value, onSelect, onCreate, showCreate, createLabel, emptyMessage, size }: OptionRowsProps) {
  const rowClass = cn(
    'w-full flex items-center gap-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-left',
    size === 'sheet' ? 'min-h-11 px-4 text-base' : 'px-3 py-2 text-sm',
  );
  return (
    <>
      {options.length === 0 && !onCreate ? (
        // A dropdown is not a tile: the absence is one centred line, no eyebrow above it.
        <div className="p-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <SearchX className="w-4 h-4 shrink-0" aria-hidden="true" />
          {emptyMessage}
        </div>
      ) : (
        options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(rowClass, value === option.value && 'bg-accent text-accent-foreground')}
            onClick={() => onSelect(option.value)}
          >
            {option.icon ? (
              <span className="flex-shrink-0 text-muted-foreground">{option.icon}</span>
            ) : option.color ? (
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
                style={{ backgroundColor: option.color }}
              />
            ) : null}
            <span className="flex-1">{option.label}</span>
            {value === option.value && (
              <Check className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
            )}
          </button>
        ))
      )}
      {onCreate && showCreate && (
        <button
          type="button"
          className={cn(rowClass, 'border-t border-border/50 text-primary')}
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{createLabel}</span>
        </button>
      )}
    </>
  );
}
