import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const moduleProp = readFileSync(
  new URL("../module/module.prop", import.meta.url),
  "utf8",
);
const studioVersion = /^version=(.+)$/m.exec(moduleProp)?.[1];
if (!studioVersion) throw new Error("module.prop is missing version");

export default defineConfig({
  base: "./",
  define: {
    __STUDIO_VERSION__: JSON.stringify(studioVersion),
  },
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
              "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data: ksu: https://q.qlogo.cn; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
          },
        },
      ],
    },
  ],
});
