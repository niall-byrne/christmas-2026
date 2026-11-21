// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest"
import {
  createTerminalDivider,
  getTerminalWidth,
} from "@/lib/cli/util/terminal"

describe("CLI terminal helpers", () => {
  const TEST_FIXTURES = {
    character: "=",
    columns: 42,
    defaultWidth: 80,
    minimumWidth: 1,
  }

  describe("reading the terminal width", () => {
    describe("when the terminal reports its width", () => {
      let width: number

      beforeEach(() => {
        width = getTerminalWidth(
          TEST_FIXTURES.columns,
          TEST_FIXTURES.defaultWidth
        )
      })

      it("uses the reported column count", () => {
        expect(width).toBe(TEST_FIXTURES.columns)
      })
    })

    describe("when terminal width is unavailable", () => {
      let width: number

      beforeEach(() => {
        width = getTerminalWidth(undefined, TEST_FIXTURES.defaultWidth)
      })

      it("uses the configured fallback width", () => {
        expect(width).toBe(TEST_FIXTURES.defaultWidth)
      })
    })
  })

  describe("creating a divider", () => {
    let divider: string

    beforeEach(() => {
      divider = createTerminalDivider(
        TEST_FIXTURES.character,
        TEST_FIXTURES.columns,
        TEST_FIXTURES.defaultWidth,
        TEST_FIXTURES.minimumWidth
      )
    })

    it("matches the available terminal width", () => {
      expect(divider).toBe(
        TEST_FIXTURES.character.repeat(TEST_FIXTURES.columns)
      )
    })
  })
})
