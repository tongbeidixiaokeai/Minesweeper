import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        hub: resolve(__dirname, "index.html"),
        minesweeper: resolve(__dirname, "games/minesweeper/index.html"),
        racer3d: resolve(__dirname, "games/racer3d/index.html")
      }
    }
  }
});
