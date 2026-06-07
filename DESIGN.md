---
name: Net Worth Tracker
description: Precision financial dashboard for Italian self-directed investors.
# OKLCH-native project. Stitch linter will flag non-hex values; OKLCH is the canonical format.
colors:
  # Achromatic neutrals — default theme (dark mode = primary experience)
  deep-void: "oklch(0.145 0 0)"
  charcoal-surface: "oklch(0.205 0 0)"
  graphite-lift: "oklch(0.269 0 0)"
  off-blanc: "oklch(0.985 0 0)"
  near-white: "oklch(1 0 0)"
  mid-ash: "oklch(0.708 0 0)"
  subtle-ash: "oklch(0.556 0 0)"
  border-ghost: "oklch(1 0 0 / 10%)"
  border-stone: "oklch(0.922 0 0)"
  # Data visualization (dark mode defaults)
  indigo-signal: "oklch(0.488 0.243 264.376)"
  jade-return: "oklch(0.696 0.17 162.48)"
  amber-watch: "oklch(0.769 0.188 70.08)"
  violet-risk: "oklch(0.627 0.265 303.9)"
  coral-loss: "oklch(0.645 0.246 16.439)"
  # Semantic
  destructive: "oklch(0.5771 0.2152 27.325)"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  numeric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.off-blanc}"
    textColor: "{colors.charcoal-surface}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.border-stone}"
    textColor: "{colors.charcoal-surface}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mid-ash}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 12px"
  card-default:
    backgroundColor: "{colors.charcoal-surface}"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.off-blanc}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  badge-default:
    backgroundColor: "{colors.off-blanc}"
    textColor: "{colors.charcoal-surface}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
---

# Design System: Net Worth Tracker

## 1. Overview

**Creative North Star: "Effortless Precision"**

This system is built for one purpose: total clarity about your financial position. The design ambition is to be the Apple of personal finance trackers — not the most feature-rich instrument, but the one that makes you immediately understand your financial situation, beautifully and effortlessly. Every element earns its place by communicating a number, a trend, or a relationship. The aesthetic draws from three co-primary references: Linear/Vercel clarity, Trade Republic data hierarchy, and Apple's effortless premium.

**Linear / Vercel** provides the structural foundation: tight geometry, achromatic palette, strong typography, physics-native motion, zero decorative chrome.

**Trade Republic** provides the data hierarchy: the primary number dominates physically and visually. Layout flows vertically — dominant value → inline variation chip → small label metadata. Flat `divide-y` lists instead of card-within-card nesting. No decorative progress bars. No box-within-box. Visual chrome is reduced to its structural minimum: only what separates, never what decorates.

**Apple (Stocks, Wallet, Health)** provides the quality benchmark: complex data made effortlessly readable. Generous whitespace as a design material — not wasted space, but earned breathing room. Light mode equally premium to dark. Surfaces that feel considered and valuable. Progressive disclosure: the essential at a glance, depth on interaction. The interface recedes so the numbers speak.

The three references are compatible. All share zero tolerance for decoration that doesn't carry information, strong typography as structure, and the conviction that simplicity is harder to achieve than complexity.

**The Unifying Law — Form Follows Function.** Beneath all three references sits a single conviction, the one Jony Ive carries forward from the modernist tradition: form follows function. Every visual property of every element — its size, weight, color, position, motion, even its corner radius — is a *consequence* of what that element does, never a costume applied to it afterward. A number is large because it is the most important fact on the screen, not because "large" looks impressive. A border is 1px at 10% opacity because that is precisely the contrast required to separate — no more. Motion exists to reveal a relationship the eye would otherwise miss. When form and decoration disagree, function wins, every time. Three corollaries follow Ive's reading of the principle: **honesty** — a surface never fakes a depth, material, or state it doesn't have (no false glass, no invented shadow hierarchy); **deference** — the interface is a quiet instrument that recedes so the data can speak; **inevitability** — a well-resolved element looks like the only possible answer, as if it could not have been otherwise. This law is the *why* behind every rule that follows: zero-chroma, the Mono Mandate, ambient elevation, chrome reduction — each is form bending to function, not the reverse.

Both dark and light modes are primary, equally refined experiences. An Italian investor reviewing portfolio performance deserves precision and premium quality regardless of their environment or preference.

The five named color themes (Solar Dusk, Elegant Luxury, Midnight Bloom, Cyberpunk, Retro Arcade) are personality layers on top of a structural foundation. They change accent and surface palette without touching the underlying type scale, radius, or component API. The default theme is the instrument in its raw state. The themes are its finishes.

This system explicitly rejects four aesthetic modes: Bloomberg terminal coldness (too dense and impersonal for a personal wealth journal), consumer fintech brightness (Revolut-style gradients and playful fills trivialize serious data), Material Design genericism (component conventions that serve any app therefore serve this one poorly), and **ostentated complexity** (UI that demonstrates how hard the domain is rather than hiding that complexity behind a calm surface).

**Key Characteristics:**
- Form follows function: every visual property is derived from what an element does — honesty over illusion, deference over decoration, inevitability over ornament
- Achromatic structural palette; data colors carry all chromatic meaning in the default theme
- Geist Sans for interface text, Geist Mono for every number that matters
- Radius is refined: 10px (inputs, buttons), 16px (cards) — premium curve without losing authority
- Elevation is ambient: surfaces layer through background steps, shadows are atmospheric whispers
- Motion is physics-native: spring dialogs, ease-out-quart state transitions, circle-reveal theme toggle
- Hierarchy is Trade Republic-style: one dominant value per section, everything else is context
- Chrome reduction is deliberate: flat lists over nested cards, divide-y over borders-on-boxes
- Mobile-first: layouts are designed at 390px first; desktop adds columns, never simplifies
- Light and dark modes are equally premium — different materials, same quality standard

## 2. Colors: The Zero-Chroma Foundation

The default palette has no hue anywhere. Every neutral is a pure OKLCH gray. Chart colors, financial indicators, and user-chosen themes supply all chromatic energy. The interface does not compete with the data it presents.

