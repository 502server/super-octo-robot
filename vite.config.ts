import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const previewHost = process.env.V0_RUNTIME_URL ? new URL(process.env.V0_RUNTIME_URL).hostname : undefined;
const apiOrigin = process.env.VITE_API_ORIGIN || "https://502-devbot.vercel.app";

export default defineConfig({
  root: `${projectRoot}/web`,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    ...(previewHost ? { allowedHosts: [previewHost] } : {}),
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest) => {
            proxyRequest.setHeader("x-forwarded-proto", new URL(apiOrigin).protocol.slice(0, -1));
            proxyRequest.setHeader("origin", apiOrigin);
          });
        },
      },
      "/icons": {
        target: apiOrigin,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
    sourcemap: false,
  },
});
