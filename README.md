# TemplateAtlas

TemplateAtlas is a US-first template library and document studio built with Astro and Cloudflare Workers. The 2027 catalog contains 1,146 editable originals across 68 category hubs, alongside nine tools and 2,420 planned fixed paths. Each native file has a same-source PDF and preview. The public repository contains the application, public preview images and verifiable metadata.

## Run locally

Install Node.js 24 and use the private catalog supplied with the owner installation. From the app directory run `sh scripts/start-local.sh`. Open [the local studio](http://localhost:4321/). The launcher uses local D1, R2 and SQLite-backed Durable Objects. PDF/JPEG conversion uses a separately authenticated loopback process with Python, pypdf, LibreOffice and Poppler.

## Verify

Run `npm ci`, `npm run check`, `npm test` and `npm run build`. The optional full renderer test requires `TEMPLATEATLAS_RENDERER_TEST=1` and the conversion dependencies. GitHub Actions runs source, type, business logic and build checks with read-only permissions. Deployments are manual and currently disabled.

## Operations

See [the owner guide](OPERATIONS_TR.md), [service configuration](src/server/README.md), [progress](PROGRESS.json), [asset summary](ASSET_MANIFEST.json), and [QA evidence](QA_REPORT.md). The owner requires zero additional spend. Live billing, production email, remote private-file ingestion and the public domain deployment are pending.
