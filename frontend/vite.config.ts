import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all vars (not just VITE_*) so dev-only settings stay out of the client bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: Number(env.DEV_SERVER_PORT) || 5173,
      // Proxy API calls in dev so the browser sees a same-origin request.
      proxy: {
        "/api": {
          target: env.DEV_API_PROXY_TARGET || "http://localhost:5000",
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: mode !== "production",
    },
  };
});
