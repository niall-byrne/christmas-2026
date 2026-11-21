import { beforeEach, describe, expect, it } from "vitest"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"
import { ResolveHttpOriginStep } from "@/cli/lib/step/resolveHttpOriginStep"

describe("ResolveHttpOriginStep", () => {
  const TEST_FIXTURES = {
    environmentVariable: "HOST",
    option: "--url",
  }

  describe("when the configured value is an HTTP origin", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      const step = new ResolveHttpOriginStep({
        outputKey: "origin",
        value: (context) => context.url as string,
        environmentVariable: TEST_FIXTURES.environmentVariable,
        option: TEST_FIXTURES.option,
      })
      result = await step.run({ url: "https://games.test" })
    })

    it("stores the resolved origin in workflow output", () => {
      expect(result).toEqual({ origin: "https://games.test" })
    })
  })

  describe("when a configured root path is allowed", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      const step = new ResolveHttpOriginStep({
        outputKey: "origin",
        value: () => "http://games.test/service",
        environmentVariable: TEST_FIXTURES.environmentVariable,
        option: TEST_FIXTURES.option,
        rootPath: "/service",
      })
      result = await step.run({})
    })

    it("returns only the URL origin", () => {
      expect(result).toEqual({ origin: "http://games.test" })
    })
  })

  describe("when no origin is configured", () => {
    let request: Promise<unknown>

    beforeEach(() => {
      const step = new ResolveHttpOriginStep({
        outputKey: "origin",
        value: () => undefined,
        environmentVariable: TEST_FIXTURES.environmentVariable,
        option: TEST_FIXTURES.option,
      })
      request = step.run({}).catch((error: unknown) => error)
    })

    it("rejects with a CLI error", async () => {
      await expect(request).resolves.toBeInstanceOf(CliBaseError)
    })
  })

  describe("when the URL uses a non-HTTP protocol", () => {
    let request: Promise<unknown>

    beforeEach(() => {
      const step = new ResolveHttpOriginStep({
        outputKey: "origin",
        value: () => "ftp://games.test",
        environmentVariable: TEST_FIXTURES.environmentVariable,
        option: TEST_FIXTURES.option,
      })
      request = step.run({}).catch((error: unknown) => error)
    })

    it("rejects with a CLI error", async () => {
      await expect(request).resolves.toBeInstanceOf(CliBaseError)
    })
  })

  describe("when the URL path does not match the configured root", () => {
    let request: Promise<unknown>

    beforeEach(() => {
      const step = new ResolveHttpOriginStep({
        outputKey: "origin",
        value: () => "https://games.test/service",
        environmentVariable: TEST_FIXTURES.environmentVariable,
        option: TEST_FIXTURES.option,
      })
      request = step.run({}).catch((error: unknown) => error)
    })

    it("rejects with a CLI error", async () => {
      await expect(request).resolves.toBeInstanceOf(CliBaseError)
    })
  })
})
