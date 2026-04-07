## ✨ New Features

### Assistente AI

The AI Assistant is a new section of the app (accessible from the "Analisi" group in the navigation) that lets you have ongoing conversations about your portfolio — either through structured monthly analysis or open-ended chat.

**Monthly analysis**
- Select any past month and the assistant automatically loads net worth changes, cashflow breakdown, top expense categories, and allocation shifts — presenting them in a readable numeric context panel before writing its commentary
- The numeric context panel (net worth delta, cashflow, allocation changes) now reappears automatically when you reopen a past monthly analysis thread — no need to rerun the analysis every time
- The context panel shows a loading skeleton while the data is being fetched, so the layout stays stable as the panel populates
- The assistant now sees your complete portfolio breakdown by asset class, not just the five that changed the most in the month
- The assistant now sees your portfolio breakdown within each asset class (e.g. "Azioni USA €42.000, Azioni Europa €18.000") when subcategory data is available — not just the class total

**Annual, YTD, and total history analysis**
- Added annual analysis mode: ask the assistant about any full year — it receives the complete cashflow summary, net worth delta (vs prior December), allocation shifts, and top expenses for the entire year. When analysing the current year, the assistant knows the period is still in progress
- Added YTD analysis: covers January 1 to the latest available month of the current year — a single tap gives you a year-to-date picture of net worth, cashflow, and portfolio changes
- Added total history analysis: covers all years from your configured cashflow start year to today — ask long-term questions about your financial trajectory and the assistant has the full picture
- When you switch to a mode that already has a conversation (e.g. Annual 2025), the existing thread is automatically reopened instead of creating a duplicate

**Chat mode**
- Chat mode now has a context type selector: choose between No context, Month, Year, YTD, or Total history — the assistant receives the same numeric data as the structured analysis modes without the fixed report format
- Web search is available in all modes: the assistant cites specific recent events (geopolitical, central bank decisions, market moves) and links them directly to your portfolio

**Memory**
- The assistant now remembers goals, preferences, risk profile, and stable facts you declare across conversations — visible in a dedicated "Memoria" panel in the right column
- Memory items are grouped by type (Obiettivi, Preferenze, Rischio, Fatti utili) and show the date they were learned
- You can edit any memory item inline, archive it to keep it out of active use, restore it, or delete it permanently
- Added a full reset option for memory with an explicit confirmation dialog — preferences (style, macro context, learning toggle) are preserved on reset
- Added an "Apprendimento automatico" toggle: when off, the assistant stops learning new facts but existing memory remains visible and active

**Conversations**
- Every conversation is saved and can be reopened at any time from the "Conversazioni" list — your analysis history is never lost between sessions
- Past conversations are shown at the top of the right panel on desktop, and as a compact list above the suggested prompts on mobile — resume a past thread without opening the drawer
- Added a "Conversazioni" button in the assistant header on mobile and tablet that opens a side drawer with your full conversation history
- Each conversation shows a relative timestamp ("3 ore fa") for recent threads and an absolute date for older ones
- You can delete individual conversations directly from the list — hover the thread and click the trash icon
- Added a "Nuova conversazione" button to start a fresh thread for a different month at any time
- The selected month is visible directly in the thread list, next to the thread type badge

**UX & presentation**
- Five suggested prompt chips on the home screen — "Analizza questo mese", "Cosa pesa di più sul patrimonio?", "Spese e risparmio", "Rendimenti recenti", "Contesto geopolitico" — one tap to start any common analysis
- The assistant renders tables in responses — financial breakdowns with categories and amounts are properly formatted instead of showing raw pipe characters
- The right panel (conversations, context, preferences, memory) stays fixed while you scroll through a long conversation
- A "taking longer than expected" notice appears after 15 seconds with no response — so you always know the request is still in progress
- The page shows a skeleton loading state while your conversation history loads, instead of a blank flash
- The assistant is behind a feature flag (`NEXT_PUBLIC_ASSISTANT_AI_ENABLED`) for controlled rollout — when disabled, the navigation item is hidden and direct URL access returns a 404
- Added a graceful unavailable state when AI is not configured, so the page remains accessible and explains what is missing

---

