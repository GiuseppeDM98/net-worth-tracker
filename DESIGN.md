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

**Creative North Star: "The Precision Instrument"**

This system is built for one purpose: total clarity about your financial position. Every element earns its place by communicating a number, a trend, or a relationship. The aesthetic draws from two co-primary references: Linear/Vercel clarity and Trade Republic hierarchy. Neither is secondary.

**Linear / Vercel** provides the structural foundation: tight geometry, achromatic palette, strong typography, physics-native motion, zero decorative chrome.

**Trade Republic** provides the data hierarchy: the primary number dominates physically and visually. Layout flows vertically — dominant value → inline variation chip → small label metadata. Flat `divide-y` lists instead of card-within-card nesting. No decorative progress bars. No box-within-box. Visual chrome is reduced to its structural minimum: only what separates, never what decorates.

The two references are compatible. Both share dark mode as a premium experience, typography as structure, and zero tolerance for decoration that doesn't carry information.

Dark mode is the primary experience. An Italian investor reviewing portfolio performance at their desk, evening light off, monitor close, expects precision: sharp contrasts, monospaced figures, no visual noise competing with numbers that represent years of work. Light mode is fully supported and equally refined, but the design intent was formed in darkness.

The five named color themes (Solar Dusk, Elegant Luxury, Midnight Bloom, Cyberpunk, Retro Arcade) are personality layers on top of a structural foundation. They change accent and surface palette without touching the underlying type scale, radius, or component API. The default theme is the instrument in its raw state. The themes are its finishes.

This system explicitly rejects three aesthetic modes: Bloomberg terminal coldness (too dense and impersonal for a personal wealth journal), consumer fintech brightness (Revolut-style gradients and playful fills trivialize serious data), and Material Design genericism (component conventions that serve any app therefore serve this one poorly).

**Key Characteristics:**
- Achromatic structural palette; data colors carry all chromatic meaning in the default theme
- Geist Sans for interface text, Geist Mono for every number that matters
- Radius is tight: 8px (inputs, buttons), 14px (cards) — never pill-shaped for containers
- Elevation is ambient: surfaces layer through background steps, shadows are atmospheric whispers
- Motion is physics-native: spring dialogs, ease-out-quart state transitions, circle-reveal theme toggle
- Hierarchy is Trade Republic-style: one dominant value per section, everything else is context
- Chrome reduction is deliberate: flat lists over nested cards, divide-y over borders-on-boxes
- Mobile-first: layouts are designed at 390px first; desktop adds columns, never simplifies

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

## 3. Typography

**UI Font:** Geist Sans (with `system-ui, sans-serif` fallback)
**Numeric Font:** Geist Mono (with `ui-monospace, monospace` fallback)

**Character:** Geist Sans is a neo-grotesque that reads precisely without clinical coldness. Its slightly geometric construction aligns with the Linear/Vercel reference. Geist Mono is not an afterthought: it is half the design system. Every monetary value, percentage, ratio, and structured date uses monospace figures — tabular numeral alignment is non-negotiable when columns of numbers must read as columns.

### Hierarchy

- **Display** (600 weight, `clamp(1.75rem, 3.5vw, 3rem)`, lh 1.1, ls -0.02em): Page heroes, net worth totals on Overview. Tight tracking at large sizes; tight leading. One instance per view maximum. In Tailwind: `text-4xl font-bold tracking-tight desktop:text-5xl`.
- **Headline** (600 weight, 1.25rem, lh 1.25, ls -0.01em): Section headers, dialog titles, card-level titles where data density demands authority.
- **Title** (600 weight, 1rem, lh 1.4, ls -0.005em): Sub-section headers, table group labels, the step below Headline.
- **Body** (400 weight, 0.875rem, lh 1.6): All prose, descriptions, note content. Max line length 65ch.
- **Label** (500 weight, 0.75rem, lh 1.4, ls +0.01em): Input labels, tags, stat captions, tab text. Slightly tracked for legibility at small sizes.
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

