/**
 * SettingsPageSkeleton — loading placeholder for the Settings page.
 *
 * Mirrors the layout: header + tab bar + 4-5 card sections
 * with form fields (toggles, inputs, sliders).
 */

import { cn } from '@/lib/utils';

function SkeletonBar({ className, delayMs = 0 }: { className?: string; delayMs?: number }) {
  return (
    <div
      className={cn(
        'rounded bg-muted motion-safe:animate-pulse motion-reduce:opacity-40',
        className
      )}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

function ToggleRowSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex flex-col gap-1.5">
        <SkeletonBar className="h-4 w-56" delayMs={delayMs} />
        <SkeletonBar className="h-3 w-80" delayMs={delayMs + 30} />
      </div>
      <SkeletonBar className="h-6 w-10 rounded-full shrink-0 ml-4" delayMs={delayMs + 50} />
    </div>
  );
}

function InputRowSkeleton({ delayMs = 0, labelWidth = 'w-40' }: { delayMs?: number; labelWidth?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SkeletonBar className={`h-4 ${labelWidth}`} delayMs={delayMs} />
      <SkeletonBar className="h-10 w-full rounded-md" delayMs={delayMs + 30} />
    </div>
  );
}

function SettingsCardSkeleton({
  delayMs = 0,
  titleWidth = 'w-44',
  rows = 3,
  hasInputs = false,
}: {
  delayMs?: number;
  titleWidth?: string;
  rows?: number;
  hasInputs?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <SkeletonBar className={`h-5 ${titleWidth}`} delayMs={delayMs} />
      {hasInputs ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: rows }).map((_, i) => (
            <InputRowSkeleton key={i} delayMs={delayMs + 60 + i * 50} />
          ))}
        </div>
      ) : (
        <div>
          {Array.from({ length: rows }).map((_, i) => (
            <ToggleRowSkeleton key={i} delayMs={delayMs + 60 + i * 60} />
          ))}
        </div>
      )}
    </div>
  );
}

function AllocationTargetsSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-6 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-5 w-56" delayMs={delayMs} />
        <SkeletonBar className="h-4 w-24" delayMs={delayMs + 30} />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2 border-b last:border-0">
          <SkeletonBar className="h-4 w-28" delayMs={delayMs + 60 + i * 40} />
          <SkeletonBar className="h-8 w-24 rounded-md ml-auto" delayMs={delayMs + 80 + i * 40} />
          <SkeletonBar className="h-4 w-8" delayMs={delayMs + 90 + i * 40} />
        </div>
      ))}
      <div className="flex items-center justify-between pt-2">
        <SkeletonBar className="h-4 w-32" delayMs={delayMs + 360} />
        <SkeletonBar className="h-5 w-16" delayMs={delayMs + 380} />
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 max-desktop:portrait:pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonBar className="h-9 w-36" />
          <SkeletonBar className="h-4 w-72" delayMs={40} />
        </div>
        <div className="flex gap-2">
          <SkeletonBar className="h-9 w-40 rounded-md" delayMs={80} />
          <SkeletonBar className="h-9 w-24 rounded-md" delayMs={100} />
        </div>
      </div>

      {/* Tab bar — mobile select */}
      <div className="desktop:hidden">
        <SkeletonBar className="h-11 w-full rounded-md" delayMs={120} />
      </div>

      {/* Tab bar — desktop grid */}
      <div className="hidden desktop:grid desktop:grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBar key={i} className="h-9 rounded-md" delayMs={120 + i * 30} />
        ))}
      </div>

      {/* Card sections */}
      <SettingsCardSkeleton delayMs={200} titleWidth="w-44" rows={3} />
      <AllocationTargetsSkeleton delayMs={320} />
      <SettingsCardSkeleton delayMs={500} titleWidth="w-36" rows={2} hasInputs />
      <SettingsCardSkeleton delayMs={620} titleWidth="w-48" rows={3} />
      <SettingsCardSkeleton delayMs={740} titleWidth="w-40" rows={2} />
    </div>
  );
}
