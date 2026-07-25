import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopConfig = readFileSync(resolve(import.meta.dirname, "../build/config.yml"), "utf8");
const appVersion = desktopConfig.match(/\ninfo:[\s\S]*?\n\s+version:\s*["']([^"']+)["']/)?.[1] ?? "0.0.0";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), wails("./bindings")],
});
