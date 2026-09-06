'use client';

/**
 * useCoastFireSettingsDraft — the Coast FIRE configuration form as one unit.
 *
 * Owns the local draft (age, target age, custom expenses, state pensions, IRPEF brackets), the
 * dirty check against the saved settings, and the save mutation. Everything the tab needs to
 * PROJECT — parsed ages, normalized pensions and brackets — comes out already derived, so the
 * preview stays instant: an edit updates the draft, the draft re-derives, the projection re-runs.
 *
 * WHY A HOOK AND NOT STATE IN THE TAB
 * The tab is an orchestrator over five sections; the form is one of them and its plumbing is
 * self-contained (thirteen pieces of state, one effect, one mutation, seven handlers). Keeping it
 * here is what lets the tab read as a page instead of a form.
 *
 * The dirty snapshot keys contain ONLY persisted fields (doc/guide/impostazioni.md § Settings — the FIVE places),
 * so re-deriving equivalent drafts never reads as an unsaved change.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';
import {
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
} from '@/lib/services/fireService';
import {
  addYearsToDate,
  buildPensionDraftIssues,
  buildPensionSnapshotKey,
  buildTaxBracketSnapshotKey,
  createLocalId,
  createPensionDraft,
  createTaxBracketDraft,
  isValidAge,
  parseOptionalInteger,
  parsePensionDrafts,
  parseTaxBracketDrafts,
  toPensionDrafts,
  toTaxBracketDrafts,
  type CoastFirePensionDraft,
  type CoastFireTaxBracketDraft,
  type PensionDraftIssue,
} from '@/lib/utils/coastFireView';
import type { CoastFirePensionInput, CoastFireTaxBracket } from '@/types/assets';
import type { Settings } from '@/types/settings';

const DEFAULT_COAST_RETIREMENT_AGE = 60;

interface DraftState {
  userAge: string;
  retirementAge: string;
  useCustomExpenses: boolean;
  customExpenses: string;
  pensions: CoastFirePensionDraft[];
  taxBrackets: CoastFireTaxBracketDraft[];
}

/** The form before the settings have loaded — the shape every field started from. */
const BLANK_DRAFT: DraftState = {
  userAge: '',
  retirementAge: String(DEFAULT_COAST_RETIREMENT_AGE),
  useCustomExpenses: false,
  customExpenses: '',
  pensions: [],
  taxBrackets: [],
};

/**
 * The saved settings as form strings. One function, so the seed and the "Annulla" button cannot
 * drift apart — they used to be two copies of the same six assignments.
 */
function toDraftState(settings: Settings | null | undefined): DraftState {
  return {
    userAge: settings?.userAge !== undefined ? String(settings.userAge) : '',
    retirementAge: String(settings?.coastFireRetirementAge ?? DEFAULT_COAST_RETIREMENT_AGE),
    useCustomExpenses: settings?.coastFireCustomExpenses !== undefined,
    customExpenses: settings?.coastFireCustomExpenses?.toString() ?? '',
    pensions: toPensionDrafts(settings?.coastFirePensions, settings?.userAge),
    taxBrackets: toTaxBracketDrafts(settings?.coastFireTaxBrackets),
  };
}

type PensionDraftField = keyof Omit<CoastFirePensionDraft, 'id'>;
type TaxBracketDraftField = keyof Omit<CoastFireTaxBracketDraft, 'id'>;

interface UseCoastFireSettingsDraftInput {
  settings: Settings | null | undefined;
  isLoadingSettings: boolean;
  /** The signed-in viewer's uid — what `setSettings` writes under. */
  userId: string | undefined;
  /** Whose data is displayed, for the cache invalidation key. */
  ownerId: string | undefined;
}

export interface CoastFireSettingsDraft {
  userAge: string;
  setUserAge: (value: string) => void;
  retirementAge: string;
  setRetirementAge: (value: string) => void;
  useCustomExpenses: boolean;
  setUseCustomExpenses: (value: boolean) => void;
  customExpenses: string;
  setCustomExpenses: (value: string) => void;
  pensions: CoastFirePensionDraft[];
  taxBrackets: CoastFireTaxBracketDraft[];

  addPension: () => void;
  updatePension: (pensionId: string, field: PensionDraftField, value: string) => void;
  removePension: (pensionId: string) => void;
  addTaxBracket: () => void;
  updateTaxBracket: (bracketId: string, field: TaxBracketDraftField, value: string) => void;
  removeTaxBracket: (bracketId: string) => void;

