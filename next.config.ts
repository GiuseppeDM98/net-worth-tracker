import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
{
        // Report-Only on purpose: observe violations in the browser console
        // before enforcing. Promote to Content-Security-Policy in a follow-up.
        key: 'Content-Security-Policy-Report-Only',
        value: [
          "default-src 'self'",
          // Next.js inline runtime + styled JSX need unsafe-inline until nonces are wired
          // Firebase SDK uses eval() for some operations (e.g., WebChannel, protobuf)
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          // Firebase Auth + Firestore + Identity Toolkit + FCM
          "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com",
          "frame-src 'self' https://*.firebaseapp.com",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
];

const nextConfig: NextConfig = {
  // Standalone mode copies only the files needed to run in production,
  // skipping the full node_modules — cuts Docker image size significantly.
  output: "standalone",
  // Next refuses to start a second `next dev` for the same project directory, whatever the port,
  // because the lock lives inside the build dir. The Playwright suite (`npm run dev:e2e`) sets this
  // to `.next-e2e` so it can run against the emulators while a normal dev server is still up.
  // Unset everywhere else → the default `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins: ['192.168.1.114'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
