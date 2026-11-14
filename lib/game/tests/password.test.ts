import { beforeEach, describe, expect, it } from "vitest"
import { gamePasswords } from "@/lib/game/password"

describe("game passwords", () => {
  const TEST_FIXTURES = {
    password: "correct horse battery staple",
    wrongPassword: "incorrect password",
    salt: "test-salt",
    malformedHash: "not-a-valid-password-hash",
  }

  describe("when createPasswordSalt is called", () => {
    let salt: string

    beforeEach(() => {
      salt = gamePasswords.createSalt()
    })

    it("returns 16 bytes encoded as 32 hexadecimal characters", () => {
      expect(salt).toMatch(/^[a-f0-9]{32}$/)
    })
  })

  describe("when hashPassword is called", () => {
    let passwordHash: string

    beforeEach(() => {
      passwordHash = gamePasswords.hash(
        TEST_FIXTURES.password,
        TEST_FIXTURES.salt
      )
    })

    it("returns the salt and derived hash in the stored format", () => {
      expect(passwordHash).toMatch(
        new RegExp(`^${TEST_FIXTURES.salt}:[a-f0-9]{128}$`)
      )
    })

    describe("when verifyPassword is called with the matching password", () => {
      let isVerified: boolean

      beforeEach(() => {
        isVerified = gamePasswords.verify(TEST_FIXTURES.password, passwordHash)
      })

      it("returns true", () => {
        expect(isVerified).toBe(true)
      })
    })

    describe("when verifyPassword is called with a different password", () => {
      let isVerified: boolean

      beforeEach(() => {
        isVerified = gamePasswords.verify(
          TEST_FIXTURES.wrongPassword,
          passwordHash
        )
      })

      it("returns false", () => {
        expect(isVerified).toBe(false)
      })
    })
  })

  describe("when verifyPassword is called with a malformed stored hash", () => {
    let isVerified: boolean

    beforeEach(() => {
      isVerified = gamePasswords.verify(
        TEST_FIXTURES.password,
        TEST_FIXTURES.malformedHash
      )
    })

    it("returns false", () => {
      expect(isVerified).toBe(false)
    })
  })
})
