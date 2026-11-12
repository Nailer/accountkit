import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis", "process.env": "{}" },
  server: {
    port: 5173,
    // 127.0.0.1, not localhost: the API listens on IPv4 loopback only.
    proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT ?? 8787}` },
  },
});
