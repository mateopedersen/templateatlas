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

## R-134a dimensional collection — November 2, 2026

- Preserved and SHA-256 checked the complete owner-supplied ZIP before intake. Source digest: `958046a243d88569caf42c65f7247656c0dbb4d046ce7af478fb507860081529`.
- Checked 100 one-page PDFs and 100 original WebP files against the supplied byte counts, dimensions and SHA-256 values. Extracted all 5,780 reference-table rows from the PDFs and matched their formatted cells to the canonical supplied data. Visually reviewed all 100 designs in five contact sheets.
- Uploaded and independently read back 302 immutable R2 objects: 200 downloadable originals, 100 reduced previews and two method/license notices. Compared all 200 new D1 file records and all 1,246 prepared search rows before activation.
- Each design has its own English title, description, detail path, PDF button and Image button. The collection includes edition, paper, orientation and color filters. The original topic and earlier editable-reference detail path remain available.
- Public previews and notices use `assets.templateatlas.com`. The Worker only exposes the manifest allowlist on this hostname; raw originals and API paths return 404. PDF and full-resolution WebP files use signed delivery from private R2.
- Live checks passed for all 100 detail pages and 100 checksum-matched preview responses, two source notices, three search/filter queries and all 100 new sitemap entries. Eleven new-design HTTP transfers and two actual browser-button downloads matched their original SHA-256 values. Six existing-catalog transfers also passed the production regression smoke check.
- On production, PDF and Image formats of one design used one selection, repeat downloads used no additional selection, and the sixth distinct selection returned `SIGNUP_REQUIRED`. A browser filter combination produced the expected five charts. The asset hostname was added to the image CSP and image loading was confirmed in the browser.
- Source/type checks returned zero errors and zero warnings (ten existing hints). The full test run passed 75 tests with one optional renderer test skipped. The five focused collection tests passed again after accessibility/CSP refinements. Production builds completed with the existing non-blocking dynamic-import bundling warning.
- The core 1,146-topic release remains unchanged. The total available design count is 1,246 and the original-download file count is 2,708. Import receipts, immutable ZIP, source files and resumable checkpoints remain in the private owner work area; no originals or credentials were added to the public repository.

## 52-week savings collection and navigation — November 2, 2026

- Preserved a private, checksum-verified copy of the complete supplied ZIP (`4413301cf247225537de1eef7b94384733eec964b88f69ccd33870c35e297a71`). All 400 source files passed container and content checks: 100 PDF, 100 WebP, 100 Word and 100 Excel files. Original bytes were retained; no file repair was required.
- Checked every plan's 52 weekly amounts and independently summed its target across PDF, Word and Excel. The 100 designs cover 12 plan types, nine targets from $520 to $5,000, 30 monochrome designs and 70 color designs. The exact-$1,000 plan uses four one-cent adjustments, accurately described in its metadata.
- Rendered all 100 PDFs and all 100 Word/100 Excel documents for visual inspection. The native Word and Excel exports each fit one page. All 100 Excel workbooks recalculated to the correct target, saved balance, remaining amount and progress. Sixteen additional native recalculation cases exercised partial completion, full completion, negative values and text input. The static preview represents the PDF/Image design; editable Word/Excel layouts are explained on the detail pages.
- Compared all 500 new R2 bodies (400 originals and 100 reduced previews), totaling 207,073,842 bytes, with their local hashes, MIME types and lengths. Compared all 400 D1 file rows and all 1,446 staged search rows before activation. Originals remain private and are served through signed download delivery.
- Production verification passed for all 100 new detail pages and all 100 checksum-matched previews. Three search/filter queries returned the expected results. Twenty-one direct HTTP downloads and four real browser-button downloads across all four formats matched the supplied originals. The four formats of one design used one free selection; the sixth distinct selection was rejected with `SIGNUP_REQUIRED`.
- Shared download controls now support PDF, Image, Word and Excel with equal-width buttons, file sizes and format-specific vector artwork. At 390, 768 and 1,440 pixels, filtering, reset, category tabs, keyboard navigation, drawer scrolling and horizontal overflow checks passed locally. More/Less on both earlier imported collections was also verified on production without stretching neighboring cards.
- Navigation uses lighter Manrope typography, Title Case labels, ice-white surfaces and an image-generated object atlas displayed through shared icon viewports. The atlas is a raster asset, not a claim of newly generated vector paths. Drawer size observation keeps scroll controls consistent after font/content layout changes.
- The automated suite passed 80 tests with one optional renderer integration test skipped. Astro reported zero errors, zero warnings and ten existing hints; the production build passed. On production, nine representative pages/static/image resources and all four downloaded formats retained noindex headers. The sitemap remains empty while indexing is paused. Billing and public administration remain disabled.
- The existing 1,146-topic base release remains intact. The combined catalog now contains 1,446 designs and 3,408 original downloadable files. Private source archives, render evidence, upload receipts and resumable checkpoints remain outside the public repository.
- Follow-up presentation changes preserve all 100 reviewed weekly items byte-for-byte while placing the 70 color designs before the 30 monochrome designs. The topic cover, library thumbnail and portrait/landscape examples now select color designs. The category browser has six groups, including Home & Wellbeing and Legal & Property; all 20 original category destinations remain available. Larger tab labels/numerals and evenly distributed rows use the same responsive navigation controls.
