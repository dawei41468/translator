import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    envDir: path.resolve(__dirname, "../.."),
    plugins: [
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
        devOptions: {
          enabled: isDev,
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