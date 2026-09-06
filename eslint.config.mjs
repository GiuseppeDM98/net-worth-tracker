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
  ]),
  ...storybook.configs["flat/recommended"]
]);

export default eslintConfig;
