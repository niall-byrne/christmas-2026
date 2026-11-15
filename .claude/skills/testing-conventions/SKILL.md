---
name: testing-conventions
description: Project conventions for writing and running Vitest unit/component tests and Playwright E2E tests in this Next.js App Router, TypeScript, and Redis codebase.
---

# Testing Conventions

## 1. Runners & Locations

- **Unit & Component Tests (`Vitest`):** Place inside a `tests/` subfolder colocated within the module being tested (`<module>/tests/*.test.ts` or `<module>/tests/*.test.tsx`). Run via `npm test`.
- **End-to-End Tests (`Playwright`):** Place under the configured `e2e/` test directory, including endpoint-specific subdirectories. Run via `npm run test:e2e` (automatically starts and stops the `redis` container if not already running).

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
- **One behavior per test:** Keep each `it`/`test` focused on one behavior and its result. Do not combine independent rejection cases into one test or use conjunctions to bundle separate behaviors in a test title. Split those cases into separate tests, grouped by the relevant scenario.
- **Describe concrete behavior:** Use names that tell a reader what state or operation is involved. Avoid vague terms such as "preflight", "boundary", or "failure" without naming the checked condition and affected behavior.
- **Organize around observable behavior:** Group tests by the behavior and public boundary they verify, not by internal implementation details. For API E2E tests, group by endpoint and request scenario rather than Lua script or Redis helper. Name and organize tests that exercise a workflow across multiple endpoints as integration tests.
- **Organize by the behavior's public surface:** Keep tests for one public surface together, including its success, failure, and edge-case scenarios. Do not group otherwise separate behaviors only because they share an internal mechanism. When a behavior genuinely spans multiple public surfaces, name and organize it as an integration workflow.
- **Reuse project builders:** Use shared fixtures and existing route/key builders instead of duplicating their formats or relying on incidental ordering.
- **Isolated State & Scenario Contexts:** Group tests by distinct input states, branch conditions, or scenarios using dedicated `describe` blocks.
- **Encapsulated Setup Helpers:** Use parameterized setup helper functions or factories when they reduce repeated setup without hiding the behavior under test.
- **Use `beforeEach` for shared Arrange and Act:** When tests share a scenario, use `beforeEach` to initialize the state and perform the action under test; keep each test focused on its assertions. If the action differs by test, perform it in that test. Use `afterEach` for resource cleanup. Avoid `try`/`finally` solely to dispose test resources, and do not add hooks for trivial one-off setup.
- **Global Teardown:** Place global DOM, timer, singleton, and storage cleanups (`localStorage.clear()`, `document.documentElement.classList.remove(...)`, `globalThis.redisClient = undefined`, `vi.restoreAllMocks()`) in root-level `afterEach` hooks to prevent side-effect leakage across any test suite.

## 5. Playwright Rules

- Keep `playwright.config.ts` `webServer.command` set to `npm run dev:next` so Playwright never triggers `npm run dev` container traps.
- Use web-first auto-retrying assertions (`await expect(locator).toBeVisible()`) instead of `page.waitForTimeout()`.

## 6. Workflow

1. Inspect `git status` and `git diff` for new or modified code.
2. Write or update Vitest tests in `<module>/tests/*.test.ts(x)` and Playwright tests under `e2e/`, covering valid behavior, edge cases, and error states following the Zero-Slop Principle.
3. Run `npm test` and, when API routes or SSE flows change, `npm run test:e2e` until green.
