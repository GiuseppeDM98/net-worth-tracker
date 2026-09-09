# Account condiviso e Demo Mode

> **When to open this guide** — whoever touches `contexts/ActiveAccountContext.tsx`, `lib/services/accountAccessService.ts`, `app/api/account/members/route.ts`, `lib/server/apiAuth.ts` (`assertCanAccessAccount`), `firestore.rules`, `components/settings/AccountSharingSection.tsx`, `lib/hooks/useDemoMode.ts`, `app/page.tsx` or `app/dashboard/layout.tsx` (the demo banner). The prerequisites of a shared account (whitelist, guest registers first, rules deployed) are in `SETUP.md` → *Step 5b*. In `AGENTS.md` the stub with the essentials stays; here is the full rule. Files: `CLAUDE.md` → *Key Files* → *Shared account*.

## Demo Mode
- The public landing (`app/page.tsx`) auto-logs into the demo account; `useDemoMode()` compares `user.uid` with
  `NEXT_PUBLIC_DEMO_USER_ID` and **gates every mutation** (buttons disabled with a named `aria-label`, handlers return
  early). The snapshots and notes of that account are shared by every visitor: a write that slips through is visible
  to all of them. The assistant is blocked there outright.
- **The dashboard's demo banner is the app's cadence on a warning fill** (`app/dashboard/layout.tsx`):
  the label is `TILE_EYEBROW_CLASS` recoloured to `text-warning-foreground` (the eyebrow's geometry is
  shared, its colour is not — `--warning` is near-white in light mode), and the consequence is a 12px
  reading beside it, visible at EVERY width. It used to hide below 640px, which is exactly where a
  reader needs to be told why a button does nothing.

## Shared Account / Delegated Access
- **Viewer vs owner**: `useAuth().user` is the viewer and never changes; `useActiveAccount().ownerId` is whose data is
  displayed. Pass `ownerId` in data-scoped hooks and pages; keep `user.uid` only for theme, profile, PDF author,
  `useDemoMode` and the sharing UI.
- **Grant model**: `account-access/{ownerUid}` with `memberUids` read by the rules and the `array-contains` discovery
  query; the rest is denormalized because a member cannot read `users/{ownerUid}`.
- **Three enforcement layers, kept in sync**: `firestore.rules` (`canAccess(ownerUid)` per collection, `create` uses
  `canAccess(request.resource.data.userId)`, `userPreferences` stays `isOwner`, `account-access` is **write:false**),
  `assertCanAccessAccount` on Admin routes, and the client substituting `ownerId`. **Rules changes are inert until
  deployed.**
- **Switching gotcha**: React Query keys namespace by the id passed in, but manual `useEffect` loaders (settings, history,
  performance, allocation, hall of fame) must include `ownerId` in their deps. The switcher must exist in BOTH the
  Sidebar and the `SecondaryMenuDrawer`, since portrait has no Sidebar.
