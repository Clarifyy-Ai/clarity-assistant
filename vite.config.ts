import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isElectron = process.env.BUILD_TARGET === "electron";
  const isProduction = mode === "production";

  const sentryAuthToken = env.SENTRY_AUTH_TOKEN?.trim();
  const sentryConfigured =
    isProduction &&
    env.SENTRY_ORG &&
    env.SENTRY_PROJECT &&
    sentryAuthToken &&
    !sentryAuthToken.includes("your-sentry") &&
    sentryAuthToken !== "your-sentry-auth-token";

  return {
    plugins: [
      react(),
      ...(sentryConfigured
        ? [sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            sourcemaps: { assets: "./dist/**" },
            telemetry: false,
          })]
        : []),
    ],

    base: isElectron ? "./" : "/",

    // Silence verbose console.log / console.debug calls in production builds.
    // console.error and console.warn are kept intact (Sentry breadcrumbs).
    ...(isProduction && {
      esbuild: {
        pure: ["console.log", "console.debug"],
      },
    }),

    resolve: {
      alias: {
        "@": `${__dirname}src`,
      },
    },

    build: {
      // 🔴 FIXED: No source maps in production
      sourcemap: !isProduction,
      outDir: "dist",

      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-ui": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tabs",
              "@radix-ui/react-toast",
              "framer-motion",
              "lucide-react",
            ],
            "vendor-charts": ["recharts"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "vendor-query": ["@tanstack/react-query"],
            "vendor-form": ["react-hook-form", "zod"],
            "vendor-state": ["zustand"],
            "vendor-audio": ["@deepgram/sdk"],
          },
        },
      },

      chunkSizeWarningLimit: 600,
    },

    server: {
      port: isElectron ? 5173 : 5000,

      // 🔐 FIXED: Secure host binding
      host: "127.0.0.1",

      // 🔐 FIXED: Restrict allowed hosts
      allowedHosts: ["localhost", "127.0.0.1"],

      // 🔐 ADDED: Security headers
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      },

      proxy: {
        "/functions/v1": {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/functions\/v1/, "/functions/v1"),
        },
      },
    },

    preview: {
      port: 5000,

      // 🔐 FIXED: Prevent exposure
      host: "127.0.0.1",
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
