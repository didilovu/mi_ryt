import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "version-offline-shell",
      closeBundle() {
        const hash = createHash("sha256")
          .update(readFileSync("dist/index.html"))
          .digest("hex")
          .slice(0, 12);
        const path = "dist/sw.js";
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace("moy-ritm-v1", `moy-ritm-${hash}`),
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/"))
            return id.includes("/recharts/") ||
              id.includes("/d3-") ||
              id.includes("/victory-")
              ? "charts"
              : "vendor";
        },
      },
    },
  },
});
