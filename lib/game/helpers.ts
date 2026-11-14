import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { redisLookupKey } from "@/lib/game/redisLookupKey"

export function createPasswordSalt(byteLength = 16): string {
  return randomBytes(byteLength).toString("hex")
}

export function createGameId(): string {
  return randomBytes(12).toString("hex")
}

export function createEntityId(): string {
  return randomBytes(12).toString("hex")
}

export function normalizeGameText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeLookupKey(value: string): string {
  return redisLookupKey(value)
}

export function hashPassword(password: string, salt: string): string {
  const derived = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${derived}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, encodedHash] = storedHash.split(":")
  if (!salt || !encodedHash) {
    return false
  }

  const expected = Buffer.from(encodedHash, "hex")
  const computed = Buffer.from(
    scryptSync(password, salt, 64).toString("hex"),
    "hex"
  )

  if (expected.length !== computed.length) {
    return false
  }

  return timingSafeEqual(expected, computed)
}

export function serializeCardEntry(
  recipient: string,
  identifier: string
): string {
  return JSON.stringify({
    recipient: normalizeGameText(recipient),
    identifier: normalizeGameText(identifier),
  })
}
