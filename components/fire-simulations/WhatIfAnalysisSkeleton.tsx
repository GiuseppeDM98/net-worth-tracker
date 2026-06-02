'use client';

/**
 * Structural skeleton for the What If Analysis tab. Mirrors the post-load layout
 * (hero → event selector → inputs → two impact panels → sensitivity) so the first
 * frame previews the real structure instead of a bare spinner.
 */

import { Card } from '@/components/ui/card';

export function WhatIfAnalysisSkeleton() {
  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="space-y-3 px-6 py-5">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-48 animate-pulse rounded bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        </div>
      </Card>

      {/* Event selector */}
      <div className="grid grid-cols-2 gap-2 desktop:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>

      {/* Inputs */}
      <Card className="overflow-hidden">
        <div className="grid gap-4 px-6 py-5 desktop:grid-cols-2">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
        </div>
      </Card>

      {/* Impact panels */}
      <div className="grid gap-4 desktop:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="space-y-3 px-6 py-5">
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="h-6 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Sensitivity */}
      <Card className="overflow-hidden">
        <div className="space-y-3 px-6 py-5">
          <div className="h-4 w-44 animate-pulse rounded bg-muted" />
          <div className="h-40 w-full animate-pulse rounded bg-muted" />
        </div>
      </Card>
    </div>
  );
}
