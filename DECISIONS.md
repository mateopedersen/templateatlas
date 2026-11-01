# Implementation decisions

- Use the merged manifests from the 2027 installation package. Historic mockups supply visual references.
- One verified starter per topic. Keep topic and detail routes distinct and the desktop workbench on the left.
- Use Astro 7 and its official Cloudflare adapter. The custom Worker entry centralizes access policy before rendering.
- Use a signed guest cookie and one SQLite Durable Object per actor. Keep editable masters and personal drafts in separate private R2 stores.
- Use the owner’s existing paid Workers and R2 account for production. Keep customer payments and production administrator access closed at the owner’s request.
- The production Worker is connected to the public repository’s main branch. The operator deploys a reviewed release with an authenticated session.
