---
name: testing-conventions
description: Project conventions for writing and running Vitest unit/component tests and Playwright E2E tests in this Next.js App Router, TypeScript, and Redis codebase.
---

# Testing Conventions

## 1. Runners & Locations

- **Unit & Component Tests (`Vitest`):** Place inside a `tests/` subfolder colocated within the module being tested (`<module>/tests/*.test.ts` or `<module>/tests/*.test.tsx`). Run via `npm test`.
- **End-to-End Tests (`Playwright`):** Place in top-level `e2e/*.spec.ts` (matching `testDir` in `playwright.config.ts`). Run via `npm run test:e2e` (automatically starts and stops the `redis` container if not already running).

## 2. Import & Code Rules

- Always use `@/` TypeScript path aliases for project imports (never relative `../` or `./` imports across folders).
- Import test primitives explicitly from `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`).
- Add `// @vitest-environment node` at the top of server-only, API route, or Redis test suites.

## 3. Vitest Rules

- Mock Server Actions with `vi.mock` so unit tests never open live Redis connections.
- Mock `"server-only"` via `vitest.setup.ts` (`vi.mock("server-only", () => ({}))`) when unit-testing server-only modules.
- Stub browser globals like `EventSource` via `vi.stubGlobal` and wrap simulated SSE messages in React's `act()`.
- Reset mocked instances, `globalThis` singletons, environment stubs (`vi.unstubAllEnvs()`), and spies (`vi.restoreAllMocks()`) plus Testing Library's `cleanup()` in `afterEach`.

## 4. Universal Testing Standards (Zero-Slop Principle)

- **Centralized Fixtures:** Define a `TEST_FIXTURES` constant object at the top of root `describe` blocks for shared test inputs and expected values.
- **Isolated State & Scenario Contexts:** Group tests by distinct input states, branch conditions, or scenarios using dedicated `describe` blocks.
- **Encapsulated Setup Helpers:** Use parameterized setup helper functions or factory utilities rather than scattering setup logic inline across tests.
- **BeforeEach Initialization:** Assign render outputs, parsed objects, or test subjects directly inside scenario-specific `beforeEach` blocks to eliminate inline repetition.
- **Global Teardown:** Place global DOM, timer, singleton, and storage cleanups (`localStorage.clear()`, `document.documentElement.classList.remove(...)`, `globalThis.redisClient = undefined`, `vi.restoreAllMocks()`) in root-level `afterEach` hooks to prevent side-effect leakage across any test suite.

## 5. Playwright Rules

- Keep `playwright.config.ts` `webServer.command` set to `npm run dev:next` so Playwright never triggers `npm run dev` container traps.
- Use web-first auto-retrying assertions (`await expect(locator).toBeVisible()`) instead of `page.waitForTimeout()`.

## 6. Workflow

1. Inspect `git status` and `git diff` for new or modified code.
2. Write or update tests in `<module>/tests/*.test.ts(x)` covering valid behavior, edge cases, and error states following the Zero-Slop Principle.
3. Run `npm test` (and `npm run test:e2e` when Server Actions, API routes, or SSE flows change) until green.
