import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useLargeText } from "@/hooks/useLargeText"

const STORAGE_KEY = "accessibility-large-text"
const CLASS_NAME = "accessibility-large"

function renderLargeTextHook(initialStoredValue?: string) {
  if (initialStoredValue !== undefined) {
    localStorage.setItem(STORAGE_KEY, initialStoredValue)
  }
  return renderHook(() => useLargeText())
}

describe("useLargeText hook", () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove(CLASS_NAME)
  })

  describe("default behavior without a toggle", () => {
    let hook: ReturnType<typeof renderLargeTextHook>

    beforeEach(() => {
      hook = renderLargeTextHook()
    })

    it("maintains default state when no toggle action is performed", () => {
      expect(hook.result.current.isLargeText).toBe(false)
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(
        false
      )
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe("when initialized with empty localStorage", () => {
    let hook: ReturnType<typeof renderLargeTextHook>

    beforeEach(() => {
      hook = renderLargeTextHook()
    })

    it("starts with false and does not add the class", () => {
      expect(hook.result.current.isLargeText).toBe(false)
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(
        false
      )
    })

    it("toggles to true, updates localStorage, and adds the class", () => {
      act(() => {
        hook.result.current.toggleLargeText()
      })

      expect(hook.result.current.isLargeText).toBe(true)
      expect(localStorage.getItem(STORAGE_KEY)).toBe("true")
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(true)
    })
  })

  describe("when initialized with false in localStorage", () => {
    let hook: ReturnType<typeof renderLargeTextHook>

    beforeEach(() => {
      hook = renderLargeTextHook("false")
    })

    it("starts with false and does not add the class", () => {
      expect(hook.result.current.isLargeText).toBe(false)
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(
        false
      )
    })

    it("toggles to true, updates localStorage, and adds the class", () => {
      act(() => {
        hook.result.current.toggleLargeText()
      })

      expect(hook.result.current.isLargeText).toBe(true)
      expect(localStorage.getItem(STORAGE_KEY)).toBe("true")
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(true)
    })
  })

  describe("when initialized with true in localStorage", () => {
    let hook: ReturnType<typeof renderLargeTextHook>

    beforeEach(() => {
      hook = renderLargeTextHook("true")
    })

    it("starts with true and adds the class", () => {
      expect(hook.result.current.isLargeText).toBe(true)
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(true)
    })

    it("toggles to false, updates localStorage, and removes the class", () => {
      act(() => {
        hook.result.current.toggleLargeText()
      })

      expect(hook.result.current.isLargeText).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBe("false")
      expect(document.documentElement.classList.contains(CLASS_NAME)).toBe(
        false
      )
    })
  })
})
