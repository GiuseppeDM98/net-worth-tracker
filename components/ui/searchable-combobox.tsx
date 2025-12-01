'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  color?: string;
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
}

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
}: SearchableComboboxProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options based on search query
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected option
  const selectedOption = options.find((opt) => opt.value === value);

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

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
    setSearchQuery('');
  };

  return (
    <div className="space-y-2">
      <div className="relative" ref={dropdownRef}>
        <Input
          id={id}
          placeholder={disabled ? placeholder : searchPlaceholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsDropdownOpen(true);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          disabled={disabled}
        />
        {isDropdownOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-left',
                    value === option.value && 'bg-gray-100 dark:bg-gray-700'
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.color && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="flex-1">{option.label}</span>
                  {value === option.value && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {showBadge && selectedOption && value !== '' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
          {selectedOption.color && (
            <div
              className="w-3 h-3 rounded-full border border-gray-300"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          <span className="text-sm font-medium">{selectedOption.label}</span>
          {onClear && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full p-0.5 transition-colors"
              aria-label="Rimuovi selezione"
            >
              <X className="h-3 w-3 text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
