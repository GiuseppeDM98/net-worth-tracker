/**
 * Root Layout for Net Worth Tracker
 *
 * Wraps all pages with essential providers and global configuration.
 *
 * Provider Nesting Order (CRITICAL):
 * - AuthProvider (outermost) - Must wrap QueryClientProvider because React Query
 *   hooks may need user.uid for query keys. Auth state must be initialized before
 *   any API calls that depend on authentication.
 * - QueryClientProvider - Enables React Query data fetching and caching
 * - Toaster - UI notification system (placed inside providers to access context)
 *
 * Font Loading Strategy:
 * - Geist Sans and Geist Mono loaded via next/font/google (optimized)
 * - CSS variables (--font-geist-sans, --font-geist-mono) for Tailwind integration
 * - Applied to body via className for global availability
 *
 * Favicon Configuration:
 * - Multiple sizes (16x16, 32x32) for browser tabs and bookmarks
 * - SVG icon for modern browsers with scalable quality
 * - Apple touch icon for iOS home screen (180x180)
 * - Safari mask icon with brand color (#10B981 emerald-500)
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveAccountProvider } from "@/contexts/ActiveAccountContext";
import { QueryClientProvider } from "@/lib/providers/QueryClientProvider";
import { Toaster } from "@/components/ui/sonner";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ColorThemeProvider } from "@/contexts/ColorThemeContext";

// Load Geist fonts with CSS variables for Tailwind integration
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Geist Mono IS preloaded: the Mono Mandate (DESIGN.md §3) puts it on every number of every page,
// starting with the 44/54px page hero, so it belongs on the critical path.
//
// It used to carry `preload: false`, justified by "Geist Mono is only used on FIRE and Hall of Fame"
// — a premise the Mono Mandate has since made false, which left the font to be discovered only after
// the CSS was parsed: measured on Previdenza, `document.fonts.check('54px "Geist Mono"')` was still
// false on the first frame that painted the hero. No layout shift results (next/font's
// metric-adjusted fallback holds the width), but every number in the app is drawn in the system
// monospace and then redrawn — losing, for that window, precisely the precision signal the mono font
// is there to give.
//
// The cost this reinstates is the original objection: a "preloaded but not used" console warning on
// the pages that render no number at all, i.e. /login and /register (the landing page does use it).
// A warning on two auth pages against late numbers everywhere else.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio Tracker - Gestisci il tuo Patrimonio",
  description: "Traccia e monitora il tuo portafoglio di investimenti",
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Provider hierarchy: AuthProvider → QueryClientProvider → Children
            AuthProvider MUST be outermost to ensure auth state is available
            before React Query hooks run (they may need user.uid for keys) */}
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>
              <ActiveAccountProvider>
                <ColorThemeProvider>
                  <QueryClientProvider>
                    {children}
                    <Toaster />
                  </QueryClientProvider>
                </ColorThemeProvider>
              </ActiveAccountProvider>
            </AuthProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
