/**
 * Regressione sul round-trip delle impostazioni (lib/services/assetAllocationService.ts).
 *
 * PERCHÉ ESISTE: `getSettings` E `setSettings` sono DUE whitelist campo per campo — una mappatura
 * esplicita in lettura, due catene di `if (settings.X !== undefined)` in scrittura (una per il ramo
 * con `targets`, che riscrive il documento senza merge, e una per il ramo con `merge: true`).
 * Un campo nuovo aggiunto al tipo e alla pagina Impostazioni ma non a TUTTE E TRE le liste sparisce
 * in silenzio: l'utente clicca Salva, vede il toast di conferma, e al reload trova il default.
 *
 * È successo esattamente così con i tre campi introdotti il 2026-07-27
 * (`performanceIncludesPensionFunds`, `performanceIncludesExcludedAssets`,
 * `pensionReturnStartMonth`): i due switch della base di calcolo erano inerti. Correggere la sola
 * lettura non è bastato — il sintomo era identico e la causa era doppia.
 *
 * assetAllocationService carica il client Firebase SDK a module load — mockato come in
 * __tests__/compareAllocations.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE_SENTINEL),
}));

/** Sentinella riconoscibile al posto di `deleteField()`, che è opaco. */
const DELETE_SENTINEL = { __deleteField: true };

import { getDoc, setDoc } from 'firebase/firestore';
import { getSettings, setSettings } from '@/lib/services/assetAllocationService';
import type { AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';

/** Ogni valore è scelto per essere DIVERSO dal default, così un campo perso si vede. */
const STORED_SETTINGS = {
  targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } },
  performanceIncludesPensionFunds: true,
  performanceIncludesExcludedAssets: true,
  pensionReturnStartMonth: '2026-07',
  costCentersEnabled: true,
  includePrimaryResidenceInFIRE: true,
  respectPensionLockInFire: true,
  pensionInpsRetirementAge: 68,
  pensionRitaLongUnemployment: true,
  cashflowHistoryStartYear: 2019,
  familyMembers: [{ id: 'm1', name: 'Giuseppe' }],
  expenseSplitEnabled: true,
};

const TARGETS = { equity: { targetPercentage: 100 } } as unknown as AssetAllocationTarget;

/** Il payload passato a `setDoc` dall'ultima chiamata. */
function writtenPayload(): Record<string, unknown> {
  return vi.mocked(setDoc).mock.calls.at(-1)?.[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.mocked(setDoc).mockClear();
  vi.mocked(setDoc).mockResolvedValue(undefined as never);
  vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
});

describe('getSettings — lettura', () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => STORED_SETTINGS,
    } as never);
  });

  it('returns the performance-base and pension-return settings instead of dropping them', async () => {
    const settings = await getSettings('user-1');

    expect(settings?.performanceIncludesPensionFunds).toBe(true);
    expect(settings?.performanceIncludesExcludedAssets).toBe(true);
    expect(settings?.pensionReturnStartMonth).toBe('2026-07');
  });

  it('keeps returning the pre-existing fields alongside them', async () => {
    const settings = await getSettings('user-1');

    expect(settings?.costCentersEnabled).toBe(true);
    expect(settings?.includePrimaryResidenceInFIRE).toBe(true);
    expect(settings?.respectPensionLockInFire).toBe(true);
    expect(settings?.cashflowHistoryStartYear).toBe(2019);
    expect(settings?.familyMembers).toEqual([{ id: 'm1', name: 'Giuseppe' }]);
    expect(settings?.expenseSplitEnabled).toBe(true);
  });

  it('returns the RITA rule settings instead of dropping them', async () => {
    const settings = await getSettings('user-1');

    expect(settings?.pensionInpsRetirementAge).toBe(68);
    expect(settings?.pensionRitaLongUnemployment).toBe(true);
  });

  it('returns null when the user has no settings document yet', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    expect(await getSettings('user-1')).toBeNull();
  });
});

