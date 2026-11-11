---
name: testing-conventions
description: Project conventions for writing and running Vitest unit/component tests and Playwright E2E tests in this Next.js App Router, TypeScript, and Redis codebase.
---

# Testing Conventions

## 1. Runners & Locations

- **Unit & Component Tests (`Vitest`):** Place inside a `tests/` subfolder within the module being tested (e.g., `lib/realtime/tests/*.test.ts` or `components/tests/*.test.tsx`). Run via `npm test`.
- **End-to-End Tests (`Playwright`):** Place in top-level `e2e/*.spec.ts` (configure `testDir: "./e2e"` in `playwright.config.ts`). Run via `npm run test:e2e` (automatically starts and stops the `redis` container if not already running).

## 2. Import & Code Rules

- Always use `@/` TypeScript path aliases for project imports (never relative `../` or `./` imports across folders).
- Import test primitives explicitly from `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`).

## 3. Vitest Rules

- Mock Server Actions under `@/app/actions` with `vi.mock` so unit tests never open live Redis connections.
- Mock `"server-only"` with `vi.mock("server-only", () => ({}))` when unit-testing server-only modules.
- Stub `globalThis.EventSource` via `vi.stubGlobal` in `beforeEach` and wrap simulated SSE messages in React's `act()`.
- Call `vi.restoreAllMocks()` and Testing Library's `cleanup()` in `afterEach`.

## 4. Playwright Rules

- Keep `playwright.config.ts` `webServer.command` set to `npm run dev:next` so Playwright never triggers `npm run dev` container traps.
- Use web-first auto-retrying assertions (`await expect(locator).toBeVisible()`) instead of `page.waitForTimeout()`.

## 5. Workflow

1. Inspect `git status` and `git diff` for new or modified code.
2. Write or update tests in `<module>/tests/*.test.ts(x)` covering valid behavior, Zod schema edge cases, and error states.
3. Run `npm test` (and `npm run test:e2e` when Server Actions, API routes, or SSE flows change) until green.
