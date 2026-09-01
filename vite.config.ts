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
            name: "local-desktop-installer",
            configureServer(server) {
              // Same-origin debug NDJSON sink (CSP-safe) for session 161d95.
              server.middlewares.use("/__agent_debug_161d95", (req, res, next) => {
                if (req.method !== "POST") {
                  next();
                  return;
                }
                const chunks: Buffer[] = [];
                req.on("data", (c) => chunks.push(Buffer.from(c)));
                req.on("end", () => {
                  try {
                    const raw = Buffer.concat(chunks).toString("utf8");
                    const logPath = path.join(__dirname, "debug-161d95.log");
                    fs.appendFileSync(logPath, raw.trim() + "\n", "utf8");
                    void fetch(
                      "http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "X-Debug-Session-Id": "161d95",
                        },
                        body: raw,
                      },
                    ).catch(() => undefined);
                    res.statusCode = 204;
                    res.end();
                  } catch {
                    res.statusCode = 500;
                    res.end("log write failed");
                  }
                });
              });
              // Same-origin debug NDJSON sink (CSP-safe) for session 70dd4b.
              server.middlewares.use("/__agent_debug_70dd4b", (req, res, next) => {
                if (req.method !== "POST") {
                  next();
                  return;
                }
                const chunks: Buffer[] = [];
                req.on("data", (c) => chunks.push(Buffer.from(c)));
                req.on("end", () => {
                  try {
                    const raw = Buffer.concat(chunks).toString("utf8");
                    const logPath = path.join(__dirname, ".cursor", "debug-70dd4b.log");
                    fs.mkdirSync(path.dirname(logPath), { recursive: true });
                    fs.appendFileSync(logPath, raw.trim() + "\n", "utf8");
                    // Best-effort mirror to the debug ingest server when available.
                    void fetch(
                      "http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "X-Debug-Session-Id": "70dd4b",
                        },
                        body: raw,
                      },
                    ).catch(() => undefined);
                    res.statusCode = 204;
                    res.end();
                  } catch {
                    res.statusCode = 500;
                    res.end("log write failed");
                  }
                });
              });
              // Same-origin debug NDJSON sink (CSP-safe) for session 4a9592.
              server.middlewares.use("/__agent_debug_4a9592", (req, res, next) => {
                if (req.method !== "POST") {
                  next();
                  return;
                }
                const chunks: Buffer[] = [];
                req.on("data", (c) => chunks.push(Buffer.from(c)));
                req.on("end", () => {
                  try {
                    const raw = Buffer.concat(chunks).toString("utf8");
                    const logPath = path.join(__dirname, "debug-4a9592.log");
                    fs.appendFileSync(logPath, raw.trim() + "\n", "utf8");
                    void fetch(
                      "http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "X-Debug-Session-Id": "4a9592",
                        },
                        body: raw,
                      },
                    ).catch(() => undefined);
                    res.statusCode = 204;
                    res.end();
                  } catch {
                    res.statusCode = 500;
                    res.end("log write failed");
                  }
                });
              });
              server.middlewares.use("/dev-downloads/clarify-ai-setup.exe", (_req, res, next) => {
                const candidates = [
                  path.join(__dirname, "release-new", "Career Pilot Setup 1.0.0.exe"),
                  path.join(__dirname, "release", "Career Pilot Setup 1.0.0.exe"),
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

            // Keep store/billing/network/api/ai in one chunk. Splitting them
            // created cross-chunk circular `const` bindings and a boot TDZ:
            // Uncaught ReferenceError: Cannot access 'P' before initialization.
            if (
              id.includes("/src/store/") ||
              id.includes("/src/lib/billing/") ||
              id.includes("/src/lib/network/") ||
              id.includes("/src/lib/api/") ||
              id.includes("/src/lib/ai/")
            ) {
              return "chunk-app-core";
            }
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
        "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
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
