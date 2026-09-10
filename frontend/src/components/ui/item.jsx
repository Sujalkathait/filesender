"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

const Item = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center gap-3 rounded-lg border p-3 shadow-sm",
      variant === "muted" && "bg-muted/50 border-muted",
      className
    )}
    {...props}
  />
))
Item.displayName = "Item"

const ItemMedia = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-shrink-0 items-center justify-center", className)} {...props} />
))
ItemMedia.displayName = "ItemMedia"

const ItemContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col flex-1", className)} {...props} />
))
ItemContent.displayName = "ItemContent"

const ItemTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h4 ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />
))
ItemTitle.displayName = "ItemTitle"

export { Item, ItemMedia, ItemContent, ItemTitle }
