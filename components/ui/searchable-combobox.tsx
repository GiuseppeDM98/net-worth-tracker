'use client';

import { useState, useRef, useEffect, type ReactNode, type ChangeEvent } from 'react';
import { Check, X, Plus, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
}

/**
 * Searchable combobox with dropdown filtering and optional color badges.
 *
 * Provides a text input that filters options as the user types, with dropdown
 * selection and optional visual badge showing the current selection.
 *
 * @param options - Array of selectable options with value, label, and optional color
 * @param value - Currently selected option value
 * @param onValueChange - Callback fired when selection changes
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
  placeholder = 'Seleziona...',
  searchPlaceholder = 'Cerca...',
  disabled = false,
  emptyMessage = 'Nessun risultato trovato',
  showBadge = true,
  onClear,
  id,
  onCreateOption,
  createOptionLabel = 'Aggiungi',
}: Readonly<SearchableComboboxProps>) {
  // === State Management ===

  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // === Rendering ===

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
          placeholder={isFocused ? searchPlaceholder : placeholder}
          value={displayValue}
          onChange={handleSearchChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          className={selectedIcon ? 'pl-9' : undefined}
        />
        {isFocused && isDropdownOpen && !disabled && (
          // Use bg-popover + border-border to match the shadcn Select dropdown appearance
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground">
            {filteredOptions.length === 0 && !onCreateOption ? (
              // A dropdown is not a tile: the absence is one centred line, no eyebrow above it.
              <div className="p-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <SearchX className="w-4 h-4 shrink-0" aria-hidden="true" />
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left',
                    value === option.value && 'bg-accent text-accent-foreground'
                  )}
                  onClick={() => handleSelect(option.value)}
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
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))
            )}
            {onCreateOption && !hasExactMatch && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left border-t border-border/50 text-primary"
                onClick={handleCreate}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  {searchQuery.trim()
                    ? `${createOptionLabel} "${searchQuery.trim()}"`
                    : createOptionLabel}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
      {showBadge && selectedOption && value !== '' && (
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
      )}
    </div>
  );
}
