import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prefer current TypeScript sources over stale compiled JS duplicates
    // that still exist in src/ and can otherwise win extension resolution.
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html")
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