### Primary (Structural — Dark Mode)

- **Deep Void** (`oklch(0.145 0 0)`): The page background in dark mode. Zero chroma, minimum lightness. Numbers feel more precise against it than any tinted dark.
- **Charcoal Surface** (`oklch(0.205 0 0)`): Card and modal backgrounds. The first elevation step above the void.
- **Graphite Lift** (`oklch(0.269 0 0)`): Muted panels, secondary surfaces, hovered interactive backgrounds. The second elevation step.
- **Off-Blanc** (`oklch(0.985 0 0)`): Primary text in dark mode; page background in light mode. Near-white without the harshness of pure `oklch(1 0 0)`.
- **Near-White** (`oklch(1 0 0)`): Light mode card backgrounds and the lightest possible highlight. Used sparingly.

### Neutral

- **Mid-Ash** (`oklch(0.708 0 0)`): Secondary text, timestamps, supplementary labels. The workhorse of de-emphasis.
- **Subtle Ash** (`oklch(0.556 0 0)`): Placeholder text, disabled labels, tertiary metadata.
- **Border Ghost** (`oklch(1 0 0 / 10%)`): Card and container borders in dark mode. Near-invisible; enforces separation through barely-perceptible contrast rather than hard lines.
- **Border Stone** (`oklch(0.922 0 0)`): Card and input borders in light mode. Soft, unobtrusive.

### Data Visualization (Dark Mode Defaults)

Five chart colors cover the semantic range of portfolio data. These are the system's only sanctioned source of hue in the default theme.

- **Indigo Signal** (`oklch(0.488 0.243 264.376)`): Primary chart series; equities, main portfolio line. Also the sidebar active-state indicator in dark mode.
- **Jade Return** (`oklch(0.696 0.17 162.48)`): Secondary chart series; bonds, positive comparison benchmarks.
- **Amber Watch** (`oklch(0.769 0.188 70.08)`): Tertiary series; commodities, warning badge backgrounds.
- **Violet Risk** (`oklch(0.627 0.265 303.9)`): Quaternary series; crypto, drawdown overlays.
- **Coral Loss** (`oklch(0.645 0.246 16.439)`): Fifth series; negative returns, expense categories. Red-adjacent without alarm.

### Semantic

- **Destructive Flame** (`oklch(0.5771 0.2152 27.325)`): Destructive actions only. Saturated enough to demand attention without being an emergency siren.

### Named Rules

**The Zero-Chroma Rule.** The default surface palette has no hue. Adding a brand color to buttons, cards, or navigation in the default theme is forbidden. Color is earned by data, not decoration.

**The Data Owns Color Rule.** Chart palettes, performance indicators, and the five named themes are the only sanctioned sources of chromatic energy. Interface chrome in the default theme is always achromatic.

**The Sign-Color Token Rule.** Positive/negative *value* coloring (gain vs loss, income vs expense, up vs down deltas, variation chips, fiscal gains) always uses the theme-aware semantic tokens: `text-positive` for positive, `text-destructive` for negative, with `bg-positive/10` / `bg-destructive/10` for chip tints. Raw Tailwind `text-green-*` / `text-red-*` is forbidden here — those classes stay literal regardless of the active theme and diverge from `--destructive` on non-default themes (e.g. Cyberpunk renders destructive as orange), which would put two different "negative" colors on the same screen. `getMetricValueColor()` in `lib/utils/metricColors.ts` is the single source of truth for resolving the sign color. (Buy/sell *signal* chips — COMPRA/VENDI/OK — are a separate case, theme-mapped to the chart palette via `useActionColors`; see the ActionChip component.)

## 3. Typography

**UI Font:** Geist Sans (with `system-ui, sans-serif` fallback)
**Numeric Font:** Geist Mono (with `ui-monospace, monospace` fallback)

**Character:** Geist Sans is a neo-grotesque that reads precisely without clinical coldness. Its slightly geometric construction aligns with the Linear/Vercel reference. Geist Mono is not an afterthought: it is half the design system. Every monetary value, percentage, ratio, and structured date uses monospace figures — tabular numeral alignment is non-negotiable when columns of numbers must read as columns.

### Hierarchy

- **Display — Page Hero** (700 weight, `44px` mobile / `54px` desktop, lh implicit, ls `-0.03em`): The single dominant number on the page — net worth total on Overview. Always `font-mono tabular-nums`. In Tailwind: `text-[44px] font-bold font-mono tracking-[-0.03em] desktop:text-[54px]`. One instance per view maximum.
- **Display — Section Hero** (700 weight, `36px`, lh 1, ls `-0.03em`): Primary metric in a bento card or section hero block — e.g. TER, Annual Cost, FIRE Number. In Tailwind: `text-[36px] font-bold font-mono tabular-nums tracking-[-0.03em] leading-none`.
- **Sub-hero Value** (700 weight, `22px`, lh 1, ls `-0.025em`): Secondary metrics that sit below the dominant number or in paired value blocks — e.g. Liquid / Illiquid amounts, Entrate / Spese figures. In Tailwind: `text-[22px] font-bold font-mono tracking-[-0.025em] tabular-nums leading-none`.
- **Headline** (600 weight, 1.25rem, lh 1.25, ls -0.01em): Section headers, dialog titles, card-level titles where data density demands authority.
- **Title** (600 weight, 1rem, lh 1.4, ls -0.005em): Sub-section headers, table group labels, the step below Headline.
- **Body** (400 weight, 0.875rem, lh 1.6): All prose, descriptions, note content. Max line length 65ch.
- **Label** (500 weight, 0.75rem, lh 1.4, ls +0.01em): Input labels, tags, stat captions, tab text. Slightly tracked for legibility at small sizes.
- **Eyebrow Label** (600 weight, `10px`, uppercase, ls `0.1em`, muted): Section eyebrow — the small all-caps label placed above a dominant number. In Tailwind: `text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground`. Never competes with the number it names. Use 9px / `tracking-[0.08em]` for sub-eyebrows inside compact cells. Context can be appended with a centered-dot separator: `Cashflow · MAGGIO 2026` — the `·` joins without adding another label.
- **Delta Annotation** (Geist Mono, 400 weight, `12px`, ls 0): The small trend line that appears directly below a sub-hero value inside a KPI chip — e.g. `+5.2% vs mese scorso`. Always `font-mono`. Color follows sign semantics via the theme tokens (see **The Sign-Color Token Rule**): `text-positive` for positive, `text-destructive` for negative — never raw `text-green-*`/`text-red-*`. **Inverted semantics for expense metrics**: a positive delta on Spese is bad; parameter the color via `positiveGood: boolean`. In Tailwind: `text-[12px] font-mono mt-1.5 text-positive` (or `text-destructive`); prefer `getMetricValueColor()`. A neutral subline (non-trend) uses `text-[12px] text-muted-foreground mt-1.5`.
- **Numeric** (Geist Mono, 400 weight, 0.875rem, lh 1.4, `font-feature-settings: "tnum" 1`): All monetary values, percentages, dates, quantities in financial contexts. Tabular figures always enabled.

