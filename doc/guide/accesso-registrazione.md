# Accesso e Registrazione

> **Quando aprire questa guida** — chi tocca `app/login/page.tsx`, `app/register/page.tsx`, `components/auth/*`, `lib/utils/authNarrative.ts`, `lib/server/registrationPolicy.ts`, `contexts/AuthContext.tsx`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Accesso e Registrazione**: `app/{login,register}/page.tsx`, `components/auth/*`, pure `lib/utils/authNarrative.ts` and `lib/utils/authProfile.ts` (`resolveDisplayName`), `lib/server/registrationPolicy.ts` + `app/api/auth/check-registration/route.ts`, `contexts/AuthContext.tsx`, `components/ProtectedRoute.tsx`; tests `__tests__/{authNarrative,registrationPolicy,authProfile}.test.ts`

## Accesso e Registrazione (`app/login/page.tsx`, `app/register/page.tsx`, `components/auth/*`, `lib/utils/authNarrative.ts`)

- **ONE tile, no grid.** A form is a single tile, and a 12-column grid of one cell is a grid pretending. The page is a
  420px column — eyebrow, `PageVerdict`, the `Tile`, the secondary link — inside `AuthShell`, which both pages share.
  `p-5 desktop:p-6` on that tile is deliberate and the only place the 24px padding is still right (DESIGN.md → Cards).
- **The verdict is the PRODUCT's promise, but it is still generated.** These pages measure nothing, so the sentence
  cannot be a reading of data — it is a claim about the app. It is nonetheless built by rules over the page's state
  (`buildLoginVerdict`, `buildRegisterVerdict(access)`), never written in JSX, so the whitelist clause can honestly
  disappear and every phrasing is pinned by a test. The tone stays `neutral` in every state: a promise that flipped to
  `negative` on a mistyped password would be the page disowning itself over a typo.
- **The tile's reading IS the form's status line** (The Status-Is-The-Reading Rule, DESIGN.md). `describeLoginStatus` /
  `describeRegisterStatus` return an `AuthReading` — the words plus a tone — for idle · submitting · success · error,
  and `AuthStatusLine` paints the negative tone `text-destructive`. Two traps. The container's role must NOT swap
  between `status` and `alert`: it is a different node to the accessibility tree, and the swap can announce nothing at
  all — it stays one stable `role="status" aria-live="polite" aria-atomic="true"`. And `NarrativeText` colours only
  `mono` segments, so a prose sentence cannot carry its own colour through a `sign`: the tone is applied by the
  component, which is why `AuthReading` exists instead of a bare `Narrative`.
- **`describeAuthError` is the ONE translation of a failure, and an unknown code never falls through to the provider.**
  Firebase throws «Firebase: Error (auth/invalid-credential).» — English, provider-named, code in parentheses: a log
  line, not a sentence. 14 codes are mapped; anything else takes a sentence that claims nothing about the cause
  (Narrative Honesty applied to an error). Adding a case is a line in `AUTH_ERROR_TEXT` plus its test.
- **`AuthContext` unblocks on what Auth knows, and reads Firestore AFTER** (PERF-02, 2026-09-28). The
  `onAuthStateChanged` callback sets `user` and `loading` together with nothing awaited — React batches them into
  ONE commit, which the benchmark's auth marker and the six setups count on. The `displayName` fallback for
  email/password users (`completeDisplayName` → `resolveDisplayName`, `lib/utils/authProfile.ts`) runs after: it
  patches `user` only while the same uid is still signed in, and copies the name into the Auth profile once
  (`updateProfile`, best effort, never for `NEXT_PUBLIC_DEMO_USER_ID`), so the next sign-in needs no read. Every
  surface reading `user.displayName` must accept it arriving a frame later — the Panoramica greeting's `useMemo`
  already depends on it. Before this the read stood in front of every page, sidebar included.
- **A code must survive the context layer.** `AuthContext` used to rethrow `new Error(error.message)`, which DROPS
  `code` and leaves the page nothing to map. Use `withCode(message, code)` and, in a catch, rethrow an `Error` as is.
  The 403 of `/api/auth/check-registration` carries `code: 'registration/not-allowed'` for the same reason: the words
  live in the pure module, so a copy edit in the route can never change what the reader sees.
- **`resolveRegistrationAccess` MIRRORS `isRegistrationAllowed` — deroga included.** With the whitelist on, a listed
  email registers even while `NEXT_PUBLIC_REGISTRATIONS_ENABLED` is `'false'` (SETUP.md → Step 5b relies on it to
  onboard a shared-account guest). So `whitelistEnabled` wins in BOTH directions and only "registrations off AND no
  whitelist" resolves to `closed`. If the server's precedence ever changes, change it here in the same commit: a page
  promising a closed door the server leaves ajar is worse than no page.
- **The password rows are the two rules the submit actually enforces**, read from the same predicate
  (`evaluatePasswordRequirements` → `arePasswordRequirementsMet`), so the screen and the validation cannot disagree.
  The match rule stays UNMET on two empty fields — they are equal, but nothing was typed. A met row takes the check
  icon and `text-foreground`, **never `text-positive`**: the sign tokens mean money gained and lost, and a satisfied
  requirement is neither.
- **The submit stays enabled with the rules unmet** (as before the redesign) and answers with the reading; a disabled
  submit is a new gate and hides its own reason from the keyboard. On SUCCESS the form freezes instead: the redirect
  lives in the `useEffect` watching `user`/`authLoading`, and an unfrozen form during that beat invites a second
  submit that races it.
- **The demo button is env-gated, Google is not.** `NEXT_PUBLIC_DEMO_EMAIL` + `NEXT_PUBLIC_DEMO_PASSWORD` decide
  whether the demo exists at all; Google renders unconditionally and fails at click time if the provider is off in the
  Firebase console (`auth/operation-not-allowed`, mapped). Do not "fix" that by hiding the button behind a flag that
  does not exist.

## Per-page blind spots

- **Accesso e Registrazione**: no Playwright spec of the two pages themselves (the session's throwaway ones were deleted; `e2e/shell.boot*.spec.ts` cover the redirect of `/dashboard` without a session). `ProtectedRoute` has no spinner since 2026-09-28 (PERF-02): it shows the layout's tile-grid skeleton while Auth resolves and keeps it through the redirect, so a signed-out reader sees one frame of empty dashboard chrome before `/login` — accepted (doc/guide/stati.md). The submit button stays ENABLED with the password rules unmet, as before the redesign — the refusal is the reading line, not a dead control. That reading lives in a **polite** `role="status"` even on failure: a node that switched to `role="alert"` would change identity in the accessibility tree and some screen readers announce nothing across the swap. On success the form stays frozen until the redirect (it used to re-enable). The outcome toasts are gone from both pages: the tile says the state. `describeAuthError` covers 14 codes and anything else takes the generic sentence, so a NEW Firebase cause is invisible until it is added. The whitelist stays a DEROGATION from `REGISTRATIONS_ENABLED=false` (SETUP.md → Step 5b depends on it): `resolveRegistrationAccess` mirrors that, it does not correct it.
