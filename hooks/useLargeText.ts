"use client"

import * as React from "react"

const STORAGE_KEY = "accessibility-large-text"
const CLASS_NAME = "accessibility-large"

function getSnapshot() {
  if (typeof window === "undefined") return false
  return localStorage.getItem(STORAGE_KEY) === "true"
}

function getServerSnapshot() {
  return false
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener("local-storage", callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener("local-storage", callback)
  }
}

export function useLargeText() {
  const isLargeText = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  // Apply the DOM class whenever the store value changes
  React.useEffect(() => {
    if (isLargeText) {
      document.documentElement.classList.add(CLASS_NAME)
    } else {
      document.documentElement.classList.remove(CLASS_NAME)
    }
  }, [isLargeText])

  const toggleLargeText = () => {
    const nextState = !isLargeText
    localStorage.setItem(STORAGE_KEY, String(nextState))
    // Trigger custom event to notify listeners in the same tab
    window.dispatchEvent(new Event("local-storage"))
  }

  return { isLargeText, toggleLargeText }
}
