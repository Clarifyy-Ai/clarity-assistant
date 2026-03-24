import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isElectron = process.env.BUILD_TARGET === "electron";

  const plugins = [react()];

  if (mode === "production" && env.SENTRY_ORG && env.SENTRY_PROJECT && env.SENTRY_AUTH_TOKEN) {
    import("@sentry/vite-plugin").then(({ sentryVitePlugin }) => {
      plugins.push(
        sentryVitePlugin({
          org:        env.SENTRY_ORG,
          project:    env.SENTRY_PROJECT,
          authToken:  env.SENTRY_AUTH_TOKEN,
          sourcemaps: { assets: "./dist/**" },
          telemetry:  false,
        }) as never
      );
    });
  }

  return {
    plugins,

    // ★ ADDED: "./" for Electron file:// paths, "/" for web/Lovable
    base: isElectron ? "./" : "/",

    resolve: {
      alias: {
        "@": `${__dirname}src`,
      },
    },

    build: {
      sourcemap: true,
      outDir:    "dist",
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
      // ★ CHANGED: 5173 for Electron dev (main.cjs expects this port)
      port: isElectron ? 5173 : 5000,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/functions/v1": {
          target:       env.VITE_SUPABASE_URL || "https://qzgvjrvtkwlzxpmlddkx.supabase.co",
          changeOrigin: true,
          rewrite:      (p) => p.replace(/^\/functions\/v1/, "/functions/v1"),
        },
      },
    },

    preview: {
      port: 5000,
      host: "0.0.0.0",
    },

    test: {
      globals:     true,
      environment: "jsdom",
      setupFiles:  ["./src/test/setup.ts"],
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
