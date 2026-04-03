## ✨ New Features

- The Performance page (Rendimenti) now loads with a cleaner, less overwhelming layout: the methodology section is collapsed by default and can be expanded on demand with a single click
- A one-time guide strip appears on first visit to the Performance page, explaining the three reading levels (metric cards, tooltips, and methodology) — dismissible and never shown again
- Advanced metrics (Time-Weighted Return, IRR, Sharpe Ratio, YOC Gross, YOC Net) are now labelled "Avanzato" so less experienced users know they can safely ignore them on a first read without losing the essentials
- Each chart on the Performance page now shows a 2-line description directly below its title, explaining what you see and what to look for — no need to scroll to the methodology section

## 🔧 Improvements

- Improved the Overview dashboard with a smoother primary KPI entrance, softer reflow of conditional cards, and subtler chart reveals that feel more polished without getting in the way
- Improved the snapshot overwrite flow on the Overview page so the confirmation dialog feels more connected to the "Crea Snapshot" action
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

## 🐛 Bug Fixes

- Fixed a flash of fully-visible page content appearing for a split second before the entrance animation begins when navigating between pages — now all pages animate in cleanly every time
- Fixed the sidebar always highlighting "Panoramica" regardless of the current page
- Fixed a browser console warning on every page load: the Geist Mono font was being preloaded on all pages despite only being used on the FIRE and Hall of Fame pages

## 🔒 Security

- Improved authorization checks for private account actions across snapshots, dividends, performance metrics, price updates, Hall of Fame recalculation, and AI analysis
- Added stricter ownership validation for sensitive portfolio actions so requests must match the signed-in Firebase user before data is read or changed
- Preserved scheduled maintenance flows while hardening private API access, so automated snapshot and dividend jobs continue to run normally
