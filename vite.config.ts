import { fileURLToPath } from "url";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** Dev-server only — never shipped in client bundles. */
const DEV_AGENT_INGEST_URL =
  "http://127.0.0.1:7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2";

function installAgentDebugSinks(server: { middlewares: { use: (fn: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => void) => void } }) {
  const sinks: Array<{ sessionId: string; logPath: string }> = [
    { sessionId: "161d95", logPath: path.join(__dirname, "debug-161d95.log") },
    { sessionId: "70dd4b", logPath: path.join(__dirname, ".cursor", "debug-70dd4b.log") },
    { sessionId: "4a9592", logPath: path.join(__dirname, "debug-4a9592.log") },
    { sessionId: "fcd48a", logPath: path.join(__dirname, "debug-fcd48a.log") },
    { sessionId: "agent", logPath: path.join(__dirname, "debug-agent.log") },
  ];
  const sinkBySession = new Map(sinks.map((sink) => [sink.sessionId, sink]));

  server.middlewares.use((req, res, next) => {
    const match = req.url?.match(/^\/__agent_debug_([a-z0-9]+)$/);
    if (!match || req.method !== "POST") {
      next();
      return;
    }
    const sessionId = match[1];
    const sink = sinkBySession.get(sessionId) ?? {
      sessionId,
      logPath: path.join(__dirname, `debug-${sessionId}.log`),
    };
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        fs.mkdirSync(path.dirname(sink.logPath), { recursive: true });
        fs.appendFileSync(sink.logPath, raw.trim() + "\n", "utf8");
        void fetch(DEV_AGENT_INGEST_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": sessionId,
          },
          body: raw,
        }).catch(() => undefined);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 500;
        res.end("log write failed");
      }
    });
  });
}

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
              installAgentDebugSinks(server);

              const GITHUB_INSTALLER =
                "https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe";

              function findLocalInstaller(): string | null {
                const candidates = [
                  path.join(__dirname, "release-new", "Career Pilot Setup 1.0.0.exe"),
                  path.join(__dirname, "release", "Career Pilot Setup 1.0.0.exe"),
                  path.join(__dirname, "release", "Career-Pilot-Setup.exe"),
                ];
                for (const dir of ["release-new", "release"]) {
                  const folder = path.join(__dirname, dir);
                  if (!fs.existsSync(folder)) continue;
                  const match = fs.readdirSync(folder).find((f) => f.endsWith(".exe") && /setup/i.test(f));
                  if (match) candidates.unshift(path.join(folder, match));
                }
                return candidates.find((p) => fs.existsSync(p)) ?? null;
              }

              function serveLocalInstaller(
                req: import("http").IncomingMessage,
                res: import("http").ServerResponse,
                file: string,
              ) {
                const stat = fs.statSync(file);
                const total = stat.size;
                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Accept-Ranges", "bytes");
                res.setHeader(
                  "Content-Disposition",
                  'attachment; filename="Career-Pilot-Setup.exe"',
                );

                if (req.method === "HEAD") {
                  res.statusCode = 200;
                  res.setHeader("Content-Length", String(total));
                  res.end();
                  return;
                }

                const rangeHeader = req.headers.range;
                if (typeof rangeHeader === "string") {
                  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader);
                  if (match) {
                    const start = Number(match[1]);
                    const end = match[2] ? Number(match[2]) : total - 1;
                    if (Number.isFinite(start) && start < total && end >= start) {
                      const chunkSize = end - start + 1;
                      res.statusCode = 206;
                      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
                      res.setHeader("Content-Length", String(chunkSize));
                      fs.createReadStream(file, { start, end }).pipe(res);
                      return;
                    }
                  }
                }

                res.statusCode = 200;
                res.setHeader("Content-Length", String(total));
                fs.createReadStream(file).pipe(res);
              }

              async function serveGithubInstaller(
                req: import("http").IncomingMessage,
                res: import("http").ServerResponse,
              ) {
                const headers: Record<string, string> = {
                  "User-Agent": "CareerPilot-Dev-Installer-Proxy/1.0",
                };
                if (typeof req.headers.range === "string") {
                  headers.Range = req.headers.range;
                }
                const upstream = await fetch(GITHUB_INSTALLER, {
                  method: req.method === "HEAD" ? "HEAD" : "GET",
                  headers,
                  redirect: "follow",
                });
                res.statusCode = upstream.status;
                const passHeaders = [
                  "content-type",
                  "content-length",
                  "content-range",
                  "accept-ranges",
                  "content-disposition",
                ];
                for (const name of passHeaders) {
                  const value = upstream.headers.get(name);
                  if (value) res.setHeader(name, value);
                }
                if (!upstream.headers.get("content-type")) {
                  res.setHeader("Content-Type", "application/octet-stream");
                }
                if (req.method === "HEAD") {
                  res.end();
                  return;
                }
                if (!upstream.body) {
                  res.end();
                  return;
                }
                const reader = upstream.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(Buffer.from(value));
                }
                res.end();
              }

              const installerHandler = (
                req: import("http").IncomingMessage,
                res: import("http").ServerResponse,
                next: () => void,
              ) => {
                if (req.method !== "GET" && req.method !== "HEAD") {
                  next();
                  return;
                }
                const local = findLocalInstaller();
                if (local) {
                  serveLocalInstaller(req, res, local);
                  return;
                }
                void serveGithubInstaller(req, res).catch(() => {
                  res.statusCode = 503;
                  res.setHeader("Content-Type", "text/plain; charset=utf-8");
                  res.end(
                    "Desktop installer unavailable in dev. Run npm run dist:win or check your network.",
                  );
                });
              };

              server.middlewares.use("/download/Career-Pilot-Setup.exe", installerHandler);
              server.middlewares.use("/download-windows.php", installerHandler);
              server.middlewares.use("/dev-downloads/clarify-ai-setup.exe", installerHandler);
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
        "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), fullscreen=(self)",
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
