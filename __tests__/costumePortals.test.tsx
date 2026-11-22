/**
 * A portalled surface wears the costume of the page it was opened from (DESIGN.md → The Costume Rule,
 * doc/guide/temi.md § Il costume, 2026-11-22). A Radix portal renders into `<body>`, outside the dashboard's
 * `[data-costume-scope]`, so each portalled primitive spreads `useCostumeScopeProps()` on its own content: the
 * attribute inside `CostumeScope` (React context crosses the portal), nothing outside it — the landing and the
 * access pages render the same primitives.
 *
 * Each primitive rendered open in its own case. `Select` and `Drawer` are proved in the browser
 * (`e2e/theme.costume{,.mobile}.spec.ts`): jsdom lacks the pointer and transform APIs they open with.
 *
 * Seen red on 2026-11-22 with the spread dropped from `popover.tsx`.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({ getUserPreferences: vi.fn(async () => ({})), setUserPreferences: vi.fn() }));

import { CostumeScope } from '@/contexts/CostumeScopeContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** The content of the portalled surface: its `data-slot`, else (the popover has none) the popper's dialog. */
const contentOf = (slot: string | null): Element | null =>
  slot
    ? document.querySelector(`[data-slot="${slot}"]`)
    : document.querySelector('[data-radix-popper-content-wrapper] > [role="dialog"]');

const CASES: Array<{ name: string; slot: string | null; tree: ReactNode }> = [
  {
    name: 'Popover',
    slot: null,
    tree: (
      <Popover open>
        <PopoverTrigger>Apri</PopoverTrigger>
        <PopoverContent>Come si calcola</PopoverContent>
      </Popover>
    ),
  },
  {
    name: 'DropdownMenu',
    slot: 'dropdown-menu-content',
    tree: (
      <DropdownMenu open>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Impostazioni</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    name: 'Tooltip',
    slot: 'tooltip-content',
    tree: (
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Comprimi</TooltipTrigger>
          <TooltipContent>Comprimi sidebar</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  },
  {
    name: 'Sheet',
    slot: 'sheet-content',
    tree: (
      <Sheet open>
        <SheetContent>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Navigazione</SheetDescription>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    name: 'Dialog',
    slot: 'dialog-content',
    tree: (
      <Dialog open>
        <DialogContent>
          <DialogTitle>Nuova spesa</DialogTitle>
          <DialogDescription>Corpo</DialogDescription>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: 'AlertDialog',
    slot: 'alert-dialog-content',
    tree: (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Esci</AlertDialogTitle>
          <AlertDialogDescription>Vuoi uscire?</AlertDialogDescription>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
];

describe.each(CASES)('$name', ({ slot, tree }) => {
  it('carries the costume scope on its content when opened inside it', () => {
    render(<CostumeScope>{tree}</CostumeScope>);
    const content = contentOf(slot);
    expect(content, 'the open content').not.toBeNull();
    expect(content!.hasAttribute('data-costume-scope')).toBe(true);
  });

  it('carries none outside it', () => {
    render(tree);
    const content = contentOf(slot);
    expect(content, 'the open content').not.toBeNull();
    expect(content!.hasAttribute('data-costume-scope')).toBe(false);
  });
});
