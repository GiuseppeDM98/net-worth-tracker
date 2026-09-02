# Landing pubblica

> **Quando aprire questa guida** — chi tocca `app/page.tsx`, `components/landing/LandingPromiseTile.tsx`, `lib/utils/{landingNarrative,landingSampleData}.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Landing pubblica*.

## Landing pubblica (`app/page.tsx`, `components/landing/LandingPromiseTile.tsx`, `lib/utils/{landingNarrative,landingSampleData}.ts`)

- **The landing renders the app's OWN tiles, not pictures of them.** `PatrimonioTile`, `CashflowTile`,
  `ComposizioneTile` and `ObiettivoTile` are imported from `components/dashboard/overview/` and fed an
  invented profile (`landingSampleData.ts`). A mock-up of the Panoramica would age the moment the
  Panoramica changed, and the landing is the one surface where staleness is read as dishonesty.
- **The hero is ONE component for THREE surfaces now.** `PatrimonioTile` used to take the whole
  `DashboardOverviewPayload` and read five fields of it; it takes those five as props
  (`variations`, `isNewATH`, `movers`, `assetCount`, `hasCurrentMonthSnapshot`), because the landing
  has no account and therefore no payload. `movers` no longer defaults to `overview.topMovers`: the
  Panoramica maps its per-CLASS movers at the call site, Patrimonio passes instruments.
- **The sample profile has invariants, and `__tests__/landingSampleData.test.ts` pins them**: the six
  classes sum to the gross total and their shares to 100%, both variations are DERIVED from the
  sparkline (last two points; the previous December), the market digest is smaller than the monthly
  variation (the rest is contributions), income − expenses = net in both months, and the month-end
  projection at day 27 lands below the previous month so the tile's positive token is earned. Change
  one figure and the tests say which relation broke.
- **The month is FIXED (agosto 2026), not derived from the clock.** A profile whose month followed
  today would need its expenses to follow the day too, and a projection computed on the 3rd is
  nonsense. A snapshot that is labelled ages better than a half-simulated "now".
- **The verdict is the PRODUCT's promise and is the SAME sentence as /login's** —
  `PRODUCT_PROMISE_HEADLINE` in `authNarrative.ts`, imported by both. Its one state is
  `demoAvailable`: without the demo credentials the clause about the demo disappears from the
  sentence AND the button is not rendered, so the page can never point at a control it does not have.
- **The «dati d'esempio» declaration belongs to the REGION, not to the tile.** One eyebrow +
  one 13px reading at the head of the grid (`SAMPLE_PROFILE_EYEBROW`, `describeSampleProfile`), plus
  the hero's own count line («11 asset · profilo d'esempio»). A caption under a single number reads
  as a footnote to that number alone; four repetitions of the word read as an apology.
- **The three promise tiles print no invented figures at all** (`LandingPromiseTile`): they name what
  a section computes, one measure per row. The only numbers they carry are facts about the TOOL, and
  each is read from the module that owns it — `BENCHMARKS.length`,
  `DEFAULT_MONTE_CARLO_SIMULATIONS`, `getPensionDeductionCeiling(year)`. Never type one of those
  numbers here. `DEFAULT_MONTE_CARLO_SIMULATIONS` had to LEAVE `MonteCarloTab` for
  `lib/utils/monteCarloParams.ts` (which has no imports at all): the obvious home,
  `monteCarloService`, imports `chartService` and therefore the client Firebase SDK — the same
  reach problem that moved the it-IT formatters (AGENTS.md § Italian Localization).
- **The footer counts the asset classes from `ASSET_CLASS_SEQUENCE`.** The pre-redesign landing
  claimed «6 classi di asset» and kept claiming it after `trendFollowing` and `carry` were added
  (2026-08-21); PRODUCT.md → *Evidence on Hand* cited that very line as an example of an honest
  surface, so both were wrong together.
- **The «Registrati» link mirrors the server**: `resolveRegistrationAccess` again (the same function
  the registration page uses), and `describeRegistrationInvite` returns `null` on `closed` — an
  invitation behind a door the server keeps shut is worse than no link.
- **The page root is `PageContainer width="wide"` with `max-desktop:portrait:pb-0`**: the container's
  bottom padding exists for the phone's nav pill, and the landing has none.

## Per-page blind spots

- **Landing pubblica**: no Playwright spec (the session's throwaway one was deleted after 18/18 green at 1440 and 390, with the demo flag both ON and OFF, and three guards falsified). The sample profile is a FIXED snapshot of agosto 2026, so the Cashflow tile says «agosto» whatever month it is read in — declared, not hidden. The period selector over the sparkline works and filters the invented series: it is the app's own hero, selector included. `ObiettivoTile` shows at most three goals and the sample has exactly three. The three promise tiles carry no `aria` beyond the tile's own region label. The count of colour themes is NOT stated anywhere: `ColorTheme` is a union type with no runtime enumeration, so it could not be read from code and was dropped rather than typed by hand. The page is prerendered as static content, but what the prerender contains is the SPINNER (`loading` is true until Firebase auth resolves in the browser), so `getItalyYear()` — which decides the pension ceiling the Previdenza promise prints — is only ever evaluated on the client.
