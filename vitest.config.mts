import { configDefaults, defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react-swc"

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [...configDefaults.include, "**/*.integration.test.ts"],
    exclude: [...configDefaults.exclude, "src/e2e/**"],
  },
})
