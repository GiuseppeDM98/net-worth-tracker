## ✨ New Features

- The Performance page (Rendimenti) now loads with a cleaner, less overwhelming layout: the methodology section is collapsed by default and can be expanded on demand with a single click
- A one-time guide strip appears on first visit to the Performance page, explaining the three reading levels (metric cards, tooltips, and methodology) — dismissible and never shown again
- Advanced metrics (Time-Weighted Return, IRR, Sharpe Ratio, YOC Gross, YOC Net) are now labelled "Avanzato" so less experienced users know they can safely ignore them on a first read without losing the essentials
- Each chart on the Performance page now shows a 2-line description directly below its title, explaining what you see and what to look for — no need to scroll to the methodology section

## 🔧 Improvements

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

- Fixed a browser console warning on every page load: the Geist Mono font was being preloaded on all pages despite only being used on the FIRE and Hall of Fame pages
