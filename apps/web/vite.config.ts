import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import { pipeline } from "stream";

function findPnpmDistDir(opts: { repoRoot: string; pnpmPrefix: string; packagePathFromNodeModules: string[]; requiredFile: string }) {
  try {
    const pnpmDir = path.join(opts.repoRoot, "node_modules", ".pnpm");
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (!ent.name.startsWith(opts.pnpmPrefix)) continue;
      const distDir = path.join(pnpmDir, ent.name, "node_modules", ...opts.packagePathFromNodeModules, "dist");
      const required = path.join(distDir, opts.requiredFile);
      if (fs.existsSync(required)) return distDir;
    }
    return null;
  } catch {
    return null;
  }
}

function vadAssetsPlugin(): Plugin {
  const repoRoot = path.resolve(__dirname, "../..");
  const localVadDir = path.resolve(__dirname, "public/vad");
  const onnxDistDir = findPnpmDistDir({
    repoRoot,
    pnpmPrefix: "onnxruntime-web@",
    packagePathFromNodeModules: ["onnxruntime-web"],
    requiredFile: "ort-wasm-simd-threaded.mjs",
  });
  const vadWebDistDir = findPnpmDistDir({
    repoRoot,
    pnpmPrefix: "@ricky0123+vad-web@",
    packagePathFromNodeModules: ["@ricky0123", "vad-web"],
    requiredFile: "silero_vad_v5.onnx",
  });

  function getContentType(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mjs" || ext === ".js") return "application/javascript";
    if (ext === ".wasm") return "application/wasm";
    return "application/octet-stream";
  }

  return {
    name: "translator-vad-assets",
    enforce: "pre" as const,
    configureServer(server: any) {
      const roots = [localVadDir, onnxDistDir, vadWebDistDir].filter(
        (dir): dir is string => !!dir && fs.existsSync(dir)
      );

      const handler = (req: any, res: any, next: any) => {
        const url = req?.url;
        if (typeof url !== "string") return next();

        const pathname = decodeURIComponent(url.split("?")[0] ?? "");
        let relative = pathname.replace(/^\/+/, "");
        if (relative.startsWith("vad/")) relative = relative.slice("vad/".length);
        if (!relative) return next();

        for (const root of roots) {
          const candidate = path.join(root, relative);
          try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
              res.statusCode = 200;
              res.setHeader("Content-Type", getContentType(candidate));
              pipeline(fs.createReadStream(candidate), res, (err) => {
                if (err) next(err);
              });
              return;
            }
          } catch {
            continue;
          }
        }

        next();
      };

      const stack = (server.middlewares as any)?.stack;
      if (Array.isArray(stack)) {
        stack.unshift({ route: "/vad", handle: handler });
      } else {
        server.middlewares.use("/vad", handler);
      }
    },
    async closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const destVadDir = path.join(outDir, "vad");

      try {
        if (fs.existsSync(localVadDir)) {
          fs.mkdirSync(destVadDir, { recursive: true });
          fs.cpSync(localVadDir, destVadDir, { recursive: true });
        }

        if (onnxDistDir) {
          const onnxFiles = [
            "ort-wasm-simd-threaded.mjs",
            "ort-wasm-simd-threaded.jsep.mjs",
            "ort-wasm-simd-threaded.asyncify.mjs",
            "ort-wasm-simd-threaded.wasm",
            "ort-wasm-simd-threaded.jsep.wasm",
            "ort-wasm-simd-threaded.asyncify.wasm",
          ];
          for (const file of onnxFiles) {
            const src = path.join(onnxDistDir, file);
            const dest = path.join(destVadDir, file);
            if (fs.existsSync(src)) {
              fs.mkdirSync(destVadDir, { recursive: true });
              fs.copyFileSync(src, dest);
            }
          }
        }

        if (vadWebDistDir) {
          const vadWebFiles = ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"];
          for (const file of vadWebFiles) {
            const src = path.join(vadWebDistDir, file);
            const dest = path.join(destVadDir, file);
            if (fs.existsSync(src)) {
              fs.mkdirSync(destVadDir, { recursive: true });
              fs.copyFileSync(src, dest);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to stage VAD assets:", e);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    envDir: path.resolve(__dirname, "../.."),
    plugins: [
      vadAssetsPlugin(),
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "pwa-icon.svg", "pwa-maskable.svg"],
        manifest: {
          name: "Live Translator",
          short_name: "Translator",
          description: "Real-time translated conversations",
          theme_color: "#0b0b0c",
          background_color: "#0b0b0c",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "/pwa-icon.svg",
              sizes: "any",
              type: "image/svg+xml",
            },
            {
              src: "/pwa-maskable.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Disable precaching in development to avoid workbox warnings
          disableDevLogs: true,
          globPatterns: isDev ? [] : ['**/*.{js,css,html,ico,png,svg,woff2,mjs,json}'],
          globIgnores: [
            'vad/**/*.wasm',
            'vad/**/*.onnx',
          ],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/vad/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'vad-assets',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: isDev,
          // Disable service worker registration in dev to avoid workbox warnings
          type: isDev ? 'module' : 'classic',
        },
      }),
    ],
    server: {
      port: 4004,
      host: true,
      proxy: {
        "/api": {
          target: "http://localhost:4003",
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("react") || id.includes("react-dom")) return "react";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("@tanstack")) return "tanstack";
            if (id.includes("i18next") || id.includes("react-i18next")) return "i18n";
            if (id.includes("lucide-react")) return "icons";
            return "vendor";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // @ts-ignore
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/__tests__/setup.ts",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});