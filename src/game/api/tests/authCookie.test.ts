// @vitest-environment node

import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AUTHORIZATION_ERROR_REASON } from "@/contracts/game/api/auth"
import { AuthCookie } from "@/game/api/authCookie"

describe("AuthCookie", () => {
  const TEST_FIXTURES = {
    cookieName: "game_session_a1b2c3d4e5f6g7h8i9j0k1l2",
    secret: "cookie-test-signing-secret",
    payload: { gameId: "a1b2c3d4e5f6g7h8i9j0k1l2" },
    maxAgeSeconds: 600,
    token: "encoded-payload.signature",
  } as const

  function signPayload(payload: string): string {
    const encodedPayload = Buffer.from(payload, "utf8").toString("base64url")
    const signature = createHmac("sha256", TEST_FIXTURES.secret)
      .update(encodedPayload)
      .digest("base64url")
    return `${encodedPayload}.${signature}`
  }

  function createRequest(cookie?: string): Request {
    return new Request("http://localhost/api", {
      headers: cookie === undefined ? undefined : { cookie },
    })
  }

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("VERCEL_ENV", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe("responseHeader", () => {
    describe("when explicit cookie options are provided", () => {
      let header: string

      beforeEach(() => {
        header = AuthCookie.responseHeader(
          TEST_FIXTURES.cookieName,
          TEST_FIXTURES.payload,
          86_400,
          {
            maxAgeSeconds: TEST_FIXTURES.maxAgeSeconds,
            secure: true,
          },
          TEST_FIXTURES.secret
        )
      })

      it("uses the supplied lifetime and secure attribute", () => {
        expect(header).toContain(`${TEST_FIXTURES.cookieName}=`)
        expect(header).toContain(`Max-Age=${TEST_FIXTURES.maxAgeSeconds}`)
        expect(header).toContain("; Secure")
      })

      it("sets a signed payload and standard cookie protections", () => {
        const [cookiePair, ...attributes] = header.split("; ")
        const token = cookiePair?.slice(cookiePair.indexOf("=") + 1)

        expect(token).toBeDefined()
        expect(
          AuthCookie.decodePayload(token ?? "", TEST_FIXTURES.secret)
        ).toEqual(TEST_FIXTURES.payload)
        expect(attributes).toEqual(
          expect.arrayContaining(["Path=/", "HttpOnly", "SameSite=Lax"])
        )
      })
    })

    describe("when secure is not specified in development", () => {
      let header: string

      beforeEach(() => {
        header = AuthCookie.responseHeader(
          TEST_FIXTURES.cookieName,
          TEST_FIXTURES.payload,
          TEST_FIXTURES.maxAgeSeconds,
          {},
          TEST_FIXTURES.secret
        )
      })

      it("does not append Secure", () => {
        expect(header).not.toContain("Secure")
      })
    })

    describe("when Vercel reports production", () => {
      let header: string

      beforeEach(() => {
        vi.stubEnv("VERCEL_ENV", "production")
        header = AuthCookie.responseHeader(
          TEST_FIXTURES.cookieName,
          TEST_FIXTURES.payload,
          TEST_FIXTURES.maxAgeSeconds,
          {},
          TEST_FIXTURES.secret
        )
      })

      it("appends Secure", () => {
        expect(header).toContain("; Secure")
      })
    })
  })

  describe("readToken", () => {
    describe("when the named cookie is present among other cookies", () => {
      let token: string

      beforeEach(() => {
        token = AuthCookie.readToken(
          createRequest(
            `theme=dark; ${TEST_FIXTURES.cookieName}=${TEST_FIXTURES.token}; analytics=1`
          ),
          TEST_FIXTURES.cookieName
        )
      })

      it("returns the requested cookie value", () => {
        expect(token).toBe(TEST_FIXTURES.token)
      })
    })

    describe("when the token value contains equals signs", () => {
      let token: string

      beforeEach(() => {
        token = AuthCookie.readToken(
          createRequest(`${TEST_FIXTURES.cookieName}=value=with=equals`),
          TEST_FIXTURES.cookieName
        )
      })

      it("preserves the full cookie value", () => {
        expect(token).toBe("value=with=equals")
      })
    })

    describe.each([
      ["no cookie header", undefined],
      ["an unrelated cookie", "theme=dark"],
      ["an empty matching cookie", `${TEST_FIXTURES.cookieName}=`],
    ])("when the request has %s", (_scenario, cookie) => {
      let readToken: () => string

      beforeEach(() => {
        readToken = () =>
          AuthCookie.readToken(createRequest(cookie), TEST_FIXTURES.cookieName)
      })

      it("throws MISSING_COOKIE", () => {
        expect(readToken).toThrow(
          expect.objectContaining({
            reason: AUTHORIZATION_ERROR_REASON.MISSING_COOKIE,
          })
        )
      })
    })
  })

  describe("decodePayload", () => {
    describe("when the token has a valid signature", () => {
      let payload: unknown

      beforeEach(() => {
        payload = AuthCookie.decodePayload(
          signPayload(JSON.stringify(TEST_FIXTURES.payload)),
          TEST_FIXTURES.secret
        )
      })

      it("returns the decoded JSON payload", () => {
        expect(payload).toEqual(TEST_FIXTURES.payload)
      })
    })

    describe.each([
      ["no signature separator", "not-a-token"],
      ["an extra token segment", "payload.signature.extra"],
      ["an empty payload segment", ".signature"],
      ["an empty signature segment", "payload."],
    ])("when the token has %s", (_scenario, token) => {
      let decodePayload: () => unknown

      beforeEach(() => {
        decodePayload = () =>
          AuthCookie.decodePayload(token, TEST_FIXTURES.secret)
      })

      it("throws MALFORMED_TOKEN", () => {
        expect(decodePayload).toThrow(
          expect.objectContaining({
            reason: AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN,
          })
        )
      })
    })

    describe("when the token signature does not match the payload", () => {
      let decode: () => unknown

      beforeEach(() => {
        const token = signPayload(JSON.stringify(TEST_FIXTURES.payload))
        const [payload] = token.split(".")
        decode = () =>
          AuthCookie.decodePayload(`${payload}.invalid`, TEST_FIXTURES.secret)
      })

      it("throws INVALID_SIGNATURE", () => {
        expect(decode).toThrow(
          expect.objectContaining({
            reason: AUTHORIZATION_ERROR_REASON.INVALID_SIGNATURE,
          })
        )
      })
    })

    describe("when a signed payload is not valid JSON", () => {
      let decode: () => unknown

      beforeEach(() => {
        decode = () =>
          AuthCookie.decodePayload(signPayload("{"), TEST_FIXTURES.secret)
      })

      it("throws MALFORMED_TOKEN", () => {
        expect(decode).toThrow(
          expect.objectContaining({
            reason: AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN,
          })
        )
      })
    })
  })
})
