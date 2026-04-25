import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import loadVersion from "vite-plugin-package-version";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { handlebars } from "./plugins/handlebars";
import { PluginOption, loadEnv } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { viteStaticCopy } from "vite-plugin-static-copy";

import tailwind from "tailwindcss";
import rtl from "postcss-rtlcss";

const captioningPackages = [
  "dompurify",
  "htmlparser2",
  "subsrt-ts",
  "parse5",
  "entities",
  "fuse",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: env.VITE_BASE_URL || "/",
    plugins: [
      handlebars({
        vars: {
          opensearchEnabled: env.VITE_OPENSEARCH_ENABLED === "true",
          routeDomain:
            env.VITE_APP_DOMAIN +
            (env.VITE_NORMAL_ROUTER !== "true" ? "/#" : ""),
          domain: env.VITE_APP_DOMAIN,
          env,
        },
      }),
      react({
        babel: {
          presets: [
            "@babel/preset-typescript",
            [
              "@babel/preset-env",
              {
                modules: false,
                useBuiltIns: "entry",
                corejs: {
                  version: "3.34",
                },
              },
            ],
          ],
        },
      }),
      VitePWA({
        disable: env.VITE_PWA_ENABLED !== "true",
        registerType: "autoUpdate",
        workbox: {
          maximumFileSizeToCacheInBytes: 4000000, // 4mb
          globIgnores: ["!assets/**/*"],
        },
        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "safari-pinned-tab.svg",
        ],
        manifest: {
          name: "P-Stream",
          short_name: "P-Stream",
          description:
            "Watch your favorite shows and movies for free with no ads ever! (っ'ヮ'c)",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
      loadVersion(),

      // splitVendorChunkPlugin removed — deprecated in Vite 5 (TechDebt #17)
      visualizer() as PluginOption,
      // Copy locale JSONs to /locales/ so i18next-http-backend can lazy-load them (TASK-028)
      viteStaticCopy({
        targets: [
          {
            src: "src/assets/locales/*.json",
            dest: "locales",
          },
        ],
      }),
    ],

    build: {
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (
              id.includes("@sozialhelden+ietf-language-tags") ||
              id.includes("country-language")
            ) {
              return "language-db";
            }
            if (id.includes("hls.js")) {
              return "hls";
            }
            if (id.includes("node-forge") || id.includes("crypto-js")) {
              return "auth";
            }
            if (id.includes("locales") && !id.includes("en.json")) {
              return "locales";
            }
            if (id.includes("react-dom")) {
              return "react-dom";
            }
            if (id.includes("Icon.tsx")) {
              return "Icons";
            }
            const isCaptioningPackage = captioningPackages.some((packageName) =>
              id.includes(packageName),
            );
            if (isCaptioningPackage) {
              return "caption-parsing";
            }
          },
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwind(), rtl()],
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@themes": path.resolve(__dirname, "./themes"),
        "@sozialhelden/ietf-language-tags": path.resolve(
          __dirname,
          "./node_modules/@sozialhelden/ietf-language-tags/dist/cjs",
        ),
      },
    },

    test: {
      environment: "jsdom",
    },
    preview: {
      host: true,
      port: 80,
      allowedHosts: ["pstream.net", "pstream-test.vercel.app"],
    },
  };
});
