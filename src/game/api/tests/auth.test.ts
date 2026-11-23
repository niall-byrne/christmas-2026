// @vitest-environment node

import { createHmac } from "node:crypto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AuthorizationErrorReason } from "@/contracts/game/api"
import { AUTHORIZATION_ERROR_REASON } from "@/contracts/game/api/auth"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { Authorization } from "@/game/api/auth"
import {
  AuthorizationError,
  MissingAuthSecretError,
} from "@/game/api/error/auth"

describe("Authorization", () => {
  const GAME_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"
  const OTHER_GAME_ID = "z9y8x7w6v5u4t3s2r1q0p9o8"
  const PLAYER_ID = "m1n2b3v4c5x6z7l8k9j0h1g2"

  const TEST_FIXTURES = {
    secret: "super-secret-signing-key-for-tests-2026",
    altSecret: "different-signing-key-for-tamper-tests",
    gameId: GAME_ID,
    otherGameId: OTHER_GAME_ID,
    playerId: PLAYER_ID,
    sessionName: `${Authorization.SESSION_PREFIX}${GAME_ID}`,
    sessionPrefix: `${Authorization.SESSION_PREFIX}${GAME_ID}=`,
    gamesUrl: "http://localhost:3000/api/v1/games",
    customMaxAge: 3600,
  } as const

  function extractSessionPair(sessionHeader: string): string {
    const firstSegment = sessionHeader.split(";").at(0)
    expect(firstSegment).toBeDefined()
    return firstSegment as string
  }

  function issueSessionToken(
    gameId: string = TEST_FIXTURES.gameId,
    secret: string = TEST_FIXTURES.secret
  ): string {
    const header = Authorization.responseHeaderFactory(gameId, { secret })
    const pair = extractSessionPair(header)
    const eqIndex = pair.indexOf("=")
    return pair.slice(eqIndex + 1)
  }

  function issuePlayerSessionPair(
    gameId: string = TEST_FIXTURES.gameId,
    playerId: string = TEST_FIXTURES.playerId,
    secret: string = TEST_FIXTURES.secret
  ): string {
    return extractSessionPair(
      Authorization.playerResponseHeaderFactory(gameId, playerId, { secret })
    )
  }

  function signRawPayload(encodedPayload: string): string {
    const signature = createHmac("sha256", TEST_FIXTURES.secret)
      .update(encodedPayload)
      .digest("base64url")
    return `${encodedPayload}.${signature}`
  }

  function createRequestWithSession(sessionHeader?: string): Request {
    return new Request(TEST_FIXTURES.gamesUrl, {
      headers: sessionHeader ? { cookie: sessionHeader } : undefined,
    })
  }

  function captureThrownError(fn: () => void): unknown {
    try {
      fn()
      return undefined
    } catch (err) {
      return err
    }
  }

  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", TEST_FIXTURES.secret)
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("NODE_ENV", "test")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe("responseHeaderFactory", () => {
    describe("when called in a non-production environment", () => {
      let header: string

      beforeEach(() => {
        header = Authorization.responseHeaderFactory(TEST_FIXTURES.gameId)
      })

      it("formats an HttpOnly SameSite=Lax session with 24h Max-Age and no Secure flag", () => {
        expect(header.startsWith(TEST_FIXTURES.sessionPrefix)).toBe(true)
        expect(header).toContain("Path=/")
        expect(header).toContain("HttpOnly")
        expect(header).toContain("SameSite=Lax")
        expect(header).toContain(
          `Max-Age=${Authorization.DEFAULT_MAX_AGE_SECONDS}`
        )
        expect(header).not.toContain("Secure")
      })
    })

    describe("when VERCEL_ENV is production", () => {
      let header: string

      beforeEach(() => {
        vi.stubEnv("VERCEL_ENV", "production")
        header = Authorization.responseHeaderFactory(TEST_FIXTURES.gameId)
      })

      it("appends the Secure attribute", () => {
        expect(header).toContain("; Secure")
      })
    })

    describe("when custom options are passed", () => {
      let header: string
      let request: Request

      beforeEach(() => {
        header = Authorization.responseHeaderFactory(TEST_FIXTURES.gameId, {
          secret: TEST_FIXTURES.altSecret,
          maxAgeSeconds: TEST_FIXTURES.customMaxAge,
          secure: true,
        })
        request = createRequestWithSession(extractSessionPair(header))
      })

      it("applies custom maxAgeSeconds, secure flag, and signing secret", () => {
        expect(header).toContain(`Max-Age=${TEST_FIXTURES.customMaxAge}`)
        expect(header).toContain("; Secure")
        expect(() =>
          Authorization.authorizeAnonymousRequest({
            request,
            gameId: TEST_FIXTURES.gameId,
            required: true,
            secret: TEST_FIXTURES.altSecret,
          })
        ).not.toThrow()
      })
    })

    describe("when AUTH_SECRET is missing or blank", () => {
      let thrown: unknown

      beforeEach(() => {
        vi.stubEnv("AUTH_SECRET", "   ")
        thrown = captureThrownError(() =>
          Authorization.responseHeaderFactory(TEST_FIXTURES.gameId)
        )
      })

      it("throws MissingAuthSecretError", () => {
        expect(thrown).toBeInstanceOf(MissingAuthSecretError)
      })
    })
  })

  describe("authorizeAnonymousRequest", () => {
    describe("when required is false or omitted", () => {
      beforeEach(() => {
        vi.stubEnv("AUTH_SECRET", "")
      })

      it("returns without throwing even when headers, gameId, and AUTH_SECRET are absent", () => {
        expect(() =>
          Authorization.authorizeAnonymousRequest({
            request: createRequestWithSession(),
            required: false,
          })
        ).not.toThrow()

        expect(() =>
          Authorization.authorizeAnonymousRequest({
            request: createRequestWithSession(),
          })
        ).not.toThrow()
      })
    })

    describe("when request carries a valid signed session", () => {
      let request: Request

      beforeEach(() => {
        const sessionHeader = Authorization.responseHeaderFactory(
          TEST_FIXTURES.gameId
        )
        const sessionPair = extractSessionPair(sessionHeader)
        request = createRequestWithSession(
          `theme=dark; ${sessionPair}; analytics=1`
        )
      })

      it("authorizes the request without throwing", () => {
        expect(() =>
          Authorization.authorizeAnonymousRequest({
            request,
            gameId: TEST_FIXTURES.gameId,
            required: true,
          })
        ).not.toThrow()
      })
    })

    describe("when request fails session validation (401 AuthorizationError)", () => {
      interface InvalidAuthCase {
        label: string
        buildSession: () => string | undefined
        expectedReason: AuthorizationErrorReason
      }

      const INVALID_AUTH_CASES: InvalidAuthCase[] = [
        {
          label: "missing session header",
          buildSession: () => undefined,
          expectedReason: AUTHORIZATION_ERROR_REASON.MISSING_COOKIE,
        },
        {
          label: "session header with only unrelated cookies",
          buildSession: () => "theme=dark; sidebar=open",
          expectedReason: AUTHORIZATION_ERROR_REASON.MISSING_COOKIE,
        },
        {
          label: "session with empty value",
          buildSession: () => `${TEST_FIXTURES.sessionName}=`,
          expectedReason: AUTHORIZATION_ERROR_REASON.MISSING_COOKIE,
        },
        {
          label: "session belonging to a different gameId",
          buildSession: () =>
            extractSessionPair(
              Authorization.responseHeaderFactory(TEST_FIXTURES.otherGameId)
            ),
          expectedReason: AUTHORIZATION_ERROR_REASON.MISSING_COOKIE,
        },
        {
          label: "token missing dot separator",
          buildSession: () => `${TEST_FIXTURES.sessionName}=not-a-dotted-token`,
          expectedReason: AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN,
        },
        {
          label: "token with extra dot segments",
          buildSession: () => `${TEST_FIXTURES.sessionName}=part1.part2.part3`,
          expectedReason: AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN,
        },
        {
          label: "token with invalid base64url JSON payload",
          buildSession: () =>
            `${TEST_FIXTURES.sessionName}=${signRawPayload("invalid-base64")}`,
          expectedReason: AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN,
        },
        {
          label: "token with JSON payload missing gameId",
          buildSession: () => {
            const emptyPayload = Buffer.from(
              JSON.stringify({}),
              "utf8"
            ).toString("base64url")
            return `${TEST_FIXTURES.sessionName}=${signRawPayload(emptyPayload)}`
          },
          expectedReason: AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN,
        },
        {
          label: "token signed with a different secret",
          buildSession: () =>
            `${TEST_FIXTURES.sessionName}=${issueSessionToken(
              TEST_FIXTURES.gameId,
              TEST_FIXTURES.altSecret
            )}`,
          expectedReason: AUTHORIZATION_ERROR_REASON.INVALID_SIGNATURE,
        },
        {
          label: "token with a tampered signature",
          buildSession: () => {
            const tampered = `${issueSessionToken(TEST_FIXTURES.gameId).slice(0, -1)}X`
            return `${TEST_FIXTURES.sessionName}=${tampered}`
          },
          expectedReason: AUTHORIZATION_ERROR_REASON.INVALID_SIGNATURE,
        },
        {
          label: "valid token for another game copied into target game session",
          buildSession: () =>
            `${TEST_FIXTURES.sessionName}=${issueSessionToken(
              TEST_FIXTURES.otherGameId
            )}`,
          expectedReason: AUTHORIZATION_ERROR_REASON.GAME_ID_MISMATCH,
        },
      ]

      describe.each(INVALID_AUTH_CASES)(
        "given $label",
        ({ buildSession, expectedReason }) => {
          let thrown: unknown

          beforeEach(() => {
            thrown = captureThrownError(() =>
              Authorization.authorizeAnonymousRequest({
                request: createRequestWithSession(buildSession()),
                gameId: TEST_FIXTURES.gameId,
                required: true,
              })
            )
          })

          it("throws AuthorizationError with the expected reason and 401 status", () => {
            expect(thrown).toBeInstanceOf(AuthorizationError)
            expect(thrown).toMatchObject({
              code: ApiErrorCode.UNAUTHORIZED,
              statusCode: 401,
              reason: expectedReason,
            })
          })
        }
      )
    })

    describe("when required is true but server configuration or route gameId is invalid", () => {
      interface MissingGameIdCase {
        label: string
        gameId: string | undefined
      }

      const MISSING_GAME_ID_CASES: MissingGameIdCase[] = [
        { label: "undefined gameId", gameId: undefined },
        { label: "empty gameId", gameId: "" },
        { label: "whitespace-only gameId", gameId: "   " },
      ]

      describe("when AUTH_SECRET is missing or blank", () => {
        let thrown: unknown

        beforeEach(() => {
          vi.stubEnv("AUTH_SECRET", "")
          thrown = captureThrownError(() =>
            Authorization.authorizeAnonymousRequest({
              request: createRequestWithSession(),
              gameId: TEST_FIXTURES.gameId,
              required: true,
            })
          )
        })

        it("throws MissingAuthSecretError", () => {
          expect(thrown).toBeInstanceOf(MissingAuthSecretError)
        })
      })

      describe.each(MISSING_GAME_ID_CASES)("given $label", ({ gameId }) => {
        let thrown: unknown

        beforeEach(() => {
          thrown = captureThrownError(() =>
            Authorization.authorizeAnonymousRequest({
              request: createRequestWithSession(),
              gameId,
              required: true,
            })
          )
        })

        it("throws an Error indicating gameId is required", () => {
          expect(thrown).toBeInstanceOf(Error)
          expect((thrown as Error).message).toBe(
            "gameId is required for anonymous session authorization"
          )
        })
      })
    })
  })

  describe("player identity sessions", () => {
    it("creates a signed HttpOnly session with a 400-day lifetime", () => {
      const header = Authorization.playerResponseHeaderFactory(
        TEST_FIXTURES.gameId,
        TEST_FIXTURES.playerId
      )

      expect(header).toContain(
        `${Authorization.PLAYER_SESSION_PREFIX}${TEST_FIXTURES.gameId}=`
      )
      expect(header).toContain("Path=/")
      expect(header).toContain("HttpOnly")
      expect(header).toContain("SameSite=Lax")
      expect(header).toContain(
        `Max-Age=${Authorization.PLAYER_MAX_AGE_SECONDS}`
      )
    })

    it("authorizes a valid player identity for the matching game", () => {
      const request = createRequestWithSession(issuePlayerSessionPair())

      expect(
        Authorization.authorizePlayerRequest(request, TEST_FIXTURES.gameId)
      ).toEqual({
        gameId: TEST_FIXTURES.gameId,
        playerId: TEST_FIXTURES.playerId,
      })
    })

    it("rejects a player identity signed for a different game", () => {
      const otherSession = issuePlayerSessionPair(
        TEST_FIXTURES.otherGameId
      ).split("=")[1]
      const request = createRequestWithSession(
        `${Authorization.PLAYER_SESSION_PREFIX}${TEST_FIXTURES.gameId}=${otherSession}`
      )

      expect(() =>
        Authorization.authorizePlayerRequest(request, TEST_FIXTURES.gameId)
      ).toThrow(
        expect.objectContaining({
          reason: AUTHORIZATION_ERROR_REASON.GAME_ID_MISMATCH,
        })
      )
    })

    it("rejects a tampered player identity signature", () => {
      const [sessionName, token] = issuePlayerSessionPair().split("=")
      const request = createRequestWithSession(
        `${sessionName}=${token.slice(0, -1)}X`
      )

      expect(() =>
        Authorization.authorizePlayerRequest(request, TEST_FIXTURES.gameId)
      ).toThrow(
        expect.objectContaining({
          reason: AUTHORIZATION_ERROR_REASON.INVALID_SIGNATURE,
        })
      )
    })
  })
})
