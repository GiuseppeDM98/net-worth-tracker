# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive web only. There is no PWA and no native shell: `public/sw.js` is an explicit no-op stub, and there is no manifest. Mobile-first at 390px with desktop as an elevated variant — custom breakpoints `--breakpoint-desktop: 1440px` and `--breakpoint-tablet: 768px`; `lg:` is forbidden for wide-screen switches because iPad Mini in landscape is 1024px and is treated as mobile by design.

## Users

Investitori italiani attenti e autonomi che gestiscono in proprio il loro patrimonio — azioni, ETF, BTP, crypto, immobili, conti correnti. Usano l'app regolarmente (almeno mensile) per monitorare performance, dividendi e progresso verso FIRE. Non sono trader: sono accumulatori di lungo periodo, metodici, che vogliono dati affidabili e leggibili senza perdere tempo.

**Job to be done**: "Capire in pochi secondi com'è messa la mia situazione finanziaria, confrontarla col passato, e sentire che sto andando nella giusta direzione."

Three secondary audiences are confirmed by the code, not assumed:

- **Shared-account co-owner** — a second registered, whitelisted person granted full co-owner read/write under their own login, without ever seeing the owner's credentials. Theme stays per-viewer. The household case is real and modelled: multiple people's pension funds live in one account with the IRPEF saving computed per `FamilyMember`, and What-If can stop a single partner's salary in a shared portfolio.
- **Demo visitor** — an anonymous visitor auto-logged into a shared read-only account where every mutation and the AI Assistant are blocked. This audience disappears entirely when the `NEXT_PUBLIC_DEMO_*` vars are unset, so a self-hosted deployment has no public demo.
- **Self-hoster** — someone running their own instance from the public AGPL-3.0 repo via the documented Docker/VPS path.

## Product Purpose

A single place where an Italian self-directed investor can see their whole financial position — assets, cashflow, dividends, measured performance — and project it forward (FIRE, Coast FIRE, Monte Carlo, goals). Success for the user is a fast, trustworthy read plus a verdict on direction, not exhaustive reporting.

## Positioning

**Italian fiscal and instrument fidelity.** The defensible claim is arithmetic a neighbouring tracker gets *wrong*, not merely lacks: IRPEF brackets and the per-member deduction ceiling, imposta di bollo with its €5.000 checking-account threshold, the fondo pensione complementare modelled by contribution nature (TFR / Volontario / Datoriale) against each member's RAL, BTP Italia's additive FOI coupon that stays provisional until the rate is announced, Borsa Italiana scraping for Italian bonds and dividends, and Italy-timezone calendar boundaries throughout. An international tool can copy the feature list and still report the wrong number.

Three further behaviours are visible in the product and are *consequences* of that promise rather than the promise itself — recorded so future work does not mistake one for the other:

- refusing to state a number — or a sentence — it cannot stand behind (no annualization under six months, `—` instead of volatility with fewer than three monthly returns, an explanation instead of a `0,00%` pension return when the window is idle or suspicious, `Panoramica · dati d'esempio` above the landing's grid, and no figure at all on the three tiles that would have had to invent one; a month that fell while the market gained is "in calo, nonostante il mercato", never "il mercato ha pesato"; the Panoramica's market digest measures the price effect on what was held, never the user's own buys and sells, and hides rather than guesses when the previous snapshot has no per-asset breakdown);
- verdict-first information architecture — since 2026-08-22 the Panoramica opens with one rule-generated sentence that answers "come va?" before any number, over a grid of tiles that each answer one question with a reading line above the figures; the older "one dominant number plus a verdict, detail behind a collapsible" shape survives on the pages not yet propagated (`docs/redesign-prompts.md` is the plan);
- complete private ownership (AGPL self-hostable, no analytics or telemetry, illiquid and manually-valued assets modelled as first-class).

## Operating Context

**Personal instrument plus a self-hoster audience.** Today it runs for the author and one household co-owner; others are expected to run their own instance from the repo. The author does not host anyone else's data. Consequences that are settled by this, and should not be re-litigated per feature: setup documentation, the Docker/VPS path and demo quality matter; multi-tenant onboarding, a commercial model, a read-only permission tier below full co-owner, and legal/privacy copy are **out of scope**, not backlog.

- Registration can be switched off entirely or restricted to a server-side `REGISTRATION_WHITELIST` (deliberately not `NEXT_PUBLIC`, so emails never enter the client bundle). A co-owner must register *before* being granted access.
- Two distinct navigation shells: Sidebar (landscape/desktop) vs BottomNavigation + SecondaryMenuDrawer (portrait has no sidebar), so account-scoped affordances are duplicated in both.
- The product also reaches the user outside the app: periodic emails (monthly / quarterly / half-yearly / yearly) plus a weekly Sunday budget email.
- Onboarding is not a guided wizard: per-surface empty states name the single next action ("Aggiungi il tuo primo conto corrente", "Crea il primo centro", "Aggiungi asset per iniziare"). There is no asset or snapshot migration path — only expenses have a CSV importer.
- Quality is enforced by review, not by pipeline: 111 Vitest files / 2143 tests and 30 Playwright E2E specs exist (Panoramica, Cashflow/Tracciamento and FIRE still have no permanent E2E of their own), but there is **no CI** (`.github` holds only two issue templates).

## Capabilities and Constraints

Twelve dashboard routes in three named tiers — primary (Panoramica, Patrimonio, Cashflow), Analisi (Analisi, Rendimenti, Storico, Hall of Fame), Pianificazione (Allocazione, FIRE e Simulazioni, Previdenza) — plus Assistente and Impostazioni. On top of those: the asset trade ledger, expense CSV import with a mandatory preview and one-tap undo, a 7-section PDF export, periodic emails, the conversational AI Assistant and a separate on-demand AI performance report.

**Terminology** is settled and Italian-facing: TWR / IRR / XIRR / CAGR / Max Drawdown / Sharpe / Sortino; YOC / DPS / cedole / BTP Italia FOI; TFR / Volontario / Datoriale, RAL, risparmio IRPEF; Ribilancia / Versa / Preleva, `allocationRole` tradable|frozen|excluded, `leverageRatio`; imposta di bollo, TER. Page and feature names stay Italian permanently — they are the labels the product shows.

**Locale**: UI text Italian with `<html lang="it">`; code, comments and docs English. No i18n layer and no second language planned.

**Hard constraints** future work must preserve:

- EUR is the base currency; FX via Frankfurter with a 24h cache fallback.
- All calendar boundaries go through the Italy-timezone helpers in `lib/utils/dateHelpers.ts`.
- `firebase-admin` is pinned at `^13.6.0` — @14 pulls pure-ESM `jose@6` and breaks on Vercel — so 8 moderate `uuid` advisories are knowingly accepted.
- Layered architecture: App Router → `lib/services` → pure `lib/utils` → `lib/server`, with React Query for caching and invalidation.
- A pension fund's value lives in `quantity` at price 1, like an account balance.
- `cashflowHistoryStartYear` is shared across Cashflow / Storico / Assistant / overview and must not be renamed.
- Category identity is keyed by document id, never by name.
- The cron named `monthly-snapshot` actually runs daily at 18:00 UTC.

**Required third-party services**, none of which is a partnership or endorsement: Yahoo Finance, Borsa Italiana (scraping), Frankfurter (FX), FRED (`FRED_API_KEY`, series ECBDFR), Anthropic (`ANTHROPIC_API_KEY`; `claude-sonnet-5` + `claude-haiku-4-5`), Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`).

**Opt-in / flagged capabilities**: `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, `costCentersEnabled`, Budget, `stampDutyEnabled`, goal-driven allocation, and the demo-mode env trio.

**Commercial model**: none. There is no pricing, plan, trial, billing code or payment provider anywhere in the repo. The product is free and open-source under AGPL-3.0.

## Brand Commitments

**Elegante · Personale · Essenziale.**

L'app è la Apple dei personal tracker finanziari: non lo strumento più ricco di feature, ma quello che ti fa capire la tua situazione nel modo più chiaro, bello e immediato possibile. Come un wealth manager privato su misura — non parla a tutti, parla a te. L'eccellenza si esprime nella semplicità apparente che nasconde profondità reale, non nella complessità mostrata.

Binding anti-references: Bloomberg terminal (too cold and dense), Revolut-style consumer fintech (too light for serious data), Material Design (too generic), and **ostentated complexity** (UI that demonstrates how hard the domain is instead of hiding it behind a calm surface).

**Visual authority lives in `DESIGN.md`, not here.** It is hand-maintained and must never be regenerated; its YAML frontmatter (OKLCH palette, the enumerated 9→54px type ramp) is the normative layer, and `.impeccable/design.json` is only an extensions sidecar. Since 2026-08-22 it documents the "Verdict over Tiles" shape set by the Panoramica and marks the patterns that shape superseded; the app is being propagated onto it page by page, so two generations coexist by design until the plan in `docs/redesign-prompts.md` is done. CLAUDE.md's aesthetic summary is a known-incomplete paraphrase — do not treat it as the source.

## Evidence on Hand

- **11 anonymized product screenshots** in `docs/screenshots/` — all eleven are of the new generation: `portfolio-overview.png` (retaken 2026-08-22), `dividend-calendar.png` (retaken 2026-08-23), `cashflow-sankey.png` and `cashflow-drilldown.png` (both retaken 2026-08-25 on Analisi: the Flusso tile with its subcategory layer, and the Scheda of a subcategory), `performance-metrics.png` and `monthly-heatmap.png` (both retaken 2026-08-25 on Rendimenti: the verdict over the first two rows of tiles on «1 anno», and the Consistenza tile with the heatmap in the sign tokens), `history-networth.png` (retaken 2026-08-25 on Storico: the verdict over Evoluzione and Raddoppi, the top of Composizione and Driver), `hall-of-fame.png` (retaken 2026-08-25 on Hall of Fame: the verdict over Record del patrimonio, Entrate, Risparmio record and Anni), `asset-allocation.png` (retaken 2026-08-25 on Allocazione: the verdict over Bilanciamento, Piano, Per classe and Esposizione), `fire-calculator.png` (retaken 2026-08-25 on FIRE › Calcolatore: the verdict «FIRE nel …» over Traguardo, Base di calcolo, Reddito passivo and Scenari, on the synthetic «Mario» account), `monte-carlo.png` (retaken 2026-08-26 on FIRE › Monte Carlo: the verdict «Il piano regge nel …% dei casi» over Probabilità, Distribuzione and Scenari a confronto and the head of the Parametri tile, on the synthetic «Mario» account), all from throwaway synthetic emulator accounts, after the shell redesign and the «Verdict over Tiles» propagation: compact header, sidebar with eyebrow group labels and the assistant as a route, tiles. None covers Previdenza, Assistente, Storico per-instrument, Goal-Based Investing or Impostazioni.
- **App icons only**: `app/apple-icon.png` and `public/favicon/`. `public/` otherwise contains just the `sw.js` stub.
- **Two complete production HTML email templates** under `lib/server/`.
- Developer emulator / E2E seed fixtures (`scripts/seedPensionE2E.mts`) — synthetic data, never to be presented as real.

**Absences that are settled facts, and must never be fabricated:**

- No testimonials, customer names, case studies, ratings or press.
- No usage data of any kind — there is no analytics or telemetry (no GA, PostHog, Plausible, Mixpanel, Sentry, Vercel Analytics). Any claim about how people use the product would be invented.
- No privacy policy, terms, cookie or GDPR copy, and no `/privacy` or `/terms` route.
- No Lighthouse scores or performance benchmarks.
- No production domain — every documented URL is a placeholder — and no owned sending domain (`from` falls back to `noreply@example.com` / `onboarding@resend.dev`).
- No logo lockup, wordmark, OG image or illustration set.

The public landing practises the honest-surface rule this implies, and on 2026-08-31 it was rebuilt to practise it properly. The old version stated four "proof stats" as structural facts about the tool — and the first of them, "6 classi di asset", had been **wrong since 2026-08-21**, when `trendFollowing` and `carry` brought the union to eight: a hand-typed count in marketing copy outlived the change it described, and this document cited that very line as an example of honesty. The rebuilt landing shows the app's own Panoramica tiles on an invented profile declared above the grid ("dati d'esempio"), whose internal arithmetic is pinned by tests, and three further tiles that print no figures at all — they name what a section computes, with every number in them read from the module that owns it (the benchmark list, the Monte Carlo default, the pension deduction ceiling, `ASSET_CLASS_SEQUENCE.length`). The lesson is the rule: **a fact about the product is quoted from the code that implements it, never retyped beside it** (DESIGN.md → The Sample-Data Rule).

## Product Principles

1. **Wrong beats missing — so refuse.** A figure the product cannot stand behind is not shown as a number. Every window, threshold and exclusion is stated on the surface that uses it. A zero is an assertion, and must be distinguishable from an absence.
2. **Italian by construction, not by translation.** Tax rules, instruments and calendar boundaries are modelled natively. When a generic model and the Italian reality disagree, the Italian reality wins.
3. **The verdict comes first, and it is honest.** Each page opens with a sentence that answers its question ("Agosto sta andando bene."), generated by rules and never claiming what the data cannot support; the numbers follow as tiles that each answer one question; depth is one scroll or one interaction away, never in the way.
4. **The user owns the whole picture.** Illiquid and manually-valued holdings are first-class, self-hosting is real, and nothing is measured about the user by anyone.
5. **Scope is a personal instrument.** Features earn their place by serving one household well, not by widening the addressable audience.

## Accessibility & Inclusion

**No formal conformance target is claimed.** The product cites individual success criteria normatively (1.3.1, 1.4.11, 2.1.1, 2.5.5, 4.1.2) but declares no WCAG version, and there is no automated checking — no `eslint-plugin-jsx-a11y`, no axe, no Storybook a11y addon, no a11y assertions in the Playwright specs. Claiming conformance without a way to verify it would be exactly the kind of unbacked statement Principle 1 forbids.

What **is** binding is the de-facto house standard, enforced by review:

- AA text contrast (4.5:1), and 3:1 for non-text identity signals — the cost-center palette was migrated off raw hex precisely because two of eight failed that floor in light mode.
- Touch targets 44×44px; everything keyboard-operable, with explicit keyboard handlers wherever a non-interactive element takes an `onClick`.
- `aria-label` never `title`; Radix Dialog/Drawer descriptions; correct `tablist`/`tab`/`tabpanel` wiring; `role="group"`/`radiogroup`; table `scope`; `aria-live` on streaming output.
- `prefers-reduced-motion` honoured through a single source of truth (Framer `useReducedMotion` / `MotionConfig reducedMotion="user"`), plus a global `.animate-spin` kill and `matchMedia` checks in imperative animations.
- Sign colour always through `getMetricValueColor()`; chart colour through `useChartColors()`, whose luminance guard falls back when OKLCH L > 0.82 in light or < 0.30 in dark.

**Known open defect**: `PageTabBar`'s compact/pill mode renders no accessible name for inactive tabs below the 1440px breakpoint, affecting the Impostazioni, Cashflow and FIRE tab bars.