### Named Rules

**The Mono Mandate.** Every number in a financial context uses Geist Mono with `tnum` features. No exceptions: KPI cards, table cells, chart axis labels, percentage badges. A number set in Geist Sans loses its financial authority.

**The Two-Font Rule.** The system uses exactly two fonts. No display serif, no decorative typeface, no icon font treated as type. Hierarchy is expressed through scale and weight within the same two families.

## 4. Elevation

This system uses ambient depth: tonal background stepping combined with a consistent, low-opacity shadow vocabulary. Neither approach alone; both together.

Surfaces build depth first through background-value steps (Deep Void → Charcoal Surface → Graphite Lift), then layer shadow to signal function. A surface that floats above the page (modal, floating nav pill) gets a shadow that physically separates it. A surface that organizes content in place (card) gets a whisper shadow that barely catches light.

### Shadow Vocabulary

- **Whisper** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)`): Inputs, form fields. Barely perceptible — gives a field its "inset" quality without adding visual weight.
- **Lift** (`box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`): Cards, contained data panels. Separates a surface from the page without announcing itself.
- **Float** (`box-shadow: 0 4px 24px rgba(0,0,0,0.28)`): Floating elements that leave document flow — the mobile nav pill, dropdown menus, detached popovers. The one shadow that is large and felt. Reserved for elements that genuinely hover above the page.

### Named Rules

**The Ambient Rule.** Shadows here are atmospheric, not structural. A card's 1px border at 10% opacity does more compositional work than its shadow. Don't increase shadow size when a lighter border or a background-step change solves the separation problem.

**The Float Threshold.** The Float shadow is reserved for elements that physically exit the document flow. Using it on an in-flow card creates false depth hierarchy and is an error.

## 5. Components

### Buttons

Each variant has a physical quality: an opacity shift on hover that reads as gentle press, a soft focus ring that glows without screaming. Efficient and tactile.

- **Shape:** Medium curvature (8px radius). Not sharp enough to feel harsh; not rounded enough to feel playful. Matches input fields for optical consistency across form contexts.
- **Primary (dark mode):** Off-Blanc fill (`oklch(0.985 0 0)`), Charcoal Surface text (`oklch(0.205 0 0)`). Height 36px, horizontal padding 16px. Hover: 10% opacity reduction via `/90` modifier.
- **Primary (light mode):** Deep Void fill, Off-Blanc text. Same geometry, inverted colors.
- **Focus:** `ring-[3px] ring-ring/50` — a soft glow. The `/50` opacity prevents the ring from overwhelming surrounding content.
- **Outline:** Border + transparent background. Hover fills with `--accent` surface step. Secondary actions alongside a primary.
- **Ghost:** No border, no background at rest. Hover reveals `--accent` fill at 50% opacity in dark mode. Dense data tables and toolbars where button chrome adds noise.
- **Destructive:** Destructive Flame fill. Irreversible actions only. Never a general negative indicator.
- **Disabled:** `opacity-50`, pointer events off. Shape persists at half presence.

### Cards

Cards organize data panels, KPI groups, and chart containers. Structural, not decorative.

- **Corner Style:** `rounded-2xl` (16px). This is the standard for all primary cards, hero cards, and bento cells. Use `rounded-xl` (14px) only for sub-elements inside a card (e.g. muted sub-tiles). Buttons and inputs remain at 8px (md) — the larger radius signals a container, not an interactive target.
- **Background:** `--card` (dark: Charcoal Surface `oklch(0.205 0 0)`; light: Near-White `oklch(1 0 0)`).
- **Shadow Strategy:** Lift shadow (`0 1px 3px rgba(0,0,0,0.1)`). Always present; always quiet.
- **Border:** 1px, `--border` (Border Ghost dark; Border Stone light). The border carries most of the compositional separation work.
- **Internal Padding:** `p-[22px]` (22px) for primary hero cards and featured content cards. `p-5` (20px) for compact bento cells and chart containers. The older `p-6` (24px) is only acceptable in dialogs or settings forms. The difference is intentional: 22px feels tighter and more "instrument-like" than 24px at data density.

#### Bento Cell (Naked Card Variant)

For bento grid cells that sit alongside a Card component, use the naked pattern — raw `div` instead of the `Card` component — to avoid shadcn's internal flex-col that can break inner layouts:

```tsx
<div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
```

This is preferred over `<Card><CardContent>` when the cell needs explicit flex direction control or when `flex-1` / `h-full` behavior is critical for grid row height matching.

### Inputs / Fields

- **Style:** Transparent background at rest, 1px stroke (`--input`/`--border`), 8px radius. Height 36px. Whisper shadow (`0 1px 2px rgba(0,0,0,0.05)`) for faint depth. Dark mode adds `bg-input/30` fill to signal editability on a dark surface.
- **Focus:** `border-ring` + `ring-[3px] ring-ring/50`. The ring opacity softens what would otherwise be an overpowering indicator.
- **Error:** `border-destructive` + `ring-destructive/20`. Error state is communicated through border color, not background change.
- **Placeholder:** `--muted-foreground`. Subdued; clearly not content.
- **Disabled:** `opacity-50 pointer-events-none`. Geometry preserved, content grayed.

### Badges

- **Style:** `rounded-md` (8px), border treatment, `px-2.5 py-0.5`, `text-xs font-semibold`. Height follows content.
- **Default:** Primary fill. Asset type labels, active status indicators.
- **Secondary:** Secondary surface fill. Secondary metadata, lower-emphasis tags.
- **Outline:** Border only, no background. Filter chips and neutral tags where fill adds excess weight.
- **Destructive:** Destructive Flame fill. Delete confirmations, critical status.

### Navigation

- **Desktop:** Sidebar with `--sidebar` background (theme-aware). Active state: `--sidebar-primary` color. In the default dark theme this is Indigo Signal (`oklch(0.488 0.243 264.376)`) — the only context where a non-achromatic color appears in the default theme on the interface chrome. Primary routes text-full; secondary routes in a collapsible drawer.
- **Mobile:** Floating pill at bottom of viewport. `border-radius: 9999px`, `--sidebar` background, `1px solid --sidebar-border`, Float shadow (`0 4px 24px rgba(0,0,0,0.28)`). Positioned `bottom: calc(env(safe-area-inset-bottom, 0px) + 12px)`. Three primary routes + "Altro" drawer trigger. Landscape orientation hides the pill entirely (horizontal screen real estate is used differently).
- **Active indicator:** Framer Motion animated highlight under active item. State changes trigger instant color switch; route transitions use page-level animation.

### The Net Worth Counter (Signature Component)

The animated currency counter in Overview KPI cards is the system's most distinctive interactive element. Count-up animation is isolated to the leaf `<span>` containing the value, preventing surrounding layout reflow. `Intl.NumberFormat` results are cached via `cachedFormatCurrencyEUR` to prevent allocation on every render frame. Mounting is deferred through `requestIdleCallback`: the hero section settles first, charts mount after. Numbers land — they count from a prior value, never from zero.

### Variation Chips (Canonical Pattern)

Periodic changes (monthly, YTD) are displayed as compact inline chips directly below the hero number — not as separate cards. This keeps the primary number dominant while giving immediate trend context.

**Structure:** `inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px] text-[15px] font-semibold font-mono tracking-[-0.01em]`

**Colors:** (theme-aware tokens — see **The Sign-Color Token Rule**)
- Positive: `bg-positive/10 text-positive`
- Negative: `bg-destructive/10 text-destructive`

Never use raw `bg-green-500/10 text-green-500` / `bg-red-500/10 text-red-500` here: those stay literal red/green regardless of theme and clash with `--destructive` on non-default themes (e.g. Cyberpunk = orange). Resolve the text color via `getMetricValueColor()` (`lib/utils/metricColors.ts`) where practical.

**Content:** `{icon} {+/-}{formattedValue} ({+/-}{pct}%) {period label}` — e.g. `↗ +€1.240,00 (+2.34%) questo mese`

**Rules:** Only render when snapshot data exists (at least one prior period). Never show a placeholder chip — absence communicates "no prior data" cleanly. Icon is `TrendingUp` or `TrendingDown` at `h-[13px] w-[13px]`. Multiple chips wrap naturally via `flex-wrap gap-2`. Use `font-mono` for the value — the chip contains a financial number and must satisfy the Mono Mandate.

**Note (delta semantics):** For expense metrics, the sign convention is inverted: a positive delta on Spese is bad (spending went up), a negative delta is good. The color logic must be parameterized, not hard-coded: `positiveGood: boolean` governs the `text-positive` / `text-destructive` assignment.

### Dominant Value Block (Trade Republic Pattern)

The canonical layout for any section where one number is the primary takeaway — asset value, allocation total, account balance.

**Structure:**
```
[eyebrow label — text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground]
[primary value — text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em]]
[variation chips — inline-flex, wrapped via flex-wrap gap-2]
[tertiary metadata — text-[11px] text-muted-foreground]
```

**Rules:**
- Primary value is always `font-bold font-mono`. Page heroes use `text-[44px] desktop:text-[54px]`. Section heroes use `text-[36px]`. Sub-hero paired values use `text-[22px]`. Never `text-2xl` (24px) for a page or section hero — the jump from 22→36→44→54 is intentional.
- The eyebrow label above is `text-[10px]` uppercase and muted — it names the number without competing with it.
- Variation (gain/loss, percentage) appears inline directly below the value as chips, never as a separate card or column.
- Tertiary metadata (count, footnote) uses `text-[11px] text-muted-foreground` — present for reference, invisible at a glance.
- Never place two equally-weighted numbers side by side. One must dominate; the other is context.

### Flat List Row (Trade Republic Chrome Reduction)

The canonical pattern for lists of financial items — assets, allocation rows, transaction history — where card-within-card nesting would add visual weight without adding information.

**Structure:** `divide-y divide-border` container, each row is a `flex items-center justify-between py-3 px-0` div (no background, no border-radius, no shadow).

**Rules:**
- No card box per row. The `divide-y` line is the only separator.
- Container may live inside a Card for page-level organization, but rows inside are always flat.
- Hover state: `hover:bg-muted/30` — barely perceptible, confirms interactivity without adding chrome.
- Row content follows Dominant Value Block hierarchy: primary value right-aligned in `font-mono`, label left-aligned.
- Use this pattern wherever a `<ul>` of items would otherwise become a grid of `<Card>` boxes.

### ActionChip

A compact, text-only chip for contextual financial actions (buy / sell / hold signals, allocation status). Replaces color-coded icons where the action label carries more information than the icon.

**Variants:**
- **COMPRA** (buy signal): `bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20`
- **VENDI** (sell signal): `bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20`
- **OK** (on-target): `bg-muted text-muted-foreground border border-border`

**Structure:** `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium`

**Rules:**
- Text only — no icons inside an ActionChip. The label is the signal.
- Never use ActionChip for navigation or primary actions. It is a status indicator, not a button.
- On touch devices, ensure minimum 32px tap height via parent padding.

### Segmented Pill Control

A tab switcher for mutually exclusive views within a section. Replaces `<Select>` dropdowns where options are few and always visible. The active pill animates via Framer Motion `layoutId` spring.

**Structure:** `role="tablist"` container with `bg-muted rounded-lg p-1 w-fit mx-auto`, each option is a `role="tab"` `motion.button` with `layout="size"`. Active pill is a `motion.div` with `layoutId` and `bg-background shadow-sm` that slides between options.

**Spring:** `stiffness: 400, damping: 35` — snappy without overshooting. Same constant on both `motion.button` `transition` and `motion.div` `transition`.

#### Variant A — Icon tabs (section navigation)

Used in `PageTabBar` for pages with multiple named sections (Cashflow, Settings, FIRE). Each tab has a meaningful icon.

- **Active tab:** icon + full label. `motion.button layout="size"` expands smoothly.
- **Inactive tabs:** icon only — label hidden. Tabs shrink to icon width.
- **Fallback:** if a tab has no icon, always show the label regardless of active state.
- **Centering:** `w-fit mx-auto` on the container — the pill sizes to content and centers in the page.
- **Implementation:** `components/layout/PageTabBar.tsx`

#### Variant B — Text tabs (period / filter selection)

Used for compact period selectors (e.g. YTD / 1A / 3A / 5A / MAX on Rendimenti) where labels ARE the identifier and no icons exist.

- All options always show their label (already ≤3–4 chars — no overflow risk).
- Uses underline `motion.div` indicator instead of background pill — appropriate for horizontal period strips.
- Do not force icons onto period selectors. "1 year" has no meaningful icon.

**Shared rules:**
- Full ARIA: `role="tablist"` on container, `role="tab"` + `aria-selected` per button.
- Only use for view-switching within a page section. Global navigation uses the bottom pill or sidebar.
- Desktop (`≥ 1440px`): `PageTabBar` renders the animated underline tab bar instead. The segmented pill is mobile-only (`desktop:hidden`).

### Bento Asymmetric Hero Layout

The canonical top-of-page layout when a hero card needs a companion context card (e.g. Overview: Net Worth + Liquidity, Performance: TWR + period selector).

**Structure:** `grid gap-4 desktop:grid-cols-[2fr_1fr]`

- The `[2fr_1fr]` ratio gives the hero approximately 66% width and the companion 33%. This is not a 50/50 split — the asymmetry is intentional and communicates hierarchy through space allocation.
- On mobile, the grid stacks: hero first, companion second.
- The companion card uses `h-full` to match the hero's variable height (sparkline, chips, etc.).
- Below the hero row, a secondary bento row uses equal `grid-cols-3` (or `grid-cols-2`) for metric cards of equal weight.

**Section separator:** Use `border-t border-border/40 pt-4` between major page sections. The 40% border opacity is lighter than the standard `border-border` — it suggests chapter separation without visual interruption.

### Hero Sparkline (Edge-to-Edge Area Chart)

A minimal area chart rendered inside the hero card, breaking out of card padding to fill the full card width. No axes, no grid, no tooltip, no legend — the variation chips above carry numeric context; the sparkline adds only visual shape.

**Implementation:**
```tsx
{/* Container with negative margin matching the card padding */}
<div className="-mx-[22px] mt-3" style={{ height: 68 }}>
  <NetWorthSparkline data={sparkline12m} filled={true} color="var(--chart-1)" height={68} />
