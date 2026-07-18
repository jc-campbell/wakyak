import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

const apiTarget = "http://127.0.0.1:4000";
const tailscaleHost = process.env.VITE_TAILSCALE_HOST;

function apiProxy(): ProxyOptions {
  return {
    target: apiTarget,
    configure(proxy) {
      proxy.on("proxyReq", (proxyRequest, request) => {
        const requestHost = request.headers.host?.replace(/:443$/, "");
        if (tailscaleHost && requestHost === tailscaleHost) {
          proxyRequest.setHeader("x-forwarded-host", tailscaleHost);
          proxyRequest.setHeader("x-forwarded-proto", "https");
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  envDir: path.resolve(import.meta.dirname, "../.."),
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    allowedHosts: tailscaleHost ? [tailscaleHost] : [],
    strictPort: true,
    proxy: {
      "/api": apiProxy(),
      "/v1": apiProxy(),
      "/health": apiProxy(),
      "/ready": apiProxy(),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: "tanstack-vendor",
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 15,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              maxSize: 350_000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
