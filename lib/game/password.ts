import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

function createPasswordSalt(byteLength = 16): string {
  return randomBytes(byteLength).toString("hex")
}

function derivePasswordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex")
}

function hashPassword(password: string, salt: string): string {
  return `${salt}:${derivePasswordHash(password, salt)}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, encodedHash] = storedHash.split(":")
  if (!salt || !encodedHash) {
    return false
  }

  const expected = Buffer.from(encodedHash, "hex")
  const computed = Buffer.from(derivePasswordHash(password, salt), "hex")

  if (expected.length !== computed.length) {
    return false
  }

  return timingSafeEqual(expected, computed)
}

export const gamePasswords = {
  createSalt: createPasswordSalt,
  hash: hashPassword,
  verify: verifyPassword,
} as const
