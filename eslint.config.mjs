// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The alternate dist dirs (`NEXT_DIST_DIR=.next-e2e`, `.next-throwaway`): the same family
    // .gitignore excludes, or a Playwright run leaves ~170 generated-file findings behind.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored skill scripts (gitignored, written by the impeccable plugin, not by this repo):
    // linting them reported ~100 warnings nobody here can act on.
    ".agents/**",
    // A session's git worktree is a whole second checkout (its own `.next`, its own copies of every
    // file): with one on disk `npm run lint` counted 74.980 problems, none in this repo's code
    // (2026-11-26). Nothing tracked under `.claude/` is JavaScript.
    ".claude/**",
  ]),
  ...storybook.configs["flat/recommended"]
]);

export default eslintConfig;
