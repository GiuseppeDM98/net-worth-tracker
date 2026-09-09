"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      {...props}
    />
  )
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: Readonly<React.ComponentProps<typeof DrawerPrimitive.Portal>>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  )
}

const minHeightMap = {
  small: "min-h-[30dvh]",
  medium: "min-h-[60dvh]",
  large: "min-h-[75dvh]",
  xlarge: "min-h-[85dvh]",
  full: "min-h-[92dvh]",
} as const

function DrawerContent({
  className,
  children,
  minHeight,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  minHeight?: keyof typeof minHeightMap
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          // `bg-card`, like the Dialog: the two are one surface at two widths, and a sheet the
          // colour of the page under it reads as part of that page (DESIGN.md §2).
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[10px] border bg-card",
          // Max height: 92vh so the top is always visible
          "max-h-[92dvh]",
          minHeight && minHeightMap[minHeight],
          className
        )}
        {...props}
      >
        {/* Drag handle */}
        <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-muted shrink-0" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1.5 px-4 py-3", className)}
      {...props}
    />
  )
}

function DrawerFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "flex flex-col gap-2 px-4 pb-safe pt-3 border-t shrink-0",
        // iOS safe area
        "pb-[calc(env(safe-area-inset-bottom,0px)+12px)]",
        className
      )}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-foreground text-base", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}
