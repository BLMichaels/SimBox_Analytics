import { copyFileSync, createReadStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const MAPLIBRE_WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

/** MapLibre looks for its worker beside the bundled chunk. Vite renames that chunk, so ship the worker ourselves. */
function maplibreWorkerFiles(): Plugin {
  let outDir = "";
  let sourceDir = "";
  return {
    name: "maplibre-worker-files",
    configResolved(config) {
      sourceDir = resolve(config.root, "node_modules/maplibre-gl/dist");
      outDir = resolve(config.root, config.build.outDir, "assets/maplibre");
    },
    configureServer(server) {
      server.middlewares.use("/assets/maplibre", (req, res, next) => {
        const name = MAPLIBRE_WORKER_FILES.find((file) => req.url?.split("?")[0] === `/${file}`);
        if (!name) return next();
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        createReadStream(resolve(sourceDir, name)).pipe(res);
      });
    },
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      for (const name of MAPLIBRE_WORKER_FILES) {
        copyFileSync(resolve(sourceDir, name), resolve(outDir, name));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorkerFiles()],
  server: {
    fs: { allow: [".."] },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
