import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PATRIMONIO_VISIBILITY_STORAGE_KEY,
  getPatrimonioVisibleSnapshot,
  readStoredPatrimonioVisibility,
  setPatrimonioVisible,
  subscribePatrimonioVisibility,
} from '@/lib/hooks/usePatrimonioVisible';
import { NarrativeText } from '@/components/ui/narrative-text';
import type { Narrative } from '@/lib/utils/narrative';

function installFakeStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map<string, string>(Object.entries(initial));
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  vi.stubGlobal('localStorage', fake);
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  return store;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // Reset the module-level snapshot so each case reads its own storage.
  setPatrimonioVisible(false);
  vi.unstubAllGlobals();
});

describe('readStoredPatrimonioVisibility', () => {
  it('is hidden by default on app opening', () => {
    installFakeStorage({ [PATRIMONIO_VISIBILITY_STORAGE_KEY]: '1' });
    expect(readStoredPatrimonioVisibility()).toBe(false);
    expect(getPatrimonioVisibleSnapshot()).toBe(false);
  });
});

describe('setPatrimonioVisible', () => {
  it('updates in-memory snapshot and notifies subscribers', () => {
    installFakeStorage();
    const listener = vi.fn();
    const unsubscribe = subscribePatrimonioVisibility(listener);

    setPatrimonioVisible(true);
    expect(getPatrimonioVisibleSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setPatrimonioVisible(false);
    expect(getPatrimonioVisibleSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});

describe('NarrativeText masking', () => {
  it('masks the figure in "Il patrimonio vale X" when patrimonioVisible is false', () => {
    setPatrimonioVisible(false);
    const narrative: Narrative = [
      { text: 'Il patrimonio vale ' },
      { text: '412.380,52 €', mono: true },
      { text: ': +4120,18 € su luglio.' },
    ];
    const html = renderToStaticMarkup(createElement(NarrativeText, { segments: narrative }));
    expect(html).toContain('Il patrimonio vale ');
    expect(html).toContain('••••••');
    expect(html).not.toContain('412.380,52 €');
  });

  it('reveals the figure in "Il patrimonio vale X" when patrimonioVisible is true', () => {
    setPatrimonioVisible(true);
    const narrative: Narrative = [
      { text: 'Il patrimonio vale ' },
      { text: '412.380,52 €', mono: true },
      { text: ': +4120,18 € su luglio.' },
    ];
    const html = renderToStaticMarkup(createElement(NarrativeText, { segments: narrative }));
    expect(html).toContain('Il patrimonio vale ');
    expect(html).toContain('412.380,52 €');
    expect(html).not.toContain('••••••');
  });
});
