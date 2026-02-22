import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  // Use relative asset paths so the app works even if served under a subpath (Telegram webview / reverse proxies).
  base: "./",
  build: {
    // Telegram can cache index.html aggressively. We keep entry filenames stable and
    // control caching on the server (entry files no-store, hashed chunks immutable).
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html")
      },
      output: {
        // Stable entry filenames so a cached index.html still loads the newest JS.
        entryFileNames: "assets/[name].js",
        // Keep chunks hashed (safe to cache long-term)
        chunkFileNames: "assets/chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const n = assetInfo.name || "asset";
          if (n.endsWith(".css")) return "assets/[name].css";
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