- Added current-period spotlight cards to Hall of Fame, so you can instantly see how the current month and year rank against your personal records
- Added live values inside Hall of Fame spotlight cards, including percentage context for net worth change rankings when available
- The Performance page (Rendimenti) now loads with a cleaner, less overwhelming layout: the methodology section is collapsed by default and can be expanded on demand with a single click
- A one-time guide strip appears on first visit to the Performance page, explaining the three reading levels (metric cards, tooltips, and methodology) — dismissible and never shown again
- Advanced metrics (Time-Weighted Return, IRR, Sharpe Ratio, YOC Gross, YOC Net) are now labelled "Avanzato" so less experienced users know they can safely ignore them on a first read without losing the essentials
- Each chart on the Performance page now shows a 2-line description directly below its title, explaining what you see and what to look for — no need to scroll to the methodology section
- Added a contextual dividend detail view in `Dividendi & Cedole`, so selecting a row or mobile card opens a readable payment summary before entering edit mode
- Added compact dividend insight cards for portfolio YOC and DPS growth, with inline help explaining how to read the metrics
- Added a local preview mode to the FIRE calculator, so retirement metrics react immediately to unsaved changes before you decide to save them
- Added linked focus behavior to Goal-Based Investing, so selecting a goal now highlights the same objective across summary cards, allocation view, and detail sections

## 🐛 Bug Fixes

### Assistente AI

- Fixed opening a past annual, YTD, or history analysis thread after navigating away — messages were missing until a hard refresh; the thread now loads correctly on every visit
- Fixed the assistant not actually using saved memory when answering questions — goals, preferences, and facts were stored but never sent to Claude, so the assistant answered as if it knew nothing about you
- Fixed the "Rigenera" (retry) button doing nothing after a failed or interrupted response — it now correctly resends the last message without requiring you to retype it
- Fixed the month picker not being sent to the server in chat mode — the assistant was receiving no data even after a month was selected
- Fixed losing previous messages when sending a second question in the same conversation — only the most recent exchange was visible instead of the full history
- Fixed the assistant page scrolling to the bottom immediately when selecting a thread, before the messages had loaded
- Fixed the assistant not citing specific recent geopolitical events even when web search was active
- Fixed macro/geopolitical responses being cut off mid-sentence when web search was used
- Fixed the "Nuova conversazione" button not working — the assistant was immediately re-selecting the previous thread instead of showing the empty hero state
- Fixed the assistant conversation area still showing the previous thread's messages after switching to a new thread
- Fixed clicking the send button throwing a runtime error when using suggested prompt chips
- Fixed the streaming response disappearing mid-conversation — messages now display correctly as they arrive
- Fixed the month picker not syncing to the thread's month when switching between past conversations
- Fixed thread previews showing raw markdown syntax (`**bold**`, `## Heading`) — previews are now plain readable text

---

- Fixed the Performance page (Rendimenti) metric cards not counting up when the page first loads — numbers now animate from zero as expected instead of jumping directly to their final values
- Fixed a visual flash in the Budget tab when opening the historical analysis for a row, subtotal, or total on desktop
- Fixed the Cashflow Sankey animation so month and period filter changes animate correctly again instead of appearing static
- Fixed the Overview summary invalidation flow so asset and cashflow changes no longer trigger a Firestore permissions warning in the browser console
- Fixed blank vertical gaps appearing on the Assets page when switching between force-mounted tabs
- Fixed a flash of fully-visible page content appearing for a split second before the entrance animation begins when navigating between pages — now all pages animate in cleanly every time
- Fixed the sidebar always highlighting "Panoramica" regardless of the current page
- Fixed a browser console warning on every page load: the Geist Mono font was being preloaded on all pages despite only being used on the FIRE and Hall of Fame pages

## 🔧 Improvements

- The FIRE "Indennità Annuale" card now shows the Patrimonio FIRE base value directly, so you can immediately see which number the withdrawal rate is applied to without switching tabs
- Fixed the income category pie chart legend on mobile (Cashflow → Anno Corrente) overflowing its container when four or more categories were above the 5% threshold — now consistently capped at three visible items, matching the expense chart

- Improved the login and registration pages with a calmer first-load entrance, so authentication feels more consistent with the rest of the app
- Improved sign-in and sign-up forms with clearer field focus states, keyboard-accessible password visibility toggles, and inline submit feedback during access or account creation
- Improved Hall of Fame ranking presentation with a cleaner editorial layout across monthly and yearly sections, making dense record lists easier to scan
- Improved Hall of Fame note interactions so opening a note feels more directly connected to the selected record on both desktop and mobile
- Improved current-month and current-year visibility inside Hall of Fame rankings with clearer in-place highlighting
- Improved the Cashflow page so switching between workspaces feels more continuous and less like a full redraw
- Improved Cashflow filters in `Anno Corrente` and `Storico Totale` with clearer active-state feedback and steadier in-place updates
- Improved the Cashflow Sankey panel with a cleaner presentation and more readable drill-down context while preserving its natural filter-change animation
- Improved the Budget tab with smoother expand/collapse behavior, a more polished inline subcategory flow, and a more stable historical analysis panel

