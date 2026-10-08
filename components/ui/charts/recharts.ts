/**
 * The ONE door to recharts: every chart in the app imports its primitives from here, never from
 * `'recharts'` directly (2026-09-30).
 *
 * The Turbopack production build of 2026-09-26 shipped recharts in FOUR identical 350 KB chunks, one
 * per page that draws a chart (Patrimonio, Analisi, Storico, Rendimenti + FIRE), so every move between
 * those pages downloaded it again. The module graph had each recharts module ONCE (every page reached
 * the same deep modules, `optimizePackageImports` rewrites them identically); the copies were the
 * CHUNKING's: each page entered the library through its own set of deep modules, and Turbopack
 * batches a library by where it is entered. Behind ONE module that is real code, every page enters
 * recharts through the same door and the build emits one chunk shared by all of them.
 *
 * Why `export const X = RechartsX` and not `export { X } from 'recharts'`: a module of re-exports only
 * is transparent to Turbopack — it resolves every import straight through to the deep module, and the
 * build came out identical to the byte (four chunks). A namespace import (`import * as`) does give one
 * chunk, but defeats the tree-shaking: 518 KB raw instead of 350, measured the same day.
 *
 * WARNING: a chart that imports `'recharts'` directly brings the copies back with no other sign —
 * `perf:budget`'s `libraryCopies` is what goes red. Add a primitive here when a chart needs one.
 */
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid as RechartsCartesianGrid,
  Cell as RechartsCell,
  ComposedChart as RechartsComposedChart,
  Legend as RechartsLegend,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  ReferenceArea as RechartsReferenceArea,
  ReferenceLine as RechartsReferenceLine,
  ResponsiveContainer as RechartsResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from 'recharts';

export const Area = RechartsArea;
export const AreaChart = RechartsAreaChart;
export const Bar = RechartsBar;
export const BarChart = RechartsBarChart;
export const CartesianGrid = RechartsCartesianGrid;
export const Cell = RechartsCell;
export const ComposedChart = RechartsComposedChart;
export const Legend = RechartsLegend;
export const Line = RechartsLine;
export const LineChart = RechartsLineChart;
export const ReferenceArea = RechartsReferenceArea;
export const ReferenceLine = RechartsReferenceLine;
export const ResponsiveContainer = RechartsResponsiveContainer;
export const Tooltip = RechartsTooltip;
export const XAxis = RechartsXAxis;
export const YAxis = RechartsYAxis;
