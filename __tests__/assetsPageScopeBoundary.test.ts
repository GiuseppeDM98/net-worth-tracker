import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('assets page household scope boundary', () => {
  it('uses the page-level scoped assets for the management tab', () => {
    const source = readFileSync('app/dashboard/assets/page.tsx', 'utf8');

    expect(source).toMatch(/<AssetManagementTab\s+assets=\{scopedAssets\}/);
  });

  it('keeps asset management free of its own household scope dropdown', () => {
    const source = readFileSync('components/assets/AssetManagementTab.tsx', 'utf8');

    expect(source).not.toMatch(/useHouseholdScopeFilter|HouseholdScopeSelect|Filtro proprietà/);
  });
});
