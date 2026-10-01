// WARNING: a key that starts with one of `PERSISTED_QUERY_PREFIXES` (lib/constants/persistCache.ts)
// is written to IndexedDB and kept for 24 hours, and the segment RIGHT AFTER the prefix is read as
// the owner's uid — it is what keeps the demo account's data off a visitor's disk. So under those
// prefixes the owner comes first (`['expenses', uid, …]`, never `['expenses', 'range', uid]`), and a
// new builder there is declared in `__tests__/persistCache.test.ts` (`OWNER_KEYED_BUILDERS`).
export const queryKeys = {
  // Dashboard
  dashboard: {
    overview: (userId: string) => ['dashboard', 'overview', userId] as const,
  },

  // Assets
  assets: {
    all: (userId: string) => ['assets', userId] as const,
  },

  // Settings — the ONE key for the owner's settings document (assetAllocationTargets/{uid}):
  // every reader goes through `useSettings`, every writer invalidates this key (2026-09-29).
  settings: {
    all: (userId: string) => ['settings', userId] as const,
  },

  // Goal-based investing — the owner's goals and assignments (goalBasedInvesting/{uid}).
  goals: {
    all: (userId: string) => ['goal-data', userId] as const,
  },

  // Dividend receipts — the owner's dividend records as receipts (Rendimenti's attribution).
  dividendReceipts: {
    all: (userId: string) => ['dividend-receipts', userId] as const,
  },

  // Hall of Fame — the pre-computed rankings document (hall-of-fame/{uid}).
  hallOfFame: {
    all: (userId: string) => ['hall-of-fame', userId] as const,
  },

  // Snapshots
  snapshots: {
    all: (userId: string) => ['snapshots', userId] as const,
    summaries: (userId: string) => ['snapshot-summaries', userId] as const,
    range: (userId: string, startYear: number, startMonth: number, endYear: number, endMonth: number) =>
      ['snapshots', userId, 'range', startYear, startMonth, endYear, endMonth] as const,
  },

  // Expenses
  expenses: {
    all: (userId: string) => ['expenses', userId] as const,
    // A window of the collection, both bounds as ISO instants (lib/utils/expenseWindows.ts is the
    // ONE source of the windows, since 2026-09-30). `all` is its prefix, so every expense write —
    // they all invalidate `all` — reaches every window a page holds, whatever its bounds.
    range: (userId: string, fromIso: string, toIso: string) => ['expenses', userId, 'range', fromIso, toIso] as const,
    // The dates of the oldest and of the newest row: what a page that reads a window still has to
    // know about the rest of the collection (the years a picker offers, an account with no rows).
    bounds: (userId: string) => ['expenses', userId, 'bounds'] as const,
    month: (userId: string, year: number, month: number) =>
      ['expenses', userId, year, month] as const,
    categories: (userId: string) => ['expense-categories', userId] as const,
  },

  // Budget — the monthly records of the configuration, written only by the cron
  budgetHistory: {
    months: (userId: string, monthKeys: string[]) => ['budget-history', userId, ...monthKeys] as const,
  },

  // Assistant
  assistant: {
    threads: (userId: string) => ['assistant', 'threads', userId] as const,
    thread: (threadId: string) => ['assistant', 'thread', threadId] as const,
    memory: (userId: string) => ['assistant', 'memory', userId] as const,
    // Month-level context (month_analysis, chat)
    context: (userId: string, year: number, month: number) =>
      ['assistant', 'context', userId, year, month] as const,
    // Year-level context (year_analysis). month=0 signals year period.
    contextYear: (userId: string, year: number) =>
      ['assistant', 'context', userId, year, 0] as const,
    // YTD context. month=-1 signals YTD period.
    contextYtd: (userId: string, year: number) =>
      ['assistant', 'context', userId, year, -1] as const,
    // History context. month=-2 signals history period.
    contextHistory: (userId: string, startYear: number) =>
      ['assistant', 'context', userId, startYear, -2] as const,
  },
  // Benchmarks
  benchmarks: {
    returns: (benchmarkId: string) => ['benchmarks', 'returns', benchmarkId] as const,
    fxRates: () => ['benchmarks', 'fx-rates'] as const,
    ecbRates: () => ['benchmarks', 'ecb-rates'] as const,
  },

  // Portfolio — the Esposizione's Yahoo profiles, keyed by the OWNER and by the signature of the
  // tickers in view («AAPL:stock|VWCE.DE:fund»): a new ticker is a new key, so the read restarts
  // by itself (doc/guide/allocazione.md § Esposizione). The weighing happens in the browser, outside the cache.
  portfolio: {
    instrumentProfiles: (ownerId: string, signature: string) => ['portfolio', 'instrument-profiles', ownerId, signature] as const,
  },

  // Asset trade ledger (Registro operazioni asset).
  // `all` is a prefix of `byAsset` so invalidating `all` refreshes any open movements list
  // (the costCenters prefix-invalidation precedent).
  assetTransactions: {
    all: (userId: string) => ['asset-transactions', userId] as const,
    byAsset: (userId: string, assetId: string) => ['asset-transactions', userId, assetId] as const,
    meta: (userId: string) => ['asset-transactions-meta', userId] as const,
  },

  // Fondo pensione — contributions in the dedicated `pensionContributions` collection.
  // `all` is a prefix of `byAsset` so invalidating `all` also refreshes any per-fund view.
  pensionContributions: {
    all: (userId: string) => ['pension-contributions', userId] as const,
    byAsset: (userId: string, assetId: string) =>
      ['pension-contributions', userId, assetId] as const,
  },

  // Cost centers: the centres ALONE (since 2026-09-29 — the key used to carry one query per
  // centre for its rows, and the detail had a `expenses(userId, centerId)` key of its own; the rows
  // are now grouped in memory from `useExpenses`, lib/utils/costCenterUtils.ts).
  costCenters: {
    all: (userId: string) => ['cost-centers', userId] as const,
  },
} as const;
