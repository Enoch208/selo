import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const api = "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/v1": api,
      "/health": api,
      "/llms.txt": api,
      "/.well-known": api,
    },
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
