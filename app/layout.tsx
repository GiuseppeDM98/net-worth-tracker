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
import { QueryClientProvider } from "@/lib/providers/QueryClientProvider";
import { Toaster } from "@/components/ui/sonner";

// Load Geist fonts with CSS variables for Tailwind integration
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio Tracker - Gestisci il tuo Patrimonio",
  description: "Traccia e monitora il tuo portafoglio di investimenti",
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icon.svg', color: '#10B981' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Provider hierarchy: AuthProvider → QueryClientProvider → Children
            AuthProvider MUST be outermost to ensure auth state is available
            before React Query hooks run (they may need user.uid for keys) */}
        <AuthProvider>
          <QueryClientProvider>
            {children}
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