</div>
{/* Start/end labels rendered by parent, outside the -mx container */}
<div className="flex justify-between mt-1 px-px text-[10px] text-muted-foreground font-mono">
  <span>{cachedFormatCurrencyEUR(sparkline12m[0].totalNetWorth, true)}</span>
  <span>{cachedFormatCurrencyEUR(sparkline12m[sparkline12m.length - 1].totalNetWorth, true)}</span>
</div>
```

**Rules:**
- The `-mx-[N]` value must match the card's padding exactly (e.g. `-mx-[22px]` for `p-[22px]`). The SVG uses `preserveAspectRatio="none"` and `width="100%"` to fill the container.
- When `filled=true`, the `NetWorthSparkline` component expects the parent to render the start/end labels externally — it does not render them internally to avoid misalignment with the bleed.
- Use `color="var(--chart-1)"` so the sparkline respects theme. Never hard-code a hex.
- Gradient fill: opacity `0.22` at top, `0` at bottom. This is intentionally subtle — the area shape conveys trend, not emphasis.

### Animated SVG Donut (Inline Data Viz)

A two-color SVG donut rendered directly inside a card (no Recharts), with a `motion.circle` for the animated segment. Used when a pie metaphor must integrate tightly with text values in a flex layout.

**Anatomy:**
- Full background ring: static `<circle>` in color A (e.g. illiquid / base category).
- Animated segment: `<motion.circle>` in color B (e.g. liquid / primary category), animating `strokeDasharray` from `0 circ` to `liquidDash circ-liquidDash`.
- Center label: `absolute inset-0 flex flex-col items-center justify-center` with the percentage in `font-mono font-bold` at `fontSize={17}` (matching the center of the 116px ring).
- SVG rotated `-90deg` so the segment starts at the top (12 o'clock position).

**Geometry:**
- `size = 116`, `strokeW = 12`, `r = (size - strokeW) / 2`
- `circ = 2 * Math.PI * r` — do not hard-code; always derive from `r`.

**Animation:** `duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15` — expo-out feel with a brief delay after the hero number starts.

**Colors:** Always from `useChartColors()`. The first time `chartColors` is read, it may be `[]` (post-hydration); default to CSS vars (`var(--chart-1)`, `var(--chart-2)`) as fallbacks.

**Rules:**
- Use this pattern when the donut is integral to the card layout and must flex-align with text. Use Recharts `PieChart` only for standalone chart sections.
- `strokeLinecap="butt"` — not `"round"`, which would add visual overlap at 0% and 100% endpoints.
- Center text font size should scale with `size`: `fontSize = Math.round(size * 0.147)` (approx).

### Savings / Metric Ring Chart

An SVG ring chart for a single percentage metric (e.g. savings rate). Structurally similar to the animated donut but single-color on a muted track ring.

**Color thresholds (savings rate):**
- `≥ 20%`: green — `oklch(0.696 0.17 142.5)`
- `10–19%`: amber — `var(--chart-3)`
- `< 10%` or negative: red/coral — `oklch(0.645 0.246 16.439)`

**Single-mount animation pattern:** The ring animates once when the component mounts — never on parent re-renders. Achieved via `useAnimation` + `useEffect` with an empty dependency array (`[]`):

```tsx
const controls = useAnimation();
useEffect(() => {
  const timer = setTimeout(() => {
    controls.start({
      strokeDasharray: `${dash} ${circ - dash}`,
      transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
    });
  }, 400);
  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // intentionally empty — animate once on mount only
```

**Rules:**
- The `[]` dependency on the animation effect is intentional — the ring is a "snapshot display" of the current rate, not a live-updating gauge. If the ring must react to data changes, use explicit `key` prop rotation on the parent to force re-mount.
- For a deficit (rate < 0): render the track ring only, show the negative label in red, suppress the filled segment entirely.

### Collapsible with Framer Motion Height

The pattern for smooth expand/collapse of a section that has variable or unknown height. Combines Radix `Collapsible` (for ARIA state and keyboard accessibility) with Framer Motion (for the height animation that Radix alone cannot provide smoothly).

**Structure:**
```tsx
<Collapsible open={open} onOpenChange={setOpen}>
  <CollapsibleTrigger asChild>
    <div className="flex items-center justify-between cursor-pointer select-none px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Section Title
      </p>
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
    </div>
  </CollapsibleTrigger>
  <AnimatePresence initial={false}>
    {open && (
      <motion.div
        key="content-key"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{ overflow: 'hidden' }}
      >
        {/* content */}
      </motion.div>
    )}
  </AnimatePresence>
</Collapsible>
```

**Rules:**
- `AnimatePresence initial={false}` — prevents the exit animation from playing on the first render (the section starts closed; no exit needed before it was ever opened).
- `overflow: 'hidden'` on the `motion.div` (inline style, not className) — prevents content from visually overflowing during the height-0 phase.
- `height: 'auto'` as the animate target works correctly with Framer Motion; no `maxHeight` hack needed.
- The `ChevronDown rotate-180` transform should use `transition-transform duration-200` (CSS) not a Framer Motion variant — it's a decorative indicator, not a structural animation.
- Collapsibles default to **closed** for secondary/optional content. Auto-open only when there is unsaved state or a first-use condition that justifies it.

### Muted Sub-tile

A tinted grid item for compact KPI grids. Two variants exist for different contexts.

#### Variant A — KPI Chip (prominent, borderless)

Used in persistent full-width sections where the metrics are the primary content (e.g. the cashflow KPI row). Background is semi-transparent so it reads as a zone without visual heaviness.

```tsx
<div className="bg-muted/40 rounded-xl p-3.5">
  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
    Label
  </p>
  <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
    Value
  </p>
  <p className="text-[12px] font-mono mt-1.5 text-muted-foreground">
    Secondary / delta line
  </p>
</div>
```

Grid: `grid grid-cols-2 desktop:grid-cols-4 gap-3`. Value scale: Sub-hero (`text-[22px]`). Delta annotation uses the **Delta Annotation** typographic level (sign-aware color).

#### Variant B — Parameter Tile (dense, bordered)

Used inside collapsible sections where slight extra separation aids readability of many parameters side by side.

```tsx
<div className="bg-muted rounded-xl p-3.5 border border-border">
  <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
    Label
  </p>
  <p className="text-[16px] font-bold font-mono tabular-nums">Value</p>
</div>
```

**Shared rules:**
- Background is `bg-muted/40` (Variant A) or `bg-muted` (Variant B) — never `bg-card` (card-within-card violation).
- Radius is `rounded-xl` (14px), one step below the container's `rounded-2xl`.
- Variant A (KPI chip): use for persistent, always-visible metrics. No border — the background tint alone provides definition.
- Variant B (parameter tile): use inside collapsible parameter panels only. The border adds precision in high-density config grids.

### Thin Category Bar

A minimal inline progress bar for category breakdowns inside a KPI card. Shows proportional weight at a glance without mounting a full chart component.

**Structure:**
```tsx
<div className="space-y-3">
  {categories.map(cat => (
    <div key={cat.name} className="space-y-1">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0">
          {/* Dot indicator — circle, always rounded-full */}
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-[13px] text-foreground truncate">{cat.name}</span>
        </div>
        <span className="text-[13px] font-mono tabular-nums text-foreground ml-3 flex-shrink-0">
          {formattedValue}
        </span>
      </div>
      {/* Bar track */}
      <div className="h-[3px] bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, background: color }} />
      </div>
    </div>
  ))}
</div>
```

**Rules:**
- Bar height is exactly `3px` — an accent shape, not the primary data carrier. Category name and value carry the data; the bar adds scannable shape.
- Color from `useChartColors()` via the parent — never hardcoded hex. Expense categories use `chartColors[0]`; income categories use `chartColors[1]`.
- Row dot indicator uses `rounded-full` (circle). Contrast this with the chart legend swatch below, which uses `rounded-[2px]` (square) — circles mean "inline indicator," squares mean "color key."
- Use `truncate` on the category name with `min-w-0` on the flex parent to prevent overflow on long names.
- Only render the entire block when data is available (`categories.length > 0`) — no placeholder bars with dummy widths.
- Two-column layout inside a card: expenses left, income right via `grid desktop:grid-cols-2 gap-x-8 gap-y-4`. On mobile they stack.

### Card Sticky Footer

A technique for pinning secondary metric content to the bottom of a variable-height Card. Used when optional data (TER, costs) should align to the card baseline regardless of how much primary content is above it.

**Implementation:**
```tsx
<Card className="rounded-2xl overflow-hidden h-full">
  <CardContent className="p-[22px] flex flex-col h-full">
    {/* Primary content — fills available space naturally */}
    <p className="eyebrow">...</p>
    <div className="value">...</div>
    {/* Sticky footer — pushed to the bottom via mt-auto */}
    {hasOptionalData && (
      <div className="mt-auto pt-4 border-t border-border">
        {/* secondary metrics */}
      </div>
    )}
  </CardContent>
</Card>
```

**Rules:**
- Requires `flex flex-col h-full` on `CardContent` and `h-full` on `Card`. Without both, `mt-auto` collapses.
- The containing grid row must also define a height (`h-full` propagates from the row in `desktop:grid-cols-[2fr_1fr]`). On mobile where the grid stacks, each card determines its own height naturally.
- Use only for **optional/conditional** secondary content. Footer content that always renders should be placed at a fixed spacing from the primary block, not anchored via `mt-auto`.
- `border-t border-border` provides visual separation; `pt-4` provides breathing room. `mt-auto` creates the push — no explicit `flex-1` spacer element needed.
- On desktop, pair with the companion card's `h-full` so the sticky footer visually aligns with the companion card's bottom edge.

### Chart Legend Swatch

The color swatch used in pie chart legend rows. At 8×8px, shape matters: a fully round circle reads as a "dot indicator" (inline traffic-light semantics); a slightly rounded square reads as a "color key."

**Structure (LegendRow):**
```tsx
<div className="flex items-center gap-2">
  {/* Square swatch — rounded-[2px], NOT rounded-full */}
  <div
    className="w-2 h-2 rounded-[2px] flex-shrink-0"
    style={{ background: item.color || chartColors[index] }}
  />
  <span className="flex-1 text-[11.5px] text-foreground font-medium truncate">{item.name}</span>
  <span className="text-[11.5px] text-muted-foreground font-mono tabular-nums">
    {item.percentage.toFixed(1)}%
  </span>
</div>
```

**Rules:**
- `rounded-[2px]` for legend swatches (color keys). `rounded-full` for inline dot indicators (category bars, status bullets).
- Filter legend rows to `percentage >= 5` — slices below 5% don't warrant a label at the available width.
- Value shown is `percentage` (not raw currency) — the chart slice already communicates proportion; the legend reinforces it numerically.
- Container: `flex flex-col gap-[7px]` with `min-w-0` to handle truncation of long asset names.

### Deferred Chart Mount (Performance Pattern)

When heavy SVG charts (Recharts, custom SVG) would compete with a count-up animation on the same page, defer their mount until the animation completes.

**Implementation:**
1. The hero count-up component (`OverviewAnimatedCurrency`) accepts an `onSettled` callback that fires exactly once when `animated === value` (after the rAF loop ends).
2. The page sets a `heroSettled` boolean when `onSettled` fires.
3. The chart section watches `heroSettled` and schedules its own `chartRenderReady` state via `requestIdleCallback` (with `setTimeout(0)` fallback):

```tsx
useEffect(() => {
  if (!heroSettled || chartRenderReady) return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => setChartRenderReady(true), { timeout: 800 });
  } else {
    setTimeout(() => setChartRenderReady(true), 0);
  }
}, [heroSettled, chartRenderReady]);
```

4. Until `chartRenderReady`, the chart section renders a loading placeholder (`<Loader2 animate-spin>`).
5. On mobile or with `prefers-reduced-motion`, skip the delay entirely (`chartRenderReady` starts `true`).

**Count-up isolation:** The count-up `useCountUp` hook lives in a leaf `OverviewAnimatedCurrency` component — **not** in the page component. Each rAF tick only re-renders the tiny leaf span, not the entire page tree. This is non-negotiable: a count-up inside a page component will re-render every card on every frame.

**Revealed-charts tracking:** Use a `Set<string>` (`revealedCharts`) to track which chart IDs have already completed their entrance animation. Pass `animateOnMount={!revealedCharts.has(id)}` to prevent Recharts from replaying entrance animations when tabs switch or data refreshes.

## 6. Do's and Don'ts

### Do:

- **Do** derive every visual choice from function — form follows function. Before adding any property (a color, a shadow, a radius, a motion, an extra pixel of size), name the job it does. If the only answer is "it looks nice," remove it. Form is the consequence of function, never its costume.
- **Do** use Geist Mono with `font-feature-settings: "tnum" 1` for every monetary value, percentage, and structured date. Column alignment is a trust signal.
- **Do** reference `--sidebar-primary` for active navigation states. In the default theme this is the only sanctioned non-achromatic color in the interface chrome.
- **Do** use the Float shadow exclusively for elements that leave document flow (modals, the mobile nav pill, dropdown menus). Never apply it to in-flow cards.
- **Do** respect `prefers-reduced-motion`. Framer Motion's `useReducedMotion()` is integrated across all animated components and must be preserved on new additions.
- **Do** use `desktop:` (1440px) as the primary responsive breakpoint for layout switches. Never use `lg:` (1024px) for wide-screen layouts — iPad Mini in landscape is 1024px and receives the mobile treatment by design.
- **Do** use `oklch()` for all custom color definitions. This project is OKLCH-native; hex values in CSS are approximations of the canonical color.
- **Do** let the five named themes handle personality. Resist adding theme-like color to the default palette.
- **Do** use the view-transition circle reveal (`0.45s cubic-bezier(0.4, 0, 0.2, 1)`) for dark/light mode toggling. The origin coordinates are set inline from the click position.
- **Do** use `requestIdleCallback` (with `setTimeout(0)` fallback) to schedule heavy SVG mount after a count-up animation settles. The `heroSettled + chartRenderReady` pattern prevents frame budget competition between animations and chart render.
- **Do** isolate count-up animations in leaf components (`OverviewAnimatedCurrency`), not in the page component. Each rAF tick re-renders only the leaf, keeping the rest of the tree stable.
- **Do** use `useAnimation + useEffect([])` (empty deps) for "animate once on mount" ring charts. This prevents the ring from restarting whenever a parent component re-renders due to unrelated state changes.
- **Do** use `-mx-[N]px` negative margin (matching the card padding) to create edge-to-edge charts inside a card — `preserveAspectRatio="none"` on the SVG fills the broken-out container correctly.
- **Do** use `desktop:grid-cols-[2fr_1fr]` for the primary hero+companion layout at the top of a page. The asymmetric ratio communicates hierarchy through space, not just typography.
- **Do** use `border-t border-border/40 pt-4` for section separators within a page scroll flow. The 40% opacity is lighter than structural borders — it suggests chapter, not division.
- **Do** use `bg-muted/40 rounded-xl p-3.5` (no border) for KPI chip grids inside persistent, always-visible sections. Reserve the full-opacity `bg-muted` with `border border-border` for parameter tiles in collapsible zones.
- **Do** use `mt-auto` inside `flex flex-col h-full` CardContent to pin optional secondary content to the card bottom. The pattern requires `h-full` on both Card and CardContent; without both, `mt-auto` has no space to push against.
- **Do** use `rounded-[2px]` for chart legend color swatches (color keys). Use `rounded-full` for inline dot indicators (row bullets, status dots). The distinction is semantic: square = color key, circle = inline marker.
- **Do** duplicate responsive blocks with `desktop:hidden` / `hidden desktop:grid` when the same data must be positioned differently across breakpoints (e.g. TER + cost metrics in the hero card footer on desktop, as standalone cards below the hero on mobile). Redundant DOM is preferable to a convoluted single implementation that degrades at both sizes.
- **Do** use inverted sign semantics (parameterized `positiveGood: boolean`) for expense delta annotations. A positive Spese delta means spending increased — the color should be `text-destructive`, opposite to the income logic. Never hardcode positive-as-green (raw `text-green-*`) in components that handle both income and expense metrics; use the `text-positive` / `text-destructive` tokens so the sign colors follow the theme.

### Don't:

- **Don't** shape an element for appearance alone. A larger number, a heavier shadow, a brighter accent, or an extra animation that exists "to look good" violates form-follows-function. If a property carries no function, it is decoration — cut it. And never fake what isn't there: no false depth, no invented material, no shadow hierarchy a surface hasn't earned (the honesty corollary).
- **Don't** add brand color to the default theme's surface chrome (backgrounds, cards, buttons). Zero-chroma is the rule: color belongs to data, not decoration.
- **Don't** model density after a Bloomberg terminal. Dense presentation serves the user; illegibility or emotional coldness does not.
- **Don't** use consumer fintech color patterns — colorful fills, playful gradients, bright accents on every interactive element. This tool handles serious long-term wealth management.
- **Don't** apply Material Design component conventions. Generic patterns that serve any app serve this one poorly.
- **Don't** use gradient text (`background-clip: text` with a gradient fill). Use weight or size for emphasis.
- **Don't** use side-stripe borders (colored `border-left` greater than 1px as a card accent). Rewrite with full borders, background tints, or leading icons instead.
- **Don't** use glassmorphism (`backdrop-filter: blur`) decoratively. A blurred surface must be structurally justified.
- **Don't** use proportional figures for financial numbers in tabular contexts. `font-variant-numeric: tabular-nums` or `font-feature-settings: "tnum" 1` is required wherever numbers appear in column-aligned positions.
- **Don't** add shadows larger than Lift to in-document cards. Float shadow creates false depth hierarchy when applied to surfaces that haven't left document flow.
- **Don't** nest cards inside cards (box-within-box). If a list of items lives inside a Card container, the rows are flat — no individual card per item.
- **Don't** use progress bars to communicate allocation or weight unless the visual fill carries information the number alone cannot convey. A dominant `font-mono` value + label is almost always clearer.
- **Don't** give equal visual weight to multiple values when one is the primary takeaway. Apply the Dominant Value Block: one number commands, the rest are context.
- **Don't** use `lg:` (1024px) as a layout breakpoint for wide-screen changes. iPad Mini in landscape is 1024px and receives the mobile treatment by design. Use `desktop:` (1440px) for all layout switches.
- **Don't** design the desktop version first and then adapt it for mobile. Mobile layout is the base; desktop adds columns, tables, and sidebar — it does not simplify a desktop original.
- **Don't** use `bg-card` for sub-items nested inside a Card. Sub-tiles inside a card must use `bg-muted` — the card background repeated creates a card-within-card violation even when the inner element has no explicit `<Card>` wrapper.
- **Don't** use a Recharts `<ResponsiveContainer>` in compact pie chart mode when the width is known. Pass `width` and `height` directly to `<PieChart>` to avoid the "width: -1" warning and prevent layout reflows during animation.
- **Don't** place count-up animation logic (`useCountUp`, `rAF` loops) in a page-level component. Every frame tick re-renders the entire tree. Animation state belongs in a dedicated leaf component.
- **Don't** render a ring or donut chart with `strokeLinecap="round"` when the segment can be near 0% or near 100% — the round caps visually overlap the track ring and distort the reading. Use `strokeLinecap="butt"` for data-accurate arcs.
- **Don't** use `rounded-full` for pie chart legend swatches. At 8×8px, a circle reads as a traffic-light dot (status indicator), not as a color key. `rounded-[2px]` reads as a color sample. The distinction is visually meaningful.
- **Don't** use an animated SVG donut or ring chart when flat `divide-y` rows carry the same information more clearly. Chrome reduction is the primary principle — the animated donut in the Liquid card was replaced by a flat 3-row breakdown precisely because the breakdown communicates more (three separate values, individual percentages) with less visual noise.
- **Don't** use placeholder bars (e.g. dummy `width: 0` category bars) when no data is available. Omit the block entirely — absence communicates "no data" more cleanly than empty chrome.
