import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Two projects, told apart by the file's extension (2026-11-07): the pure modules keep their
 * `.test.ts` under node, while components and hooks are `.test.tsx` rendered with Testing Library
 * under jsdom (`__tests__/domSetup.ts`: the cleanup, the stubs jsdom lacks). `extends: true` hands
 * both the alias below; `npx vitest run <file>` picks the project that includes the file.
 */
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'node', include: ['__tests__/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'dom', include: ['__tests__/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['__tests__/domSetup.ts'] } },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
