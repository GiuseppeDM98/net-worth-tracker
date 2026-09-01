import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import { BENCHMARKS } from '@/lib/constants/benchmarks';
import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import { PRODUCT_PROMISE_HEADLINE, buildLoginVerdict } from '@/lib/utils/authNarrative';
import { DEFAULT_MONTE_CARLO_SIMULATIONS } from '@/lib/utils/monteCarloParams';
import {
  buildLandingPromises,
  buildLandingVerdict,
  describeDemoAccess,
  describeProjectFacts,
  describeRegistrationInvite,
  describeSampleProfile,
} from '@/lib/utils/landingNarrative';

/** Italian `Intl` puts a no-break space before €; the screen shows one space, so flatten it. */
const plain = (text: string) => text.replace(/ | /g, ' ');

describe('buildLandingVerdict', () => {
  it('opens on the product promise, in the neutral tone it never leaves', () => {
    const verdict = buildLandingVerdict(true);
    expect(verdict.headline).toBe(PRODUCT_PROMISE_HEADLINE);
    expect(verdict.tone).toBe('neutral');
  });

  // One promise, one phrasing: the visitor meets the same sentence on the landing and on the
  // page the "Accedi" button takes them to.
  it('shares its headline with the sign-in page', () => {
    expect(buildLandingVerdict(true).headline).toBe(buildLoginVerdict().headline);
  });

  it('names the demo only where a demo account is configured', () => {
    expect(narrativeToText(buildLandingVerdict(true).sentence)).toContain('la demo apre l’app vera');
  });

  it('drops the demo clause when the demo credentials are missing', () => {
    const sentence = narrativeToText(buildLandingVerdict(false).sentence);
    expect(sentence).not.toContain('demo');
    expect(sentence.endsWith('su un profilo inventato.')).toBe(true);
  });

  it('says the figures below are invented, in both states', () => {
    for (const demoAvailable of [true, false]) {
      expect(narrativeToText(buildLandingVerdict(demoAvailable).sentence)).toContain(
        'profilo inventato',
      );
    }
  });
});

describe('describeDemoAccess', () => {
  it('warns that the demo account is shared and read-only', () => {
    const reading = describeDemoAccess(true);
    expect(reading).not.toBeNull();
    expect(narrativeToText(reading!)).toContain('non si modifica niente');
  });

  it('says nothing at all without a demo to describe', () => {
    expect(describeDemoAccess(false)).toBeNull();
  });
});

describe('describeRegistrationInvite', () => {
  it('invites anyone while registrations are open', () => {
    expect(describeRegistrationInvite('open')).toEqual({
      question: 'Non hai un profilo?',
      linkLabel: 'Registrati',
    });
  });

  it('asks for the invitation where a whitelist governs', () => {
    expect(describeRegistrationInvite('invite-only')?.question).toBe('Hai un invito?');
  });

  // An invitation behind a closed door is a promise the server does not keep.
  it('offers nothing when registrations are closed', () => {
    expect(describeRegistrationInvite('closed')).toBeNull();
  });
});

describe('describeSampleProfile', () => {
  it('separates the tiles that carry invented figures from the ones that carry none', () => {
    const text = narrativeToText(describeSampleProfile());
    expect(text).toContain('prime quattro tessere');
    expect(text).toContain('non stampano numeri');
  });
});

describe('buildLandingPromises', () => {
  it('describes the three sections that show no figures', () => {
    expect(buildLandingPromises(2026).map((promise) => promise.key)).toEqual([
      'rendimenti',
      'fire',
      'previdenza',
    ]);
  });

  // Every number in the promises is read from the module that owns it, so a landing claim can
  // never survive the change that invalidates it.
  it('counts the benchmarks from the benchmark list itself', () => {
    const rendimenti = buildLandingPromises(2026)[0];
    expect(narrativeToText(rendimenti.reading)).toContain(` ${BENCHMARKS.length} portafogli modello`);
  });

  it('states the Monte Carlo default the tab actually seeds', () => {
    expect(DEFAULT_MONTE_CARLO_SIMULATIONS).toBe(10000);
    expect(narrativeToText(buildLandingPromises(2026)[1].reading)).toContain(
      '10.000 simulazioni per scenario',
    );
  });

  it('prints the deduction ceiling in force for the year it is given', () => {
    const ceiling2026 = buildLandingPromises(2026)[2].rows.find(
      (row) => row.label === 'Deduzione IRPEF',
    )!;
    expect(plain(narrativeToText(ceiling2026.caption))).toContain('5300 €');

    const ceiling2025 = buildLandingPromises(2025)[2].rows.find(
      (row) => row.label === 'Deduzione IRPEF',
    )!;
    expect(plain(narrativeToText(ceiling2025.caption))).toContain('5165 €');
  });

  it('gives every promise a reading and at least three measures', () => {
    for (const promise of buildLandingPromises(2026)) {
      expect(narrativeToText(promise.reading).length).toBeGreaterThan(40);
      expect(promise.rows.length).toBeGreaterThanOrEqual(3);
      for (const row of promise.rows) {
        expect(row.label.length).toBeGreaterThan(0);
        expect(narrativeToText(row.caption).length).toBeGreaterThan(0);
      }
    }
  });

  // The Previdenza tile exists to say that the three causes are kept apart — the app's own rule.
  it('says the pension fund never blends its three causes', () => {
    const text = narrativeToText(buildLandingPromises(2026)[2].reading);
    expect(text).toContain('mercato, datore e fisco');
  });
});

describe('describeProjectFacts', () => {
  // The landing claimed «6 classi di asset» while the union had eight.
  it('counts the asset classes from the union own enumeration', () => {
    expect(narrativeToText(describeProjectFacts())).toContain(
      `${ASSET_CLASS_SEQUENCE.length} classi di asset`,
    );
    expect(ASSET_CLASS_SEQUENCE.length).toBe(8);
  });

  it('claims no telemetry, which is a settled fact of this repository', () => {
    expect(narrativeToText(describeProjectFacts())).toContain('nessuna telemetria');
  });
});
