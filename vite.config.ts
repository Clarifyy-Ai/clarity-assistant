import { fileURLToPath } from "url";
import fs from "node:fs";
import path from "node:path";
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
      ...(isElectron
        ? [{
            name: "electron-html-csp",
            transformIndexHtml(html: string) {
              // upgrade-insecure-requests breaks file:// asset loads in packaged Electron.
              return html.replace(/\s*upgrade-insecure-requests;?/g, "");
            },
          }]
        : []),
      ...(sentryConfigured
        ? [sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            sourcemaps: { assets: "./dist/**" },
            telemetry: false,
          })]
        : []),
      ...(!isProduction && !isElectron
        ? [{
            name: "agent-debug-ingest",
            configureServer(server) {
              server.middlewares.use("/__agent_debug", (req, res, next) => {
                if (req.method !== "POST") {
                  next();
                  return;
                }
                const chunks: Buffer[] = [];
                req.on("data", (c) => chunks.push(Buffer.from(c)));
                req.on("end", () => {
                  try {
                    const line = Buffer.concat(chunks).toString("utf8").trim();
                    if (line) {
                      fs.appendFileSync(
                        path.join(__dirname, "debug-c458b1.log"),
                        `${line}\n`,
                        "utf8",
                      );
                    }
                    res.statusCode = 204;
                    res.end();
                  } catch (err) {
                    res.statusCode = 500;
                    res.end(String(err));
                  }
                });
              });
            },
          }, {
            name: "local-desktop-installer",
            configureServer(server) {
              server.middlewares.use("/dev-downloads/clarify-ai-setup.exe", (_req, res, next) => {
                const candidates = [
                  path.join(__dirname, "release-new", "Clarify AI Setup 1.0.0.exe"),
                  path.join(__dirname, "release", "Clarify AI Setup 1.0.0.exe"),
                ];
                for (const dir of ["release-new", "release"]) {
                  const folder = path.join(__dirname, dir);
                  if (!fs.existsSync(folder)) continue;
                  const match = fs.readdirSync(folder).find((f) => f.endsWith(".exe") && /setup/i.test(f));
                  if (match) candidates.unshift(path.join(folder, match));
                }
                const file = candidates.find((p) => fs.existsSync(p));
                if (!file) {
                  res.statusCode = 404;
                  res.end("Build the installer first: npm run dist:win");
                  return;
                }
                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Content-Disposition", 'attachment; filename="Clarify-AI-Setup.exe"');
                fs.createReadStream(file).pipe(res);
              });
            },
          }]
        : []),
    ],

    // Electron needs relative asset URLs for file://. Web SPA needs absolute
    // base so nested routes (/app/live) do not resolve favicons/assets as
    // /app/live/favicon.svg.
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
          manualChunks(id) {
            // ── Vendor splits ──────────────────────────────────────────
            if (["react", "react-dom", "react-router-dom"].some((p) => id.includes(`/node_modules/${p}/`)))
              return "vendor-react";
            if (
              [
                "@radix-ui/react-dialog",
                "@radix-ui/react-dropdown-menu",
                "@radix-ui/react-tabs",
                "@radix-ui/react-toast",
                "framer-motion",
                "lucide-react",
              ].some((p) => id.includes(`/node_modules/${p}/`))
            )
              return "vendor-ui";
            if (id.includes("/node_modules/recharts/")) return "vendor-charts";
            if (id.includes("/node_modules/@supabase/")) return "vendor-supabase";
            if (id.includes("/node_modules/@tanstack/")) return "vendor-query";
            if (
              id.includes("/node_modules/react-hook-form/") ||
              id.includes("/node_modules/zod/")
            )
              return "vendor-form";
            if (id.includes("/node_modules/zustand/")) return "vendor-state";
            if (id.includes("/node_modules/@deepgram/")) return "vendor-audio";

            // ── App splits ─────────────────────────────────────────────
            if (id.includes("/src/store/")) return "chunk-stores";
            if (id.includes("/src/lib/billing/")) return "chunk-billing";
            if (
              id.includes("/src/lib/ai/") ||
              id.includes("/src/lib/network/")
            )
              return "chunk-network";
            if (
              id.includes("/src/pages/app/live/LiveOverlay") ||
              id.includes("/src/components/overlay/")
            )
              return "chunk-overlay";
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
