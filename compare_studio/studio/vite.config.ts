import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev: Vite on 5173 proxies API + media to the studio server on 4321.
// Prod: `npm run build` emits dist/, which the studio server serves itself.
export default defineConfig({
  base: "/studio/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:4321" },
  },
});
