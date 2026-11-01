import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
export default defineConfig({
  site: "https://templateatlas.com",
  output: "server",
  session: false,
  adapter: cloudflare({
    imageService: "passthrough",
    configPath:
      process.env.TEMPLATEATLAS_TARGET === "production"
        ? "wrangler.production.jsonc"
        : "wrangler.jsonc",
  }),
  devToolbar: { enabled: false },
  trailingSlash: "ignore",
});
