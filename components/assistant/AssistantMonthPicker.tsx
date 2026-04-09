'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssistantMonthSelectorValue } from '@/types/assistant';
import { MONTH_NAMES } from '@/lib/constants/months';

interface AssistantMonthPickerProps {
  value: AssistantMonthSelectorValue;
  options: AssistantMonthSelectorValue[];
  onChange: (value: AssistantMonthSelectorValue) => void;
  disabled?: boolean;
}

/**
 * Month/year selector for the assistant page.
 * Options are pre-computed by the parent via useMemo so this component stays pure.
 */
export function AssistantMonthPicker({ value, options, onChange, disabled }: AssistantMonthPickerProps) {
  return (
    <Select
      value={`${value.year}-${value.month}`}
      onValueChange={(raw) => {
        const [year, month] = raw.split('-').map(Number);
        onChange({ year, month });
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full" aria-label="Mese di riferimento">
        <SelectValue placeholder="Seleziona mese" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={`${option.year}-${option.month}`}
            value={`${option.year}-${option.month}`}
          >
            {MONTH_NAMES[option.month - 1]} {option.year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
