import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { preparePublicAssets } from "./scripts/prepare-public-assets.mjs";
preparePublicAssets();
export default defineConfig({
  site: "https://templateatlas.com",
  output: "server",
  session: false,
  adapter: cloudflare({
    imageService: "passthrough",
    inspectorPort:
      process.env.TEMPLATEATLAS_TARGET === "production" ? false : undefined,
    configPath:
      process.env.TEMPLATEATLAS_TARGET === "production"
        ? "wrangler.production.jsonc"
        : "wrangler.jsonc",
  }),
  vite: {
    define: { __TEMPLATEATLAS_BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
    // Node intake/release scripts keep the full source catalog; only the deployed
    // application uses the content-equivalent catalog without duplicated review evidence.
    resolve: { alias: [{find: '../data/imported-collections.json', replacement: new URL('./src/data/imported-runtime.json', import.meta.url).pathname}] },
  },
  devToolbar: { enabled: false },
  trailingSlash: "ignore",
});
