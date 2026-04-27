import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(dirname, "src/admin/client");

export default defineConfig({
  root: clientRoot,
  publicDir: false,
  build: {
    outDir: path.resolve(dirname, "public"),
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    rollupOptions: {
      input: path.resolve(clientRoot, "admin.html"),
      output: {
        entryFileNames: "admin.js",
        chunkFileNames: "admin-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  server: {
    middlewareMode: true,
  },
  appType: "custom",
});
