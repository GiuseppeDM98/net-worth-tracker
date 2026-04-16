## ✨ New Features

- Added public demo mode — a "Try the Demo" button on the login page and landing page auto-logs visitors into a shared read-only account, letting them explore the full app without registering
- Added landing page at `/` with a hero section, six feature highlight cards, and a link to the GitHub repository; authenticated users are redirected to the dashboard immediately

## 🐛 Bug Fixes

- Fixed 100× portfolio value inflation for LSE assets priced in GBp (pence) — assets like SWDA.L now show correct EUR-equivalent values even before a manual price refresh

## 🔧 Improvements

- Demo account is fully read-only: all create, edit, delete, snapshot, price-update, AI analysis, and settings-save actions are disabled with an explanatory tooltip
- AI Assistant page shows a clear "not available in demo" screen instead of a partially interactive interface
- Demo mode banner in the dashboard header signals read-only status at a glance
