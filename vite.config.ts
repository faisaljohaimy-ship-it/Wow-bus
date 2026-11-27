import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart({ server: { entry: "ssr" } }),
    nitro({
      preset: process.env.VERCEL ? "vercel" : "node-server",
      // The static bus site is preserved at the root. React owns SSR requests.
      renderer: false,
    }),
    react(),
  ],
});
