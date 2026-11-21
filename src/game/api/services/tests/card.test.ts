import { beforeEach, describe, expect, it } from "vitest"
import { serializeCardEntry } from "@/game/api/services/card"

describe("serializeCardEntry", () => {
  const TEST_FIXTURES = {
    recipient: "  Mary   Jane  ",
    identifier: "  card\t  42 ",
    expectedEntry: {
      recipient: "Mary Jane",
      identifier: "card 42",
    },
  }

  describe("when a card entry contains surrounding and repeated whitespace", () => {
    let serializedEntry: string

    beforeEach(() => {
      serializedEntry = serializeCardEntry(
        TEST_FIXTURES.recipient,
        TEST_FIXTURES.identifier
      )
    })

    it("serializes normalized recipient and identifier values", () => {
      expect(JSON.parse(serializedEntry)).toEqual(TEST_FIXTURES.expectedEntry)
    })
  })
})
