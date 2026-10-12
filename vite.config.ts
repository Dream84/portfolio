import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: "0.0.0.0",
    port: 5183,
    watch: { ignored: ["**/runtime/**", "**/dist/**", "**/app.log", "**/.myportfolio.pid"] },
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
