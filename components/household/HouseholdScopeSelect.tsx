'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HouseholdScopeOption } from '@/lib/hooks/useHouseholdScopeFilter';
import { cn } from '@/lib/utils';

interface HouseholdScopeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: HouseholdScopeOption[];
  label?: string;
  className?: string;
  triggerClassName?: string;
}

export function HouseholdScopeSelect({
  value,
  onValueChange,
  options,
  label = 'Vista',
  className,
  triggerClassName,
}: HouseholdScopeSelectProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
