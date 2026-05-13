import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('household feature regression guards', () => {
  it('passes the selected household scope to assistant streaming requests', () => {
    const clientSource = readRepoFile('components/assistant/AssistantPageClient.tsx');
    const routeSource = readRepoFile('app/api/ai/assistant/stream/route.ts');

    expect(clientSource).toContain('householdScope: scope');
    expect(routeSource).toContain('householdScope: body.householdScope');
  });

  it('does not show global performance metrics while scoped metrics are unresolved', () => {
    const source = readRepoFile('app/dashboard/performance/page.tsx');

    expect(source).not.toContain('const metrics = scopedMetrics ?? baseMetrics');
    expect(source).toContain('const metrics = isScoped ? scopedMetrics : baseMetrics');
  });

  it('applies household scope to the History page datasets', () => {
    const source = readRepoFile('app/dashboard/history/page.tsx');

    expect(source).toContain('useHouseholdScopeFilter');
    expect(source).toContain('filterSnapshotsByOwnershipScope');
    expect(source).toContain('filterExpensesByAttributionScope');
    expect(source).toContain('const displaySnapshots = householdEnabled ? scopedSnapshots : snapshots');
  });

  it('exposes archive and restore actions for custom ownership profiles in settings', () => {
    const source = readRepoFile('app/dashboard/settings/page.tsx');

    expect(source).toContain('onClick={() => handleArchiveOwnershipProfile(profile.id)}');
    expect(source).toContain('onClick={() => handleRestoreOwnershipProfile(profile.id)}');
  });

  it('defaults legacy income edits to the configured income attribution profile', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain(
      "expense.attributionProfileId || (expense.type === 'income' ? defaultIncomeAttributionProfileId : defaultExpenseAttributionProfileId)"
    );
  });
});
