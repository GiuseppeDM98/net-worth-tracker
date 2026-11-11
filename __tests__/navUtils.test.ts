/**
 * The bottom nav's «+» (`isAddExpenseFabShown`): Cashflow › Tracciamento alone, never in demo.
 * Seen red on 2026-10-12, in the retirement of the Cashflow composition's spec, with the demo
 * clause removed — until that day the FAB was the one add control the demo did not gate, and a
 * save from it wrote to the shared account.
 */

import { describe, expect, it } from 'vitest';
import { isAddExpenseFabShown, isNavItemActive } from '@/lib/utils/navUtils';

describe('isAddExpenseFabShown', () => {
  it('draws the FAB on Tracciamento only: the tab absent or `tracking`, on the Cashflow route', () => {
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: null, isDemo: false })).toBe(true);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'tracking', isDemo: false })).toBe(true);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'dividends', isDemo: false })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'budget', isDemo: false })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard', tab: null, isDemo: false })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow-x', tab: null, isDemo: false })).toBe(false);
  });

  it('never draws it in demo, Tracciamento included', () => {
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: null, isDemo: true })).toBe(false);
    expect(isAddExpenseFabShown({ pathname: '/dashboard/cashflow', tab: 'tracking', isDemo: true })).toBe(false);
  });
});

describe('isNavItemActive', () => {
  it('matches /dashboard exactly and every other item by prefix', () => {
    expect(isNavItemActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavItemActive('/dashboard', '/dashboard/cashflow')).toBe(false);
    expect(isNavItemActive('/dashboard/cashflow', '/dashboard/cashflow')).toBe(true);
    expect(isNavItemActive('/dashboard/cashflow', '/dashboard/cashflow/x')).toBe(true);
    expect(isNavItemActive('/dashboard/cashflow', '/dashboard/cashflows')).toBe(false);
  });
});

import { isAssistantBridgeShown } from '@/lib/utils/navUtils';

describe('isAssistantBridgeShown (2026-11: «Chiedi all’Assistente» on Cashflow)', () => {
  it('needs the key, refuses the demo and an off flag', () => {
    expect(isAssistantBridgeShown({ assistantConfigured: false, isDemo: false, flagValue: undefined })).toBe(false);
    expect(isAssistantBridgeShown({ assistantConfigured: true, isDemo: true, flagValue: undefined })).toBe(false);
    expect(isAssistantBridgeShown({ assistantConfigured: true, isDemo: false, flagValue: 'false' })).toBe(false);
  });

  it('shows with the flag absent (on by default) and with the flag on', () => {
    expect(isAssistantBridgeShown({ assistantConfigured: true, isDemo: false, flagValue: undefined })).toBe(true);
    expect(isAssistantBridgeShown({ assistantConfigured: true, isDemo: false, flagValue: 'true' })).toBe(true);
  });
});
