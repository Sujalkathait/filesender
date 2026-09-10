"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

const Spinner = React.forwardRef(({ className, size = 24, ...props }, ref) => (
  <Loader2
    ref={ref}
    size={size}
    className={cn("animate-spin text-muted-foreground", className)}
    {...props}
  />
))
Spinner.displayName = "Spinner"

export { Spinner }
