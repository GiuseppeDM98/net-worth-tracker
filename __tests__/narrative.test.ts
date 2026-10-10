/**
 * Tests for lib/utils/narrative.ts — `splitVerdict`, where a phone cuts a verdict (The
 * Binding-Clause Rule, since 2026-10-10: a `binding` clause past the cut cancels the cut).
 *
 * Falsified on 2026-10-10: the `binding` case went red with the `rest.some(binding)` branch
 * removed; the `leadLength: 0` case went red with the check rewritten as `if (!model.leadLength)`
 * (a zero then read as «no cut» and the whole sentence became the lead).
 */

import { describe, expect, it } from 'vitest';
import { narrativeToText, splitVerdict, type Narrative, type PageVerdictModel } from '@/lib/utils/narrative';

const SENTENCE: Narrative = [
  { text: 'In quel mese il patrimonio è salito di ' },
  { text: '+8240 €', mono: true, sign: 'positive' },
  { text: '.' },
  { text: ' Il ' },
  { text: '2026', mono: true },
  { text: ' è finora il secondo anno migliore.' },
];

function model(overrides: Partial<PageVerdictModel> = {}): PageVerdictModel {
  return { headline: 'Il tuo mese migliore è ottobre 2025.', tone: 'positive', sentence: SENTENCE, ...overrides };
}

describe('splitVerdict', () => {
  it('should keep the whole paragraph as the lead when the builder set no cut', () => {
    const split = splitVerdict(model());

    expect(split.lead).toBe(SENTENCE);
    expect(split.rest).toEqual([]);
    expect(split.restLabel).toBeNull();
  });

  it('should cut on the segment boundary the builder named and label the rest', () => {
    const split = splitVerdict(model({ leadLength: 3, restLabel: "l'anno in corso" }));

    expect(narrativeToText(split.lead)).toBe('In quel mese il patrimonio è salito di +8240 €.');
    expect(narrativeToText(split.rest)).toBe(' Il 2026 è finora il secondo anno migliore.');
    expect(split.restLabel).toBe("l'anno in corso");
  });

  it('should treat a cut past the end as no cut: nothing to hide, no button', () => {
    const split = splitVerdict(model({ leadLength: SENTENCE.length + 2, restLabel: 'il seguito' }));

    expect(split.lead).toBe(SENTENCE);
    expect(split.rest).toEqual([]);
    expect(split.restLabel).toBeNull();
  });

  it('should cancel the cut when a binding clause sits past it', () => {
    const sentence: Narrative = [...SENTENCE.slice(0, 3), { text: ' Le tasse sulla vendita sono già tolte.', binding: true }];
    const split = splitVerdict(model({ sentence, leadLength: 3, restLabel: 'le tasse' }));

    expect(split.lead).toBe(sentence);
    expect(split.rest).toEqual([]);
    expect(split.restLabel).toBeNull();
  });

  it('should keep a binding clause BEFORE the cut in the lead and still cut after it', () => {
    const sentence: Narrative = [
      { text: 'Hai venduto: ' },
      { text: '+1200 €', mono: true, sign: 'positive' },
      { text: ', tasse già tolte.', binding: true },
      { text: ' Il resto è mercato.' },
    ];
    const split = splitVerdict(model({ sentence, leadLength: 3, restLabel: 'il mercato' }));

    expect(narrativeToText(split.lead)).toBe('Hai venduto: +1200 €, tasse già tolte.');
    expect(narrativeToText(split.rest)).toBe(' Il resto è mercato.');
  });

  it('should read leadLength 0 as «title only»: an empty lead, the whole sentence behind the button', () => {
    const split = splitVerdict(model({ leadLength: 0, restLabel: 'il mese' }));

    expect(split.lead).toEqual([]);
    expect(split.rest).toEqual(SENTENCE);
    expect(split.restLabel).toBe('il mese');
  });

  it('should answer no label when the rest is empty, so no button is rendered', () => {
    const split = splitVerdict(model({ sentence: SENTENCE.slice(0, 3), leadLength: 3, restLabel: 'il seguito' }));

    expect(split.rest).toEqual([]);
    expect(split.restLabel).toBeNull();
  });

  it('should hand back a null label when the builder cut but named nothing', () => {
    const split = splitVerdict(model({ leadLength: 3 }));

    expect(split.rest.length).toBeGreaterThan(0);
    expect(split.restLabel).toBeNull();
  });
});
