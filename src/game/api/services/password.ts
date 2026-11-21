import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

function createPasswordSalt(byteLength = 16): string {
  return randomBytes(byteLength).toString("hex")
}

async function derivePasswordHash(
  password: string,
  salt: string
): Promise<string> {
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
  return derivedKey.toString("hex")
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return `${salt}:${await derivePasswordHash(password, salt)}`
}

async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [salt, encodedHash] = storedHash.split(":")
  if (!salt || !encodedHash) {
    return false
  }

  const expected = Buffer.from(encodedHash, "hex")
  const computed = Buffer.from(await derivePasswordHash(password, salt), "hex")

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
