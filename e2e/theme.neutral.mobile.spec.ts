/**
 * The palette themes at 390 render exactly as before the costume contract — the twin of
 * `theme.neutral.spec.ts` on the `mobile` project, without the dialog (its opener is a desktop
 * control; the drawer is probed when the dialogs get their costume).
 */
import { describeThemeNeutrality } from './themeNeutral';

describeThemeNeutrality('390');