- **Corner Style:** Extended curvature (14px radius). Visually distinct from buttons and inputs, signaling a container rather than an interactive target.
- **Background:** `--card` (dark: Charcoal Surface `oklch(0.205 0 0)`; light: Near-White `oklch(1 0 0)`).
- **Shadow Strategy:** Lift shadow (`0 1px 3px rgba(0,0,0,0.1)`). Always present; always quiet.
- **Border:** 1px, `--border` (Border Ghost dark; Border Stone light). The border carries most of the compositional separation work.
- **Internal Padding:** 24px uniform (`py-6 px-6`). Card headers grid-lay title + optional action in the same horizontal row.

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

**Structure:** `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium`

**Colors:**
- Positive: `bg-green-500/10 text-green-600 dark:text-green-400`
- Negative: `bg-red-500/10 text-red-600 dark:text-red-400`

**Content:** `{icon} {+/-}{formattedValue} ({+/-}{pct}%) {period label}` — e.g. `↗ +€1.240,00 (+2.34%) questo mese`

**Rules:** Only render when snapshot data exists (at least one prior period). Never show a placeholder chip — absence communicates "no prior data" cleanly. Icon is `TrendingUp` or `TrendingDown` at `h-3 w-3`. Multiple chips wrap naturally via `flex-wrap gap-2`.

### Dominant Value Block (Trade Republic Pattern)

The canonical layout for any section where one number is the primary takeaway — asset value, allocation total, account balance.

**Structure:**
```
[label — text-sm text-muted-foreground]
[primary value — text-2xl font-bold font-mono]
[variation chip + secondary metric — text-sm]
[tertiary metadata — text-xs text-muted-foreground]
```

**Rules:**
- Primary value is always `text-2xl font-bold font-mono` minimum. For page heroes, `text-3xl` or `text-4xl`.
- The label above is small (`text-sm`) and muted — it names the number, it does not compete with it.
- Variation (gain/loss, percentage) appears inline directly below the value as a chip or compact colored span, never as a separate card or column.
- Tertiary metadata (date, ticker, ISIN) uses `text-xs text-muted-foreground` — it is present for reference, invisible at a glance.
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

A tab switcher for 2–4 mutually exclusive views within a section. Replaces `<Select>` dropdowns where options are few, short, and always visible. The active pill animates via Framer Motion `layoutId` spring.

**Structure:** `role="tablist"` container with `bg-muted rounded-lg p-1`, each option is a `role="tab"` button. Active pill is a `motion.div` with `layoutId` that slides between options.

**Spring:** `stiffness: 400, damping: 35` — snappy without overshooting.

**Rules:**
- 2–4 options maximum. Beyond 4, use a Select or vertical nav.
- Labels are abbreviated for mobile (≤10 chars preferred). Full labels on `desktop:`.
- Full ARIA: `role="tablist"` on container, `role="tab"` + `aria-selected` per button.
- Only use for view-switching within a page section. Global navigation uses the bottom pill or sidebar.
- Desktop may use shadcn `TabsList` when the design calls for a more open tab style. The segmented pill is the mobile-first default.

## 6. Do's and Don'ts

### Do:

- **Do** use Geist Mono with `font-feature-settings: "tnum" 1` for every monetary value, percentage, and structured date. Column alignment is a trust signal.
- **Do** reference `--sidebar-primary` for active navigation states. In the default theme this is the only sanctioned non-achromatic color in the interface chrome.
- **Do** use the Float shadow exclusively for elements that leave document flow (modals, the mobile nav pill, dropdown menus). Never apply it to in-flow cards.
- **Do** respect `prefers-reduced-motion`. Framer Motion's `useReducedMotion()` is integrated across all animated components and must be preserved on new additions.
- **Do** use `desktop:` (1440px) as the primary responsive breakpoint for layout switches. Never use `lg:` (1024px) for wide-screen layouts — iPad Mini in landscape is 1024px and receives the mobile treatment by design.
- **Do** use `oklch()` for all custom color definitions. This project is OKLCH-native; hex values in CSS are approximations of the canonical color.
- **Do** let the five named themes handle personality. Resist adding theme-like color to the default palette.
- **Do** use the view-transition circle reveal (`0.45s cubic-bezier(0.4, 0, 0.2, 1)`) for dark/light mode toggling. The origin coordinates are set inline from the click position.

### Don't:

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
