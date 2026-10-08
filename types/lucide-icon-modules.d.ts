/**
 * lucide-react's per-icon ES modules ship no declarations of their own; the category icons load
 * them one chunk each (`components/expenses/categoryIconLoaders.ts`). Each module's
 * default export is the icon component.
 */
declare module 'lucide-react/dist/esm/icons/*.js' {
  import type { LucideIcon } from 'lucide-react';

  const Icon: LucideIcon;
  export default Icon;
}
