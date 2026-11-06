import * as React from "react"

import { cn } from "@/lib/utils"
import { NO_AUTOFILL_ATTRIBUTES } from "@/components/ui/autofill"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/** The app's multi-line field. No autofill by default (components/ui/autofill.ts); a caller's `autoComplete` wins. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...NO_AUTOFILL_ATTRIBUTES}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
