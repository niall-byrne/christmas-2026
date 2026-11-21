// @vitest-environment node

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"
import { CliResponseError } from "@/cli/lib/error/cliResponseError"
import { PostJsonStep } from "@/cli/lib/step/postJsonStep"

describe("PostJsonStep", () => {
  const TEST_FIXTURES = {
    context: { body: { name: "Winter game" } },
    url: new URL("https://games.test/api/games"),
    payload: { gameId: "game-123" },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function createStep() {
    return new PostJsonStep({
      url: () => TEST_FIXTURES.url,
      bodyKey: "body",
      outputKey: "response",
      operation: "Create game",
      method: "POST",
      contentTypeHeader: "Content-Type",
      contentType: "application/json",
      successStatus: 201,
      parseSuccess: (payload) => payload,
    })
  }

  describe("when the server returns the configured success status", () => {
    let fetchMock: Mock<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >
    let result: Record<string, unknown>

    beforeEach(async () => {
      const respond: (
        input: RequestInfo | URL,
        init?: RequestInit
      ) => Promise<Response> = async () =>
        new Response(JSON.stringify(TEST_FIXTURES.payload), { status: 201 })
      fetchMock = vi.fn(respond)
      vi.stubGlobal("fetch", fetchMock)
      result = await createStep().run(TEST_FIXTURES.context)
    })

    it("posts the configured body and headers", () => {
      expect(fetchMock).toHaveBeenCalledWith(TEST_FIXTURES.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(TEST_FIXTURES.context.body),
      })
    })

    it("returns the parsed response under the configured output key", () => {
      expect(result).toEqual({ response: TEST_FIXTURES.payload })
    })
  })

  describe("when the server returns an error response", () => {
    let request: Promise<unknown>

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ error: "INVALID", message: "Bad game data" }),
              { status: 400 }
            )
          )
      )
      request = createStep()
        .run(TEST_FIXTURES.context)
        .catch((error: unknown) => error)
    })

    it("rejects with the structured API error", async () => {
      await expect(request).resolves.toMatchObject({
        message: "Create game failed with HTTP 400: INVALID: Bad game data",
      })
    })
  })

  describe("when a success response contains invalid JSON", () => {
    let request: Promise<unknown>

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{", { status: 201 }))
      )
      request = createStep()
        .run(TEST_FIXTURES.context)
        .catch((error: unknown) => error)
    })

    it("rejects with a CLI response error", async () => {
      await expect(request).resolves.toBeInstanceOf(CliResponseError)
    })
  })
})