- Improved the History page with a clearer chapter-based structure, making long-term portfolio analysis easier to scan from top to bottom
- Improved History chart transitions so switches between percentage/absolute views and annual/monthly analysis feel more continuous and less abrupt
- Improved the Savings vs Investment Growth section on the History page with a steadier in-place mode switch and clearer context for the active view
- Improved the doubling milestones section on the History page with a more progressive build that gives important milestones more presence without slowing the page down

- Improved the Performance page with smoother period switching, so key metrics and charts update with more continuity instead of feeling abruptly redrawn
- Improved Performance metrics so values settle from the previous state more naturally during period changes, making comparisons easier to follow at a glance
- Improved the monthly returns heatmap with a staged reveal that makes the section feel more polished without reducing readability
- Improved the underwater drawdown chart with a calmer, more editorial presentation that highlights the deepest drawdown more clearly
- Improved the custom date range and AI analysis dialogs on the Performance page so they feel visually tied to the buttons that opened them
- Improved the Dividends & Coupons workspace so calendar focus, active date filters, summary context, and the lower table stay visually aligned
- Improved the dividend calendar with a clearer selected-day focus, month context, and a more readable daily summary when filtering by payment date
- Improved dividend growth presentation with more consistent percentage formatting and clearer explanations directly in the cards
- Improved Monte Carlo simulations so rerunning or changing scenario assumptions feels more continuous, with previous results staying visible until the new run is ready
- Improved Monte Carlo percentile and distribution charts with a more progressive build that makes ranges and probabilities easier to read
- Improved the Bear/Base/Bull comparison view in Monte Carlo with clearer scenario emphasis, helping users understand which path they are evaluating at a glance
- Improved FIRE scenario projections so years-to-FIRE cards and charts settle into updated values more smoothly instead of feeling fully redrawn

- Improved the Allocation page with clearer drill-down orientation on desktop, making it easier to understand where you are when moving from asset classes to subcategories and specific assets
- Improved mobile Allocation navigation so each drill-down level opens from the top of its own content instead of keeping the previous scroll position
- Improved Allocation progress bars with cleaner, better-centered target markers that are easier to read at a glance
- Improved the Assets page so `Gestione Asset`, `Anno Corrente`, and `Storico` feel more continuous when switching between sections
- Improved the historical tables in Assets so the selected sub-view stays in place when moving between tabs, instead of feeling like it reloads
- Improved refresh feedback in the Assets historical views with a subtle active-panel update state and last-updated timestamp
- Improved the current-year historical tables in Assets so the first visible month can be compared against the previous month without showing an extra baseline column, keeping January growth and summary percentages accurate
- Improved the Settings page with clear "unsaved changes" feedback, so users can immediately see when edits are still in preview mode before saving
- Improved responsiveness of Settings controls (toggles, selects, and inputs) with more consistent interaction feedback
- Improved the nested Allocation editor in Settings with smoother expand/collapse behavior, making complex target editing easier to follow
- Improved contextual safety for category move/delete actions in Settings by making confirmation dialogs feel visually tied to the action that opened them
- Improved the Overview dashboard so all KPI values — including asset count — now animate with a count-up on page load, making the numbers feel more alive and satisfying to arrive at
- Improved the Overview dashboard so portfolio composition charts on desktop appear only after the key numbers have finished animating, reducing visual competition and making the page feel more focused on load
- Improved the snapshot overwrite flow on the Overview page so the confirmation dialog feels more connected to the "Crea Snapshot" action
- Improved the Overview dashboard so key metrics, monthly changes, expense summaries, and composition charts now load together in one faster, more consistent response
- Improved Overview freshness after portfolio, cashflow, snapshot, price-update, and stamp-duty setting changes, reducing cases where the dashboard could briefly feel out of sync
- Refined the late-night Overview greeting to keep a calmer evening tone while still acknowledging late usage
- Navigation now feels smoother and more app-like: the active section indicator in the sidebar glides between items instead of snapping — giving the interface a native, polished feel
- The bottom navigation on mobile now shows an animated accent line that appears on the active tab, making it easier to see where you are at a glance
- Tapping the theme toggle or the user icon in the header now has a subtle press response, making controls feel more tactile and immediate
- The theme toggle icon now animates when switching between light, dark, and system modes — the old icon rotates out while the new one rotates in, giving clear visual feedback that the change was registered
- Opening the "Altro" drawer on mobile now reveals sections in a smooth cascade rather than appearing all at once
- Page navigation now includes a gentle slide-up effect, reinforcing the sense that you're moving through a connected app rather than loading separate pages
- All animations now automatically respect your device's "Reduce Motion" accessibility setting — if you have it enabled, transitions become instant across the entire app

