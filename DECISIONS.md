# Implementation decisions

- Use the merged manifests from the 2027 installation package. Historic mockups supply visual references.
- One verified starter per topic. Keep topic and detail routes distinct and the desktop workbench on the left.
- Use Astro 7 and its official Cloudflare adapter. The custom Worker entry centralizes access policy before rendering.
- Use a signed guest cookie and one SQLite Durable Object per actor. Keep editable masters and personal drafts in separate private R2 stores.
- Honor the owner’s zero-additional-spend instruction. Do not enable production billing, paid email or metered deployments. Check the account’s actual usage before changing the release policy.
