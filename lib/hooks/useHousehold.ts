'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getHouseholdConfig, getHouseholdAuditEntries } from '@/lib/services/householdService';

export function useHouseholdConfig(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.household.config(userId || ''),
    queryFn: () => getHouseholdConfig(userId!),
    enabled: !!userId,
  });
}

export function useHouseholdAuditEntries(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.household.audit(userId || ''),
    queryFn: () => getHouseholdAuditEntries(userId!),
    enabled: !!userId,
  });
}
