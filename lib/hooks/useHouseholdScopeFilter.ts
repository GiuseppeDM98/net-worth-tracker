'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHouseholdConfig } from '@/lib/hooks/useHousehold';
import {
  getEffectiveHouseholdParticipants,
  getEffectiveOwnershipProfiles,
  isHouseholdEnabled,
  type HouseholdFilterScope,
} from '@/lib/utils/householdUtils';

const STORAGE_KEY = 'nwt_household_scope_filter';
export const HOUSEHOLD_SCOPE_ALL = '__all__';

export interface HouseholdScopeOption {
  value: string;
  label: string;
  description: string;
}

export function scopeKeyToFilterScope(value: string): HouseholdFilterScope {
  if (value.startsWith('profile:')) {
    return { kind: 'profile', id: value.slice('profile:'.length) };
  }
  if (value.startsWith('participant:')) {
    return { kind: 'participant', id: value.slice('participant:'.length) };
  }
  return { kind: 'all' };
}

export function useHouseholdScopeFilter(userId: string | undefined) {
  const { data: householdConfig } = useHouseholdConfig(userId);
  const householdEnabled = isHouseholdEnabled(householdConfig);
  const [selectedScopeKey, setSelectedScopeKeyState] = useState(HOUSEHOLD_SCOPE_ALL);

  const options = useMemo<HouseholdScopeOption[]>(() => {
    if (!householdEnabled) {
      return [{ value: HOUSEHOLD_SCOPE_ALL, label: 'Tutto', description: 'Vista personale standard' }];
    }

    const profiles = getEffectiveOwnershipProfiles(householdConfig);
    const participants = getEffectiveHouseholdParticipants(householdConfig);

    return [
      { value: HOUSEHOLD_SCOPE_ALL, label: 'Tutto', description: 'Patrimonio e cashflow complessivi' },
      ...profiles.map((profile) => ({
        value: `profile:${profile.id}`,
        label: `Profilo: ${profile.name}`,
        description: profile.splits.map((split) => `${split.participantName} ${split.percentage}%`).join(' / '),
      })),
      ...participants.map((participant) => ({
        value: `participant:${participant.id}`,
        label: `Persona: ${participant.name}`,
        description: 'Quota riproporzionata sui record condivisi',
      })),
    ];
  }, [householdConfig, householdEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSelectedScopeKeyState(saved);
    }
  }, []);

  useEffect(() => {
    if (!householdEnabled && selectedScopeKey !== HOUSEHOLD_SCOPE_ALL) {
      setSelectedScopeKeyState(HOUSEHOLD_SCOPE_ALL);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, HOUSEHOLD_SCOPE_ALL);
      }
      return;
    }

    if (!options.some((option) => option.value === selectedScopeKey)) {
      setSelectedScopeKeyState(HOUSEHOLD_SCOPE_ALL);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, HOUSEHOLD_SCOPE_ALL);
      }
    }
  }, [householdEnabled, options, selectedScopeKey]);

  const setSelectedScopeKey = useCallback((value: string) => {
    setSelectedScopeKeyState(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  }, []);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedScopeKey) ?? options[0],
    [options, selectedScopeKey]
  );
  const scope = useMemo(() => scopeKeyToFilterScope(selectedScopeKey), [selectedScopeKey]);
  const isScoped = scope.kind !== 'all';

  return {
    householdConfig,
    householdEnabled,
    options,
    selectedScopeKey,
    setSelectedScopeKey,
    selectedOption,
    scope,
    scopeLabel: selectedOption?.label ?? 'Tutto',
    isScoped,
  };
}
