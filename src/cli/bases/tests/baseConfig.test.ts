import { beforeEach, describe, expect, it } from "vitest"
import { BaseCliConfig } from "@/cli/bases/baseConfig"

class TestConfig extends BaseCliConfig {
  readonly usage = "Usage: test"
  readonly optionMap = { "--file": "file" } as const
  readonly environmentFiles = [".env"]

  readRecord(context: Readonly<Record<string, unknown>>, key: string) {
    return this.getContextRecord(context, key)
  }

  readString(context: Readonly<Record<string, unknown>>, key: string) {
    return this.getContextString(context, key)
  }

  readOption(context: Readonly<Record<string, unknown>>, key: string) {
    return this.getOption(context, key)
  }
}

describe("BaseCliConfig", () => {
  const TEST_FIXTURES = {
    record: { name: "Winter game" },
    context: {
      metadata: { name: "Winter game" },
      options: { file: "./game.json" },
    },
  }

  let config: TestConfig

  beforeEach(() => {
    config = new TestConfig()
  })

  describe("when reading a record from workflow context", () => {
    describe("when the context value is an object", () => {
      let record: Readonly<Record<string, unknown>>

      beforeEach(() => {
        record = config.readRecord(TEST_FIXTURES.context, "metadata")
      })

      it("returns the object as a record", () => {
        expect(record).toEqual(TEST_FIXTURES.record)
      })
    })

    describe.each([
      { description: "missing", context: {} },
      { description: "an array", context: { metadata: [] } },
    ])("when the context value is $description", ({ context }) => {
      let readRecord: () => Readonly<Record<string, unknown>>

      beforeEach(() => {
        readRecord = () => config.readRecord(context, "metadata")
      })

      it("rejects the value", () => {
        expect(readRecord).toThrow("Cannot read workflow record: metadata")
      })
    })
  })

  describe("when reading a string from workflow context", () => {
    describe("when the context value is a string", () => {
      let value: string

      beforeEach(() => {
        value = config.readString({ name: "Winter game" }, "name")
      })

      it("returns the string", () => {
        expect(value).toBe("Winter game")
      })
    })

    describe("when the context value is not a string", () => {
      let readString: () => string

      beforeEach(() => {
        readString = () => config.readString({ name: 12 }, "name")
      })

      it("rejects the value", () => {
        expect(readString).toThrow("Cannot read workflow value: name")
      })
    })
  })

  describe("when reading an option from workflow context", () => {
    describe("when a string option is provided", () => {
      let value: string | undefined

      beforeEach(() => {
        value = config.readOption(TEST_FIXTURES.context, "file")
      })

      it("returns the configured option", () => {
        expect(value).toBe("./game.json")
      })
    })

    describe("when the option is not provided", () => {
      let value: string | undefined

      beforeEach(() => {
        value = config.readOption({ options: {} }, "file")
      })

      it("returns undefined", () => {
        expect(value).toBeUndefined()
      })
    })

    describe("when the option value is not a string", () => {
      let readOption: () => string | undefined

      beforeEach(() => {
        readOption = () =>
          config.readOption({ options: { file: false } }, "file")
      })

      it("rejects the option value", () => {
        expect(readOption).toThrow("Invalid command option: file")
      })
    })

    describe("when the options record is missing", () => {
      let readOption: () => string | undefined

      beforeEach(() => {
        readOption = () => config.readOption({}, "file")
      })

      it("rejects the missing options record", () => {
        expect(readOption).toThrow("Cannot read workflow record: options")
      })
    })
  })
})
