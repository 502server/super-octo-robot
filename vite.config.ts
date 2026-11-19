import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const previewHost = process.env.V0_RUNTIME_URL ? new URL(process.env.V0_RUNTIME_URL).hostname : undefined;

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
        target: "http://localhost:3000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            proxyRequest.setHeader("x-forwarded-proto", "http");
            if (request.headers.origin) proxyRequest.setHeader("origin", "http://localhost:3000");
          });
        },
      },
      "/icons": {
        target: "http://localhost:3000",
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
