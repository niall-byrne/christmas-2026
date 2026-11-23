import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import {
  AUTHORIZATION_ERROR_REASON,
  type AuthorizationHeaderOptionProps,
} from "@/contracts/game/api"
import { AuthorizationError } from "@/game/api/error/auth"

export class AuthCookie {
  static responseHeader(
    cookieName: string,
    payload: object,
    defaultMaxAgeSeconds: number,
    options: AuthorizationHeaderOptionProps,
    secret: string
  ): string {
    const token = AuthCookie.encode(payload, secret)
    const maxAge = options.maxAgeSeconds ?? defaultMaxAgeSeconds
    const secure =
      options.secure ??
      (process.env.VERCEL_ENV === "production" ||
        process.env.NODE_ENV === "production")
    const attributes = [
      `${cookieName}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
    ]

    if (secure) attributes.push("Secure")
    return attributes.join("; ")
  }

  static readToken(
    request: Pick<Request, "headers">,
    cookieName: string
  ): string {
    const cookieHeader = request.headers.get("cookie")
    if (!cookieHeader) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.MISSING_COOKIE)
    }

    for (const part of cookieHeader.split(";")) {
      const equalsIndex = part.indexOf("=")
      if (equalsIndex === -1) continue

      const name = part.slice(0, equalsIndex).trim()
      if (name === cookieName) {
        const token = part.slice(equalsIndex + 1).trim()
        if (!token) {
          throw new AuthorizationError(
            AUTHORIZATION_ERROR_REASON.MISSING_COOKIE
          )
        }
        return token
      }
    }

    throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.MISSING_COOKIE)
  }

  static decodePayload(token: string, secret: string): unknown {
    const [encodedPayload, providedSignature, ...extraSegments] =
      token.split(".")
    if (!encodedPayload || !providedSignature || extraSegments.length > 0) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN)
    }

    const expectedSignature = AuthCookie.createSignature(encodedPayload, secret)
    const providedBuffer = Buffer.from(providedSignature, "utf8")
    const expectedBuffer = Buffer.from(expectedSignature, "utf8")
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.INVALID_SIGNATURE)
    }

    try {
      return JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8")
      )
    } catch {
      throw new AuthorizationError(AUTHORIZATION_ERROR_REASON.MALFORMED_TOKEN)
    }
  }

  private static encode(payload: object, secret: string): string {
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString("base64url")
    return `${encodedPayload}.${AuthCookie.createSignature(encodedPayload, secret)}`
  }

  private static createSignature(
    encodedPayload: string,
    secret: string
  ): string {
    return createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url")
  }
}
