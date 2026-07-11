import { defineConfig } from "vite";

export default defineConfig({
  root: "dist",
  publicDir: false,
  server: {
    open: "/",
  },
});
