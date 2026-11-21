/**
 * The palette themes at 1440 render exactly as before the costume contract: the six palette themes
 * × two modes on Panoramica, Storico and Cashflow, plus the «Nuova Spesa» dialog, against
 * `e2e/themeNeutral.baseline.json` (the probes and the record mode: `themeNeutral.ts`).
 */
import { describeThemeNeutrality } from './themeNeutral';

describeThemeNeutrality('1440');
