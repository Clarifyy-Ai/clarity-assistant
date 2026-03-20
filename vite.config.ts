import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// __dirname is not available in ESM ("type": "module" in package.json)
// This polyfill is required or Vite will throw a ReferenceError
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      // Sentry source maps — only in production builds
      mode === "production" &&
        sentryVitePlugin({
          org: env.SENTRY_ORG,
          project: env.SENTRY_PROJECT,
          authToken: env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            assets: "./dist/**",
          },
          telemetry: false,
        }),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": `${__dirname}src`,
      },
    },

    build: {
      sourcemap: true, // Required for Sentry
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react":    ["react", "react-dom", "react-router-dom"],
            "vendor-ui": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tabs",
              "@radix-ui/react-toast",
              "framer-motion",
              "lucide-react",
            ],
            "vendor-charts":   ["recharts"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "vendor-query":    ["@tanstack/react-query"],
            "vendor-form":     ["react-hook-form", "zod"],
            "vendor-state":    ["zustand"],
            "vendor-audio":    ["@deepgram/sdk"],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },

    server: {
      port: 8080,
      host: true,
      proxy: {
        "/functions/v1": {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          // rewrite is a no-op here — kept for future path remapping
          rewrite: (p) => p.replace(/^\/functions\/v1/, "/functions/v1"),
        },
      },
    },

    preview: {
      port: 8080,
    },

    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov", "html"],
        exclude: [
          "node_modules/",
          "src/test/",
          "src/types/",
          "**/*.d.ts",
          "**/*.config.*",
        ],
      },
    },

    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@supabase/supabase-js",
        "zustand",
        "@tanstack/react-query",
      ],
    },
  };
});
