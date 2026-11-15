export const TEST_FIXTURES = {
  game: {
    name: "Playwright API game",
    password: "e2e-game-password",
    bonusCard: "Test bonus card",
    cards: [
      { recipient: "Alice", identifier: "card-alice" },
      { recipient: "Bob", identifier: "card-bob" },
    ],
  },
  team: { name: "Reindeer", color: "#AABBCC" },
  player: { name: "Alice" },
  redis: {
    invalidRevision: "invalid-revision",
    wrongTypeValue: "not-a-set",
  },
}
