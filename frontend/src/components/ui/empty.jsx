"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

const Empty = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col items-center justify-center space-y-6 rounded-md border border-dashed p-8 text-center animate-in fade-in-50",
      className
    )}
    {...props}
  />
))
Empty.displayName = "Empty"

const EmptyHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col items-center space-y-2", className)} {...props} />
))
EmptyHeader.displayName = "EmptyHeader"

const EmptyMedia = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted",
      variant === "icon" && "text-muted-foreground",
      className
    )}
    {...props}
  />
))
EmptyMedia.displayName = "EmptyMedia"

const EmptyTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
))
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground max-w-sm", className)} {...props} />
))
EmptyDescription.displayName = "EmptyDescription"

const EmptyContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex w-full flex-col gap-2 sm:flex-row sm:justify-center", className)} {...props} />
))
EmptyContent.displayName = "EmptyContent"

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent }
