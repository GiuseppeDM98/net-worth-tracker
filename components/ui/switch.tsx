import * as React from "react"
import { Switch as SwitchPrimitives } from "radix-ui"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // In dark mode --primary is near-white (oklch 0.922); override to blue so the
      // ON state is clearly distinguishable from the background.
      "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary dark:data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-input",
      // The painted control stays 36×20 (shadcn's), the TARGET is 44×44 (AGENTS.md § Accessibility):
      // a pseudo-element grows the button's hit box by 12px above and below and 4px on each
      // side without moving a label beside it. It paints before the thumb, so it never covers it.
      "before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
