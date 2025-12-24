export const queryKeys = {
  // Assets
  assets: {
    all: (userId: string) => ['assets', userId] as const,
    byId: (assetId: string) => ['assets', assetId] as const,
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
    month: (userId: string, year: number, month: number) =>
      ['expenses', userId, year, month] as const,
    stats: (userId: string) => ['expense-stats', userId] as const,
  },
} as const;