- The Overview and History pages now have a clearer visual structure: related metrics are grouped together, and subtle section dividers mark the transition between primary data, analysis, and reference sections — making long pages easier to scan without feeling overwhelming
- The "Risparmiato da Lavoro" card in the History page now shows the total expenses for the period as a secondary line below the main value, making it immediately clear what drove the savings figure

- The Hall of Fame section now uses consistent Italian terminology throughout: section headings, button labels, and toast messages now read "Record mensili", "Record annuali", and "Aggiorna i record" instead of the mixed English/Italian "Ranking" wording — the section name and navigation label remain "Hall of Fame" by design
- The "Specific Assets" drill-down in the Allocation page is now labelled "Asset specifici" in Italian, consistent with the rest of the interface
- The methodology reference on the Performance page is now significantly more scannable: chart explanations are 2–3 lines each (down from 10–15), and the YOC and Current Yield sections are concise reference entries rather than multi-page walkthroughs — all key formulas and interpretation guidance are preserved
- The informational callout in the Allocation drill-down is now titled "Asset specifici" instead of the generic "Nota", with clearer, more action-oriented bullet copy

- Mobile bottom navigation now shows an active highlight on the "Altro" button when you're in a secondary section (Rendimenti, Storico, Allocazione, etc.) — you always know where you are in the app
- Renamed the mobile "Menu" button to "Altro" with a clearer icon, so it's immediately obvious there's more to explore
- The mobile navigation drawer now groups sections by topic (Analisi, Pianificazione, Preferenze) instead of a flat unlabelled list — the app's structure is visible at a glance
- On mobile, the three portfolio charts on the Overview page now start collapsed, making the page load faster and the most important numbers appear instantly without scrolling past charts

- The Allocation page no longer shows a separate legend box — the rebalancing signals (Buy / Sell / OK) are now self-explanatory at a glance. The action column header shows the ±2% threshold directly, and mobile cards now display "Da acquistare", "Da ridurre", or "Bilanciato" instead of a generic "Differenza" label

- The login and registration pages now match the look and feel of the rest of the app: cleaner layout, consistent typography, and a more personal tone ("Bentornato." / "Crea il tuo profilo.") — the first impression now feels like part of the same product

- Improved the Settings page layout: the header now includes a section label and a cleaner visual separator, making the page feel less like a back-office form
- Technical notes in the Allocation tab (Settings) are now collapsed by default — expand them only when needed instead of scrolling past them every time
- Development tools in Settings are now clearly separated from the regular configuration options, so they're available when needed but don't clutter the product interface

- Renamed navigation items to Italian across all platforms (sidebar, mobile bottom bar, and drawer menu): Overview → Panoramica, Assets → Patrimonio, Allocation → Allocazione, Performance → Rendimenti, History → Storico, Settings → Impostazioni
- Renamed the Performance page to "Rendimenti del Portafoglio"
- Renamed metric "Recovery Time" to "Tempo di Recupero" in the Performance page
- Renamed metrics "Current Yield Lordo" and "Current Yield Netto" to "Rendimento Corrente Lordo" and "Rendimento Corrente Netto" in the Performance page
- Renamed the FIRE Simulations tab "FIRE Calculator" to "Calcolatore FIRE"
- Updated login and registration page descriptions to use "patrimonio" instead of "portfolio"
- Improved visual hierarchy across Dashboard, Performance (Rendimenti), and History (Storico) pages: the most important KPI or chart on each page is now visually prominent with a larger number and a left-border accent, making it immediately clear where to look first
- Primary metrics on the Performance page (CAGR, Time-Weighted Return) now display at a larger size to distinguish them from supporting metrics
- Performance page section headers are now cleaner — emoji prefixes replaced with a subtle visual accent
- Each main page now has a breadcrumb label above the title and a separator line between the header area and the data below, giving the interface a more editorial, intentional feel
- Utility actions (Refresh, Export CSV, Insert Past Snapshot) are visually de-emphasised so the primary action on each page stands out

## 🔒 Security

- Improved authorization checks for private account actions across snapshots, dividends, performance metrics, price updates, Hall of Fame recalculation, and AI analysis
- Added stricter ownership validation for sensitive portfolio actions so requests must match the signed-in Firebase user before data is read or changed
- Preserved scheduled maintenance flows while hardening private API access, so automated snapshot and dividend jobs continue to run normally
