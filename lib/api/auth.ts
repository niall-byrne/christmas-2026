import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import type {
  AuthorizationHeaderOptionProps,
  AuthorizeRequestProps,
  AuthorizedSession,
} from "@/contracts/api"
import {
  AuthorizationError,
  MissingAuthSecretError,
} from "@/lib/api/error/auth"

export class Authorization {
  static readonly SESSION_PREFIX = "game_session_"
  static readonly DEFAULT_MAX_AGE_SECONDS = 86_400

  static responseHeaderFactory(
    gameId: string,
    options: AuthorizationHeaderOptionProps = {}
  ): string {
    const secret = Authorization.getAuthSecret(options.secret)
    const maxAge =
      options.maxAgeSeconds ?? Authorization.DEFAULT_MAX_AGE_SECONDS
    const isSecure =
      options.secure ??
      (process.env.VERCEL_ENV === "production" ||
        process.env.NODE_ENV === "production")

    const cookieName = `${Authorization.SESSION_PREFIX}${gameId}`
    const token = Authorization.encodeToken(gameId, secret)
    const attributes = [
      `${cookieName}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
    ]

    if (isSecure) {
      attributes.push("Secure")
    }

    return attributes.join("; ")
  }

  static authorizeRequest(input: AuthorizeRequestProps): void {
    if (!input.required) {
      return
    }

    const gameId = input.gameId?.trim()
    if (!gameId) {
      throw new Error("gameId is required when authorization is enabled")
    }

    const secret = Authorization.getAuthSecret(input.secret)
    const token = Authorization.readSessionToken(input.request, gameId)
    const session = Authorization.decodeToken(token, secret)

    if (session.gameId !== gameId) {
      throw new AuthorizationError("GAME_ID_MISMATCH")
    }
  }

  protected static getAuthSecret(secret?: string): string {
    const resolved = secret?.trim() || process.env.AUTH_SECRET?.trim()
    if (!resolved) {
      throw new MissingAuthSecretError()
    }
    return resolved
  }

  protected static createCookieSignature(
    encodedPayload: string,
    secret: string
  ): string {
    return createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url")
  }

  protected static encodeToken(gameId: string, secret: string): string {
    const payload: AuthorizedSession = { gameId }
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString("base64url")
    const signature = Authorization.createCookieSignature(
      encodedPayload,
      secret
    )

    return `${encodedPayload}.${signature}`
  }

  protected static decodeToken(
    token: string,
    secret: string
  ): AuthorizedSession {
    const segments = token.split(".")
    if (segments.length !== 2) {
      throw new AuthorizationError("MALFORMED_TOKEN")
    }

    const encodedPayload = segments.at(0)
    const providedSignature = segments.at(1)
    if (!encodedPayload || !providedSignature) {
      throw new AuthorizationError("MALFORMED_TOKEN")
    }

    const expectedSignature = Authorization.createCookieSignature(
      encodedPayload,
      secret
    )
    const providedBuf = Buffer.from(providedSignature, "utf8")
    const expectedBuf = Buffer.from(expectedSignature, "utf8")

    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new AuthorizationError("INVALID_SIGNATURE")
    }

    try {
      const json = Buffer.from(encodedPayload, "base64url").toString("utf8")
      const parsed: unknown = JSON.parse(json)

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { gameId?: unknown }).gameId !== "string" ||
        !(parsed as { gameId: string }).gameId
      ) {
        throw new AuthorizationError("MALFORMED_TOKEN")
      }

      return { gameId: (parsed as { gameId: string }).gameId }
    } catch (err) {
      if (err instanceof AuthorizationError) {
        throw err
      }
      throw new AuthorizationError("MALFORMED_TOKEN")
    }
  }

  protected static readSessionToken(
    request: Pick<Request, "headers">,
    gameId: string
  ): string {
    const cookieHeader = request.headers.get("cookie")
    if (!cookieHeader) {
      throw new AuthorizationError("MISSING_COOKIE")
    }

    const targetName = `${Authorization.SESSION_PREFIX}${gameId}`

    for (const part of cookieHeader.split(";")) {
      const eqIndex = part.indexOf("=")
      if (eqIndex === -1) continue

      const key = part.slice(0, eqIndex).trim()
      if (key === targetName) {
        const value = part.slice(eqIndex + 1).trim()
        if (!value) {
          throw new AuthorizationError("MISSING_COOKIE")
        }
        return value
      }
    }

    throw new AuthorizationError("MISSING_COOKIE")
  }
}
