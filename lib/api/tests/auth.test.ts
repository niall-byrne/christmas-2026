// @vitest-environment node

import { createHmac } from "node:crypto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AuthorizationErrorReason } from "@/contracts/api"
import { Authorization } from "@/lib/api/auth"
import {
  AuthorizationError,
  MissingAuthSecretError,
} from "@/lib/api/error/auth"

describe("Authorization", () => {
  const GAME_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"
  const OTHER_GAME_ID = "z9y8x7w6v5u4t3s2r1q0p9o8"

  const TEST_FIXTURES = {
    secret: "super-secret-signing-key-for-tests-2026",
    altSecret: "different-signing-key-for-tamper-tests",
    gameId: GAME_ID,
    otherGameId: OTHER_GAME_ID,
    cookieName: `${Authorization.SESSION_PREFIX}${GAME_ID}`,
    cookiePrefix: `${Authorization.SESSION_PREFIX}${GAME_ID}=`,
    gamesUrl: "http://localhost:3000/api/games",
    customMaxAge: 3600,
  } as const

  function extractCookiePair(setCookieHeader: string): string {
    const firstSegment = setCookieHeader.split(";").at(0)
    expect(firstSegment).toBeDefined()
    return firstSegment as string
  }

  function issueCookieToken(
    gameId: string = TEST_FIXTURES.gameId,
    secret: string = TEST_FIXTURES.secret
  ): string {
    const header = Authorization.responseHeaderFactory(gameId, { secret })
    const pair = extractCookiePair(header)
    const eqIndex = pair.indexOf("=")
    return pair.slice(eqIndex + 1)
  }

  function signRawPayload(encodedPayload: string): string {
    const signature = createHmac("sha256", TEST_FIXTURES.secret)
      .update(encodedPayload)
      .digest("base64url")
    return `${encodedPayload}.${signature}`
  }

  function createRequestWithCookie(cookieHeader?: string): Request {
    return new Request(TEST_FIXTURES.gamesUrl, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
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

      it("formats an HttpOnly SameSite=Lax cookie with 24h Max-Age and no Secure flag", () => {
        expect(header.startsWith(TEST_FIXTURES.cookiePrefix)).toBe(true)
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
        request = createRequestWithCookie(extractCookiePair(header))
      })

      it("applies custom maxAgeSeconds, secure flag, and signing secret", () => {
        expect(header).toContain(`Max-Age=${TEST_FIXTURES.customMaxAge}`)
        expect(header).toContain("; Secure")
        expect(() =>
          Authorization.authorizeRequest({
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

  describe("authorizeRequest", () => {
    describe("when required is false or omitted", () => {
      beforeEach(() => {
        vi.stubEnv("AUTH_SECRET", "")
      })

      it("returns without throwing even when headers, gameId, and AUTH_SECRET are absent", () => {
        expect(() =>
          Authorization.authorizeRequest({
            request: createRequestWithCookie(),
            required: false,
          })
        ).not.toThrow()

        expect(() =>
          Authorization.authorizeRequest({
            request: createRequestWithCookie(),
          })
        ).not.toThrow()
      })
    })

    describe("when request carries a valid signed session cookie", () => {
      let request: Request

      beforeEach(() => {
        const setCookie = Authorization.responseHeaderFactory(
          TEST_FIXTURES.gameId
        )
        const sessionPair = extractCookiePair(setCookie)
        request = createRequestWithCookie(
          `theme=dark; ${sessionPair}; analytics=1`
        )
      })

      it("authorizes the request without throwing", () => {
        expect(() =>
          Authorization.authorizeRequest({
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
        buildCookie: () => string | undefined
        expectedReason: AuthorizationErrorReason
      }

      const INVALID_AUTH_CASES: InvalidAuthCase[] = [
        {
          label: "missing Cookie header",
          buildCookie: () => undefined,
          expectedReason: "MISSING_COOKIE",
        },
        {
          label: "cookie header with only unrelated cookies",
          buildCookie: () => "theme=dark; sidebar=open",
          expectedReason: "MISSING_COOKIE",
        },
        {
          label: "cookie with empty value",
          buildCookie: () => `${TEST_FIXTURES.cookieName}=`,
          expectedReason: "MISSING_COOKIE",
        },
        {
          label: "cookie belonging to a different gameId",
          buildCookie: () =>
            extractCookiePair(
              Authorization.responseHeaderFactory(TEST_FIXTURES.otherGameId)
            ),
          expectedReason: "MISSING_COOKIE",
        },
        {
          label: "token missing dot separator",
          buildCookie: () => `${TEST_FIXTURES.cookieName}=not-a-dotted-token`,
          expectedReason: "MALFORMED_TOKEN",
        },
        {
          label: "token with extra dot segments",
          buildCookie: () => `${TEST_FIXTURES.cookieName}=part1.part2.part3`,
          expectedReason: "MALFORMED_TOKEN",
        },
        {
          label: "token with invalid base64url JSON payload",
          buildCookie: () =>
            `${TEST_FIXTURES.cookieName}=${signRawPayload("invalid-base64")}`,
          expectedReason: "MALFORMED_TOKEN",
        },
        {
          label: "token with JSON payload missing gameId",
          buildCookie: () => {
            const emptyPayload = Buffer.from(
              JSON.stringify({}),
              "utf8"
            ).toString("base64url")
            return `${TEST_FIXTURES.cookieName}=${signRawPayload(emptyPayload)}`
          },
          expectedReason: "MALFORMED_TOKEN",
        },
        {
          label: "token signed with a different secret",
          buildCookie: () =>
            `${TEST_FIXTURES.cookieName}=${issueCookieToken(
              TEST_FIXTURES.gameId,
              TEST_FIXTURES.altSecret
            )}`,
          expectedReason: "INVALID_SIGNATURE",
        },
        {
          label: "token with a tampered signature",
          buildCookie: () => {
            const tampered = `${issueCookieToken(TEST_FIXTURES.gameId).slice(0, -1)}X`
            return `${TEST_FIXTURES.cookieName}=${tampered}`
          },
          expectedReason: "INVALID_SIGNATURE",
        },
        {
          label: "valid token for another game copied into target game cookie",
          buildCookie: () =>
            `${TEST_FIXTURES.cookieName}=${issueCookieToken(
              TEST_FIXTURES.otherGameId
            )}`,
          expectedReason: "GAME_ID_MISMATCH",
        },
      ]

      describe.each(INVALID_AUTH_CASES)(
        "given $label",
        ({ buildCookie, expectedReason }) => {
          let thrown: unknown

          beforeEach(() => {
            thrown = captureThrownError(() =>
              Authorization.authorizeRequest({
                request: createRequestWithCookie(buildCookie()),
                gameId: TEST_FIXTURES.gameId,
                required: true,
              })
            )
          })

          it("throws AuthorizationError with the expected reason and 401 status", () => {
            expect(thrown).toBeInstanceOf(AuthorizationError)
            expect(thrown).toMatchObject({
              code: "UNAUTHORIZED",
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
            Authorization.authorizeRequest({
              request: createRequestWithCookie(),
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
            Authorization.authorizeRequest({
              request: createRequestWithCookie(),
              gameId,
              required: true,
            })
          )
        })

        it("throws an Error indicating gameId is required", () => {
          expect(thrown).toBeInstanceOf(Error)
          expect((thrown as Error).message).toBe(
            "gameId is required when authorization is enabled"
          )
        })
      })
    })
  })
})