describe('setSettings — scrittura, ramo con targets (setDoc senza merge)', () => {
  it('writes the performance-base and pension-return settings', async () => {
    await setSettings('user-1', {
      targets: TARGETS,
      performanceIncludesPensionFunds: true,
      performanceIncludesExcludedAssets: true,
      pensionReturnStartMonth: '2026-07',
    } as AssetAllocationSettings);

    expect(writtenPayload()).toMatchObject({
      performanceIncludesPensionFunds: true,
      performanceIncludesExcludedAssets: true,
      pensionReturnStartMonth: '2026-07',
    });
  });

  it('writes the RITA rule settings', async () => {
    await setSettings('user-1', {
      targets: TARGETS,
      pensionInpsRetirementAge: 68,
      pensionRitaLongUnemployment: false,
    } as AssetAllocationSettings);

    expect(writtenPayload()).toMatchObject({
      pensionInpsRetirementAge: 68,
      pensionRitaLongUnemployment: false,
    });
  });

  it('drops the start month from the payload when it is cleared', async () => {
    // Questo ramo riscrive il documento partendo da quello esistente: togliere la chiave la rimuove.
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ pensionReturnStartMonth: '2026-07' }),
    } as never);

    await setSettings('user-1', {
      targets: TARGETS,
      pensionReturnStartMonth: undefined,
    } as AssetAllocationSettings);

    expect(writtenPayload()).not.toHaveProperty('pensionReturnStartMonth');
  });

  it('leaves an untouched start month alone when the key is absent from the update', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ pensionReturnStartMonth: '2026-07' }),
    } as never);

    await setSettings('user-1', { targets: TARGETS } as AssetAllocationSettings);

    expect(writtenPayload().pensionReturnStartMonth).toBe('2026-07');
  });

  // Età, risk-free e le due categorie dividendi si possono SVUOTARE dalla UI. Senza la guardia
  // `'x' in settings` questo ramo le riportava indietro: parte da `...existingData` e con
  // `!== undefined` un campo svuotato non sovrascriveva nulla (bug corretto il 2026-08-29).
  it.each([
    ['userAge', 34],
    ['riskFreeRate', 3.5],
    ['dividendIncomeCategoryId', 'cat-1'],
    ['dividendIncomeSubCategoryId', 'sub-1'],
  ])('drops %s from the payload when it is cleared', async (field, stored) => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ [field]: stored }),
    } as never);

    await setSettings('user-1', {
      targets: TARGETS,
      [field]: undefined,
    } as AssetAllocationSettings);

    expect(writtenPayload()).not.toHaveProperty(field);
  });

  it.each([
    ['userAge', 34],
    ['riskFreeRate', 3.5],
    ['dividendIncomeCategoryId', 'cat-1'],
    ['dividendIncomeSubCategoryId', 'sub-1'],
  ])('leaves an untouched %s alone when the key is absent from the update', async (field, stored) => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ [field]: stored }),
    } as never);

    await setSettings('user-1', { targets: TARGETS } as AssetAllocationSettings);

    expect(writtenPayload()[field]).toBe(stored);
  });
});

describe('setSettings — scrittura, ramo senza targets (merge: true)', () => {
  it('writes the performance-base and pension-return settings', async () => {
    await setSettings('user-1', {
      performanceIncludesPensionFunds: true,
      performanceIncludesExcludedAssets: false,
      pensionReturnStartMonth: '2026-07',
    } as AssetAllocationSettings);

    expect(writtenPayload()).toMatchObject({
      performanceIncludesPensionFunds: true,
      performanceIncludesExcludedAssets: false,
      pensionReturnStartMonth: '2026-07',
    });
  });

  it('writes the RITA rule settings', async () => {
    await setSettings('user-1', {
      pensionInpsRetirementAge: 70,
      pensionRitaLongUnemployment: true,
    } as AssetAllocationSettings);

    expect(writtenPayload()).toMatchObject({
      pensionInpsRetirementAge: 70,
      pensionRitaLongUnemployment: true,
    });
  });

  it('uses deleteField to clear the start month, since omitting the key would keep it', async () => {
    await setSettings('user-1', {
      pensionReturnStartMonth: undefined,
    } as AssetAllocationSettings);

    expect(writtenPayload().pensionReturnStartMonth).toBe(DELETE_SENTINEL);
  });

  // Un flag di funzionalità deve sopravvivere a ENTRAMBE le catene: il ramo `targets` scrive
  // con setDoc senza merge, quindi un campo non ricopiato lì sparisce al primo salvataggio
  // dell'allocazione (AGENTS -> Settings — the FIVE places).
  it('writes expenseSplitEnabled through both chains', async () => {
    await setSettings('user-1', { expenseSplitEnabled: true } as AssetAllocationSettings);
    expect(writtenPayload().expenseSplitEnabled).toBe(true);

    await setSettings('user-1', { targets: TARGETS, expenseSplitEnabled: true } as AssetAllocationSettings);
    expect(writtenPayload().expenseSplitEnabled).toBe(true);
  });

  it('does not touch the start month when the key is absent from the update', async () => {
    await setSettings('user-1', { costCentersEnabled: true } as AssetAllocationSettings);

    expect(writtenPayload()).not.toHaveProperty('pensionReturnStartMonth');
  });

  // Lo stesso per gli altri quattro campi svuotabili: qui si scrive con merge, quindi omettere
  // la chiave lascerebbe il valore vecchio — serve un deleteField() esplicito (2026-08-29).
  it.each(['userAge', 'riskFreeRate', 'dividendIncomeCategoryId', 'dividendIncomeSubCategoryId'])(
    'uses deleteField to clear %s, since omitting the key would keep it',
    async (field) => {
      await setSettings('user-1', { [field]: undefined } as unknown as AssetAllocationSettings);

      expect(writtenPayload()[field]).toBe(DELETE_SENTINEL);
    }
  );

  it.each(['userAge', 'riskFreeRate', 'dividendIncomeCategoryId', 'dividendIncomeSubCategoryId'])(
    'does not touch %s when the key is absent from the update',
    async (field) => {
      await setSettings('user-1', { costCentersEnabled: true } as AssetAllocationSettings);

      expect(writtenPayload()).not.toHaveProperty(field);
    }
  );
});
