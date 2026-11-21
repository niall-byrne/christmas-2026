import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { InputStep } from "@/cli/lib/step/inputStep"

const { inputMock } = vi.hoisted(() => ({ inputMock: vi.fn() }))
vi.mock("@inquirer/prompts", () => ({ input: inputMock }))

describe("InputStep", () => {
  const TEST_FIXTURES = {
    key: "name",
    message: "Game name",
    answer: "Winter game",
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when prompting without custom validation", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      inputMock.mockResolvedValue(TEST_FIXTURES.answer)
      const step = new InputStep({
        key: TEST_FIXTURES.key,
        message: TEST_FIXTURES.message,
      })
      result = await step.run()
    })

    it("returns the answer under its configured key", () => {
      expect(result).toEqual({
        [TEST_FIXTURES.key]: TEST_FIXTURES.answer,
      })
    })

    it("passes the prompt message and no custom validator", () => {
      expect(inputMock).toHaveBeenCalledWith({
        message: TEST_FIXTURES.message,
        validate: undefined,
      })
    })
  })

  describe("when a custom validator is configured", () => {
    let validate: (value: string) => boolean | string

    beforeEach(async () => {
      validate = (value: string) => value.length > 0 || "Required"
      inputMock.mockResolvedValue(TEST_FIXTURES.answer)
      const step = new InputStep({
        key: TEST_FIXTURES.key,
        message: TEST_FIXTURES.message,
        validate,
      })
      await step.run()
    })

    it("passes the validator to the text prompt", () => {
      expect(inputMock).toHaveBeenCalledWith({
        message: TEST_FIXTURES.message,
        validate,
      })
    })
  })

  describe("when a schema is configured", () => {
    let schemaValidator: (value: string) => boolean | string

    beforeEach(async () => {
      inputMock.mockResolvedValue(TEST_FIXTURES.answer)
      const step = new InputStep({
        key: TEST_FIXTURES.key,
        message: TEST_FIXTURES.message,
        schema: z.string().min(1),
      })
      await step.run()
      schemaValidator = inputMock.mock.calls[0][0].validate as (
        value: string
      ) => boolean | string
    })

    it("returns an error message for a value that violates the schema", () => {
      expect(schemaValidator("")).toEqual(expect.any(String))
    })

    it("accepts a value that matches the schema", () => {
      expect(schemaValidator(TEST_FIXTURES.answer)).toBe(true)
    })
  })
})
