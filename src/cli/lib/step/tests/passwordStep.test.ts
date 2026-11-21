import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PasswordStep } from "@/cli/lib/step/passwordStep"
import { z } from "zod"

const { passwordMock } = vi.hoisted(() => ({ passwordMock: vi.fn() }))
vi.mock("@inquirer/prompts", () => ({ password: passwordMock }))

describe("PasswordStep", () => {
  const TEST_FIXTURES = {
    key: "password",
    message: "Password",
    mask: "*",
    answer: "secret",
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe("when prompting for a masked password", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      passwordMock.mockResolvedValue(TEST_FIXTURES.answer)
      const step = new PasswordStep({
        key: TEST_FIXTURES.key,
        message: TEST_FIXTURES.message,
        mask: TEST_FIXTURES.mask,
      })
      result = await step.run()
    })

    it("returns the answer under its configured key", () => {
      expect(result).toEqual({ [TEST_FIXTURES.key]: TEST_FIXTURES.answer })
    })

    it("passes the message, mask, and default validator to the prompt", () => {
      expect(passwordMock).toHaveBeenCalledWith({
        message: TEST_FIXTURES.message,
        validate: undefined,
        mask: TEST_FIXTURES.mask,
      })
    })
  })

  describe("when a schema is configured", () => {
    let schemaValidator: (value: string) => boolean | string

    beforeEach(async () => {
      passwordMock.mockResolvedValue(TEST_FIXTURES.answer)
      const step = new PasswordStep({
        key: TEST_FIXTURES.key,
        message: TEST_FIXTURES.message,
        schema: z.string().min(1),
      })
      await step.run()
      schemaValidator = passwordMock.mock.calls[0][0].validate as (
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
