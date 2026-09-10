"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

const FieldGroup = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-4", className)} {...props} />
))
FieldGroup.displayName = "FieldGroup"

const Field = React.forwardRef(({ className, orientation = "vertical", "data-disabled": dataDisabled, ...props }, ref) => (
  <div
    ref={ref}
    data-disabled={dataDisabled}
    className={cn(
      "flex",
      orientation === "horizontal" ? "flex-row items-start gap-3" : "flex-col gap-2",
      dataDisabled && "opacity-50",
      className
    )}
    {...props}
  />
))
Field.displayName = "Field"

const FieldContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("grid gap-1.5 leading-none", className)} {...props} />
))
FieldContent.displayName = "FieldContent"

const FieldLabel = React.forwardRef(({ className, htmlFor, ...props }, ref) => (
  <label
    ref={ref}
    htmlFor={htmlFor}
    className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
    {...props}
  />
))
FieldLabel.displayName = "FieldLabel"

const FieldTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h4 ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />
))
FieldTitle.displayName = "FieldTitle"

const FieldDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
FieldDescription.displayName = "FieldDescription"

export { Field, FieldGroup, FieldContent, FieldLabel, FieldTitle, FieldDescription }
