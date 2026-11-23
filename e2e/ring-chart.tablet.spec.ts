/**
 * The ring on its first five homes (the minor tiles' rings have their own `ring-chart.*` files) at 768×1024 and 1024×768 (DESIGN.md → The Ring Rule, 2026-11-12): the body is
 * `e2e/ringChartSuite.ts`, shared with the other two widths.
 */

import { registerRingChartSuite } from './ringChartSuite';

registerRingChartSuite({ openRows: true });
