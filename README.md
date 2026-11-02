# TemplateAtlas

TemplateAtlas is a US-first template library and document studio built with Astro and Cloudflare Workers. The 2027 catalog contains 1,146 editable originals across 68 category hubs, alongside nine tools and 2,420 planned fixed paths. Each native file has a same-source PDF and preview. The public repository contains the application, public preview images and verifiable metadata.

Live at [TemplateAtlas](https://templateatlas.com/).

The R-134a topic also includes 100 finished reference-chart designs, each with PDF and full-resolution WebP downloads. Supplemental collections are declared in `src/data/imported-collections.json`; they retain the core topic paths and use separate stable design IDs and detail pages. Their original files and public preview derivatives are stored in R2. The assets hostname serves only the explicit public preview and source-notice allowlist. Original downloads use the existing signed membership delivery flow.

## Run locally

Install Node.js 24 and use the private catalog supplied with the owner installation. From the app directory run `sh scripts/start-local.sh`. Open [the local studio](http://localhost:4321/). The launcher uses local D1, R2 and SQLite-backed Durable Objects. PDF/JPEG conversion uses a separately authenticated loopback process with Python, pypdf, LibreOffice and Poppler.

## Verify

Run `npm ci`, `npm run check`, `npm test` and `npm run build`. The optional full renderer test requires `TEMPLATEATLAS_RENDERER_TEST=1` and the conversion dependencies. GitHub Actions runs source, type, business logic and build checks with read-only permissions. The connected production branch is `main`. Production releases are manual. From a reviewed checkout, `npm run deploy:production` verifies the active remote catalog, builds the production configuration and deploys the Worker.

## Operations

See [the owner guide](OPERATIONS_TR.md), [service configuration](src/server/README.md), [progress](PROGRESS.json), [asset summary](ASSET_MANIFEST.json), and [QA evidence](QA_REPORT.md). The production site uses two private R2 buckets, D1, SQLite-backed Durable Objects, Cloudflare Email Sending and a private Linux document renderer. The owner has paused customer payments and administrator access.
