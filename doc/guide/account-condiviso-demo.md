# Account condiviso e Demo Mode

> **When to open this guide** — whoever touches `contexts/ActiveAccountContext.tsx`, `lib/services/accountAccessService.ts`, `app/api/account/members/route.ts`, `lib/server/apiAuth.ts` (`assertCanAccessAccount`), `firestore.rules`, `components/settings/AccountSharingSection.tsx`, `lib/hooks/useDemoMode.ts`, `app/page.tsx` or `app/dashboard/layout.tsx` (the demo banner). The prerequisites of a shared account (whitelist, guest registers first, rules deployed) are in `SETUP.md` → *Step 5b*. In `AGENTS.md` the stub with the essentials stays; here is the full rule. Files: § *Files* below.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Shared account · Demo**: `contexts/ActiveAccountContext.tsx`, `lib/services/accountAccessService.ts`, `app/api/account/members/route.ts`, `lib/server/apiAuth.ts`, `firestore.rules`, `lib/hooks/useDemoMode.ts`, `lib/utils/demoAccount.ts` (`isDemoUid`); collection `account-access/{ownerUid}` — doc/guide/account-condiviso-demo.md

## Demo Mode
- The public landing (`app/page.tsx`) auto-logs into the demo account; `useDemoMode()` compares `user.uid` with
  `NEXT_PUBLIC_DEMO_USER_ID` and **gates every mutation** (buttons disabled with a named `aria-label`, handlers return
  early). The snapshots and notes of that account are shared by every visitor: a write that slips through is visible
  to all of them. The assistant is blocked there outright.
- **«Is this uid the demo?» is ONE pure rule, `isDemoUid(uid, demoUid?)`** (`lib/utils/demoAccount.ts`, 2026-09-29):
  `useDemoMode` asks it about the viewer, `AuthContext` about the profile it would backfill, and the query persister
  about the OWNER segment of every key it is about to write — the demo account's data is shared by every visitor and
  must never land in a visitor's IndexedDB (`isPersistableQuery`, AGENTS.md § Caching). Nothing is persisted for it,
  so the demo never shows «Aggiornato alle…» either. The env value is a parameter, so a test sets it; a fourth
  hand-written `=== process.env.NEXT_PUBLIC_DEMO_USER_ID` is the copy that will drift (the cron route still has six,
  server-side, out of this rule's reach on purpose: a server file must not import a client helper for it).
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

## Per-page blind spots

- **That the demo account writes nothing to IndexedDB is proven by a pure test, never seen in a browser**
  (2026-09-30): `isPersistableQuery` refuses every key whose owner segment is the demo uid, and
  `__tests__/persistCache.test.ts` pins both that and the position of the owner in every key builder under a
  persisted prefix. No spec opens the demo and reads the store — the emulators carry no
  `NEXT_PUBLIC_DEMO_USER_ID` — and the tour of 2026-09-29 did not visit it. So a missing browser check here is
  known; a `nwt-query-cache` record holding a key of the demo uid in a visitor's browser would be a real defect.
