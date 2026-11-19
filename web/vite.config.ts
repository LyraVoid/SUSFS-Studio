import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "local-assets-policy",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          injectTo: "head-prepend",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content:
              "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'",
          },
        },
      ],
    },
  ],
});
