# TemplateAtlas

A US-first library of editable documents, calendars and data-driven charts, built with Astro and Cloudflare Workers. The source archive defines 1,146 topics, 68 category hubs, nine interactive tools and 2,420 planned fixed paths.

## Development

Use Node 24 and npm. Install with `npm ci`. Run `npm test`, then `npm run build`. The application uses D1, private R2 storage and SQLite-backed Durable Objects. The checkout contains software and a public catalog projection. Private editable masters, render recipes, customer documents and credentials are stored separately.

TemplateAtlas is in implementation. A manifest entry by itself does not indicate that a template has been rendered, reviewed or published. See the progress and QA reports for actual counts.

The owner requires zero additional hosting cost. Live checkout and unattended deployments are disabled. The remote staging resources are segregated from other projects.