  /** null when the input is empty or outside 18-100 — the projection refuses to run on it. */
  currentAge: number | null;
  parsedRetirementAge: number | null;
  usesCustomExpenses: boolean;
  parsedCustomExpenses: number;
  previewPensions: CoastFirePensionInput[];
  previewTaxBrackets: CoastFireTaxBracket[];
  pensionIssues: PensionDraftIssue[];
  hasUnsavedChanges: boolean;

  isSaving: boolean;
  save: () => void;
  resetToSaved: () => void;
}

export function useCoastFireSettingsDraft({
  settings,
  isLoadingSettings,
  userId,
  ownerId,
}: UseCoastFireSettingsDraftInput): CoastFireSettingsDraft {
  const queryClient = useQueryClient();

  // The draft is stored WITH the settings it was seeded from and read back only while those are
  // still the saved ones: a new document (a save, another account) falls back to its own seed
  // with no effect re-seeding six fields (react-hooks/set-state-in-effect). While the settings
  // load the seed is the blank form, exactly as the initial state used to be.
  const seed = useMemo(
    () => (isLoadingSettings ? BLANK_DRAFT : toDraftState(settings)),
    [isLoadingSettings, settings]
  );
  const [draft, setDraft] = useState<{ seed: DraftState; values: DraftState } | null>(null);
  const values = draft?.seed === seed ? draft.values : seed;
  const { userAge, retirementAge, useCustomExpenses, customExpenses, pensions, taxBrackets } = values;

  /** Applies an edit to the current draft, seeding it from `seed` when it is the first one. */
  const updateDraft = (patch: (current: DraftState) => Partial<DraftState>) =>
    setDraft((previous) => {
      const current = previous?.seed === seed ? previous.values : seed;
      return { seed, values: { ...current, ...patch(current) } };
    });
  const setUserAge = (value: string) => updateDraft(() => ({ userAge: value }));
  const setRetirementAge = (value: string) => updateDraft(() => ({ retirementAge: value }));
  const setUseCustomExpensesState = (value: boolean) =>
    updateDraft(() => ({ useCustomExpenses: value }));
  const setCustomExpenses = (value: string) => updateDraft(() => ({ customExpenses: value }));
  const setPensions = (update: (current: CoastFirePensionDraft[]) => CoastFirePensionDraft[]) =>
    updateDraft((current) => ({ pensions: update(current.pensions) }));
  const setTaxBrackets = (
    update: (current: CoastFireTaxBracketDraft[]) => CoastFireTaxBracketDraft[]
  ) => updateDraft((current) => ({ taxBrackets: update(current.taxBrackets) }));

  const savedRetirementAge = settings?.coastFireRetirementAge ?? DEFAULT_COAST_RETIREMENT_AGE;

  const parsedCurrentAge = parseOptionalInteger(userAge);
  const parsedRetirementAgeRaw = parseOptionalInteger(retirementAge);
  const currentAge = isValidAge(parsedCurrentAge) ? parsedCurrentAge : null;
  const parsedRetirementAge = isValidAge(parsedRetirementAgeRaw) ? parsedRetirementAgeRaw : null;

  const parsedCustomExpenses = parseFloat(customExpenses);
  const usesCustomExpenses =
    useCustomExpenses && !isNaN(parsedCustomExpenses) && parsedCustomExpenses > 0;

  const previewPensions = useMemo(() => parsePensionDrafts(pensions), [pensions]);
  const previewTaxBrackets = useMemo(() => parseTaxBracketDrafts(taxBrackets), [taxBrackets]);
  const pensionIssues = useMemo(
    () => buildPensionDraftIssues(pensions, currentAge, parsedRetirementAge, new Date()),
    [currentAge, parsedRetirementAge, pensions]
  );

  const savedPensionSnapshotKey = useMemo(
    () => buildPensionSnapshotKey(normalizeCoastFirePensions(settings?.coastFirePensions)),
    [settings?.coastFirePensions]
  );
  const savedTaxBracketSnapshotKey = useMemo(
    () => buildTaxBracketSnapshotKey(normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets)),
    [settings?.coastFireTaxBrackets]
  );
  const previewPensionSnapshotKey = useMemo(
    () => buildPensionSnapshotKey(previewPensions),
    [previewPensions]
  );
  const previewTaxBracketSnapshotKey = useMemo(
    () => buildTaxBracketSnapshotKey(previewTaxBrackets),
    [previewTaxBrackets]
  );

  const hasUnsavedChanges =
    userAge !== (settings?.userAge !== undefined ? String(settings.userAge) : '') ||
    retirementAge !== String(savedRetirementAge) ||
    useCustomExpenses !== (settings?.coastFireCustomExpenses !== undefined) ||
    (useCustomExpenses && parsedCustomExpenses !== settings?.coastFireCustomExpenses) ||
    previewPensionSnapshotKey !== savedPensionSnapshotKey ||
    previewTaxBracketSnapshotKey !== savedTaxBracketSnapshotKey;

  const saveMutation = useMutation({
    mutationFn: (nextSettings: {
      userAge: number;
      coastFireRetirementAge: number;
      coastFireCustomExpenses?: number;
      coastFirePensions: CoastFirePensionInput[];
      coastFireTaxBrackets: CoastFireTaxBracket[];
    }) =>
      setSettings(userId!, {
        ...(settings ?? {}),
        targets: settings?.targets || getDefaultTargets(),
        ...nextSettings,
      }),
    onSuccess: () => {
      toast.success('Impostazioni Coast FIRE salvate con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: (error) => {
      console.error('Error saving Coast FIRE settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni Coast FIRE');
    },
  });

  /** Default decorrenza for a new row: the target age, which is where most users start editing. */
  const buildDefaultPensionDate = (): string => {
    if (currentAge !== null && parsedRetirementAge !== null) {
      return addYearsToDate(new Date(), Math.max(parsedRetirementAge - currentAge, 0))
        .toISOString()
        .slice(0, 10);
    }
    return '';
  };

  return {
    userAge,
    setUserAge,
    retirementAge,
    setRetirementAge,
    useCustomExpenses,
    setUseCustomExpenses: (checked: boolean) => {
      setUseCustomExpensesState(checked);
      if (!checked) setCustomExpenses('');
    },
    customExpenses,
    setCustomExpenses,
    pensions,
    taxBrackets,

    addPension: () =>
      setPensions((current) => [...current, createPensionDraft(buildDefaultPensionDate())]),
    updatePension: (pensionId, field, value) =>
      setPensions((current) =>
        current.map((pension) =>
          pension.id === pensionId ? { ...pension, [field]: value } : pension
        )
      ),
    removePension: (pensionId) =>
      setPensions((current) => current.filter((pension) => pension.id !== pensionId)),
    addTaxBracket: () =>
      setTaxBrackets((current) => [
        ...current,
        createTaxBracketDraft({ id: createLocalId('coast-tax'), upTo: null, rate: 43 }),
      ]),
    updateTaxBracket: (bracketId, field, value) =>
      setTaxBrackets((current) =>
        current.map((bracket) =>
          bracket.id === bracketId ? { ...bracket, [field]: value } : bracket
        )
      ),
    // The last bracket is the unlimited one: removing it would leave the top income untaxed.
    removeTaxBracket: (bracketId) =>
      setTaxBrackets((current) =>
        current.length > 1 ? current.filter((bracket) => bracket.id !== bracketId) : current
      ),

    currentAge,
    parsedRetirementAge,
    usesCustomExpenses,
    parsedCustomExpenses,
    previewPensions,
    previewTaxBrackets,
    pensionIssues,
    hasUnsavedChanges,

    isSaving: saveMutation.isPending,
    save: () => {
      if (currentAge === null) {
        toast.error("Inserisci un'età attuale valida tra 18 e 100 anni");
        return;
      }
      if (parsedRetirementAge === null) {
        toast.error("Inserisci un'età di pensionamento valida tra 18 e 100 anni");
        return;
      }
      saveMutation.mutate({
        userAge: currentAge,
        coastFireRetirementAge: parsedRetirementAge,
        // Undefined removes the field from Firestore; the service handles the deleteField() call.
        coastFireCustomExpenses: usesCustomExpenses ? parsedCustomExpenses : undefined,
        coastFirePensions: previewPensions,
        coastFireTaxBrackets: previewTaxBrackets,
      });
    },
    resetToSaved: () => {
      if (isLoadingSettings) return;
      // Dropping the draft reads the saved seed again — the same six assignments, derived.
      setDraft(null);
    },
  };
}
