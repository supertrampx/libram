import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { libramGuide } from "./scripts/guide-plugin.mjs";

const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), libramGuide(base)],
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: {
      ignored: ["**/public/guide/**", "**/public/_/**", "**/public/search-index.js", "**/.cache/**"],
    },
  },
});
