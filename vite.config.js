import { defineConfig } from "vite";

// Vite packages the web side of NEWB. Tauri expects it on port 1420 while developing.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
