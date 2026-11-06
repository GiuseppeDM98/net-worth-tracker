"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import { usePopperSheet } from "@/components/ui/popper-sheet"

/**
 * Whether this popover opens as a bottom sheet below 769px (components/ui/popper-sheet.ts).
 * Decided at the root, because a sheet must also be `modal`: inside a drawer the drawer's scroll
 * lock would otherwise swallow the sheet's own touch scroll (what `MultiSelect`'s `forceDrawer`
 * works around), and a modal popover owns the lock while it is open.
 */
const PopoverSheetContext = React.createContext(false)

/**
 * A popover that PICKS something (an icon, a preference) passes `sheet`, and below 769px opens
 * as a bottom sheet; one that only informs («Come si calcola») stays a floating card everywhere.
 */
function Popover({
  sheet = false,
  modal,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root> & { sheet?: boolean }) {
  const isSheet = usePopperSheet() && sheet
  return (
    <PopoverSheetContext.Provider value={isSheet}>
      <PopoverPrimitive.Root modal={modal ?? isSheet} {...props} />
    </PopoverSheetContext.Provider>
  )
}

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "end", sideOffset = 6, ...props }, ref) => {
  const sheet = React.useContext(PopoverSheetContext)
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        data-popper-sheet={sheet ? "" : undefined}
        className={cn(
          "z-50 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
