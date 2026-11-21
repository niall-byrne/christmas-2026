"use client"

import { Eye } from "lucide-react"
import { Button } from "@/ui/components/primitives/button"
import { useLargeText } from "@/ui/hooks/useLargeText"

export function AccessibilityToggle() {
  const { isLargeText, toggleLargeText } = useLargeText()

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLargeText}
      aria-label="Toggle large text mode"
      className="gap-2"
    >
      <Eye className="size-4" />
      <span>{isLargeText ? "Normal Text" : "Large Text"}</span>
    </Button>
  )
}