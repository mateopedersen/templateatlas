# Production release verification

The public domain serves the US English application over HTTPS. The www host redirects to the apex. Cloudflare deploys the Astro application and an independently authenticated private Linux renderer.

| Check | Production evidence |
| --- | --- |
| Storage | Read all 2,508 R2 bodies, 84,580,363 bytes. Every SHA-256, MIME type and byte count matched. A separate six-page bucket inventory found no extras. Both buckets have public access disabled. |
| Catalog | 1,146 active templates, 2,508 version records, and 1,146 search records verified after activation. |
| Routes | 2,415 successful HTML responses, 5 protected admin routes and all 1,202 single-hop redirects passed. The sitemap listed 2,375 URLs. |
| Search | 20 package fixtures, 60 exact subjects and all 6 filter combinations passed against the production search API. |
| Guest downloads | Five distinct files were delivered through regular signed links across DOCX, PPTX, SVG, XLSX and PDF. Repeat delivery left usage at five. The sixth distinct selection required registration. |
| Editing | A personalized one-page chart PDF and a 1,800-pixel JPEG passed. Repeated previews used the cache, changing the revision changed the protected preview, and another guest could not read the document. Test drafts were marked for deletion. |
| Build and business rules | 71 local automated tests passed with real conversion enabled. The linux/amd64 production image passed a separate build, security and document conversion test on GitHub. |
| Identity and payments | Cloudflare Email Sending is configured. Public DNS returned SPF, DKIM and DMARC for the sending subdomain. The first-inbox test is reserved for the owner. No live customer charge was attempted. Administrator access and paid checkout are disabled by owner decision. |

Operator releases are manual. GitHub checks run on changes. The worker is connected to the main branch. Cloudflare builds that would provision an account-wide deployment token are disabled.

## Earlier local release verification

The installation ZIP passed all 47 package checks and all 105 supplied file hashes matched. Local generation and delivery were checked independently. The catalog contains 1,146 different native master hashes and 1,146 different PDF hashes. There are 2,508 downloadable files and 1,146 first-page preview associations.

| Check | Local result |
| --- | --- |
| Type and build checks | Astro strict typecheck reported zero errors and zero warnings. The Cloudflare production bundle built successfully. |
| Automated tests | 68 passed, none failed or skipped in the local run with the private renderer enabled. |
| Pages and aliases | All 2,420 fixed paths were checked. The five admin paths denied a guest, and the other 2,415 returned HTML. All 1,202 aliases returned the expected single-hop 301. |
| Search | 20 package fixtures, 60 exact subjects, and 6 combined edition/format/use/paper filters passed through the running HTTP endpoint. |
| Private file delivery | A real, locally verified trial account requested every advertised file using the regular signed download endpoints. Size, MIME and SHA-256 were checked. |
| Native editing and documents | Separate users cannot open or modify each other's drafts. Old approved revisions remain pinned after a catalog upgrade. Leased conversion jobs can resume without duplicate delivery. |
| 2027 edition | All 26 dated topics checked, including January–December 2027 academic planning, federal observed dates and the calendar heatmap. |
| Local authentication | Real verification/reset tokens and sessions tested with isolated local mail, without external email. The card-free trial lasts 2,592,000 seconds. Signed Stripe reconciliation was tested with a provider double. |
| Browser QA | Chromium and WebKit passed 70 account-page checks across seven widths. The local accessibility scan checked ten pages at mobile and desktop widths. Firefox could not start its child content process on this Mac. |
| Recovery | All private originals were verified from an isolated restored database/object store. An earlier code version served the restored invoice page and returned its correct PDF through the protected download path. |

The public GitHub source contains the application, reviewed preview images, source metadata and test code. Private production recipes, originals, signed download tickets, users' documents, accounts and secret values are excluded.
