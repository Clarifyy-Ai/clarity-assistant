// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Test environment
    environment: "jsdom",
    globals: true,

    // Project setup (polyfills, mocks, custom matchers)
    setupFiles: ["./src/test/setup.ts"],

    // Only match test files; avoids pulling app code accidentally
    include: ["src/**/*.{test,spec}.{ts,tsx}"],

    // Improve debugging & stability
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,

    // Coverage (uses @vitest/coverage-v8)
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      exclude: [
        "src/test/**",
        "src/**/index.ts",
        "src/**/index.tsx",
        "**/*.d.ts",
      ],
    },
  },
});
