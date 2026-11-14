# Production release verification

## Commercial lease application intake — November 2, 2026

- Preserved the complete supplied ZIP privately and verified its SHA-256 (`d5543f931036da8476f57dcf25d15bc7a5c4b87ecf0c0c082045bc34b2cb0330`) before extracting. The archive contains exactly 100 PDF, 100 WebP, 100 DOCX and 100 ODT originals. No source repair was required; original bytes are preserved.
- Checked every container and all PDF field labels against the Word and OpenDocument contents. All 100 Word and 100 ODT documents opened in the local office renderer and retained the source PDF page count. The 100 applications contain 251 pages, spanning 20 business uses and five application types. All use US Letter portrait pages; 30 are color and 70 monochrome.
- Inspected all source PDF pages and native Word/ODT pages in contact sheets, plus all 100 first-page WebP previews. Two ODT files use a different readable font fallback. One ODT QA PDF has a ligature text-extraction mismatch; the original XML and actual rendered text were checked and are correct. This is recorded as an extraction exception, not a source repair.
- Added individually reviewed titles, complete short introductions and separate expanded descriptions. Nonprofit authority/financial terminology and pop-up occupancy dates are reflected in their own copy. Existing topic and earlier detail addresses are preserved.
- Uploaded and read back all 651 new R2 bodies: 400 originals and 251 individual-page previews. All SHA-256 values, byte counts and MIME types matched. Staged and compared 400 D1 file rows and all 1,546 search rows before deployment.
- ODT has its own SVG and download button. It is a downloadable catalog format; unsupported personalized ODT generation remains unavailable. Four download controls have equal widths/heights, with no clipped text or horizontal overflow across all 100 cards at 390, 768 and 1,440 CSS pixels. Business-use/application-type filters, form-length selection, reset, independent More expansion and keyboard page tabs passed browser checks.
- Astro check: zero errors and warnings, ten existing hints. Build and editorial validation passed. Automated suite: 82 passed, zero failed, one optional renderer test skipped.
- Live verification passed for all 100 detail pages, their titles/intros/expanded descriptions, and all 251 checksum-matched preview responses. Three search/format queries passed, including ODT-only and medical-office/US-Letter filters. Twenty new-design transfers across PDF, Image, Word and ODT plus a repeat transfer matched their source bytes. Four actual browser-button downloads also matched their originals. All four formats of a design used one selection; after five distinct designs, the sixth correctly returned `SIGNUP_REQUIRED`. The asset host continued to reject originals and API paths, and noindex headers/empty sitemap were verified.
- Production Worker version: `e2a94957-38eb-4aba-97b0-39c477fc52c1`. Active search revision: `0a8b32e17fe8f7491d0350f61e1a6282cb201a4d3a633a80969849c7d304ccd3`. The first deployment preflight received a transient Cloudflare 7403 response; the same preflight succeeded on retry without bypassing any checks.

The resulting catalog has 1,546 designs and 3,808 original downloadable files. The public asset allowlist contains 553 objects. Noindex/noimageindex remains enabled; billing and administrator access remain disabled.

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

## Rubric, 30–60–90 day plans, and business continuity plans — November 8, 2026

- Published the previously supplied Rubric Templates package once (120 designs), plus 120 30–60–90 Day Plans and 130 Business Continuity Plans. The three collections provide 370 designs and 1,110 actual files: 370 DOCX, 370 WebP, 250 PDF, and 120 Google Docs HTML shortcuts. Existing full-length PDF/Word originals remain intact; each gallery preview shows the first page.
- Repaired a shared detail-page rendering bug: these plan types do not contain refrigerant measurement units, but the generic template fact panel attempted to render them. The Worker had consequently returned empty HTTP 200 bodies for 250 plan detail pages. The shared component now omits that irrelevant fact row for plan templates.
- All 1,600 R2 catalog objects were preflighted/read-back verified during intake; the full deployment preflight then matched production D1 file metadata for all 5,694 source-catalog entries, passed the complete 6,830-row FTS/search-release and trigger checks, and activated revision `1c5e6b171e2892b01f978a1c7f6dea791c625cb5dce2cbf10306f75eec293890` after deployment. Worker version: `515b9948-16ff-478d-afe4-d09f79ad4549`.
- Live audit after deployment: 370/370 design detail pages returned non-empty HTML with the correct titles, descriptions, download controls, and noindex headers; 740/740 public preview/thumbnail image bodies matched the expected SHA-256, byte size, and MIME (133,041,968 image bytes); all three gallery counts and download-control totals matched. Zero failures.
- Nine real signed downloads (PDF, Word, Image, and Google Docs shortcut formats available in the sample designs) matched source SHA-256, byte length, and MIME. One distinct selection per design used three guest selections. Searches for one design from each collection returned the expected design IDs. Production health reported 6,830 templates and billing disabled.
- Astro check: 0 errors, 0 warnings, 10 existing hints. Focused automated suite: 38 passed, 0 failed. Production build and guarded deployment passed. The live noindex policy and empty sitemap remain in place.

## Ten Frame collection — 14 November 2026

Published `/templates/ten-frame/` with 100 reviewed activities (50 standard, 50 color), 400 original downloads (PDF, Word, Excel, Image), and the supplied teacher guide. Source archive SHA-256: `2231bfc93d9e511d367075916f3d214c2f99fc9a229c55d3449e945a1d6b33d1`. All 502 R2 objects, including the complete archive, passed body checksum and size verification.

Reviewed 105 activity pages in each of PDF, Word, and Excel. Checked 2,424 PDF fields, 325 ten-frames, and all 650 Excel formulas and cached values. Every WebP matches the corresponding PDF first page. The existing topic record remains intact; new activities have distinct IDs. The final catalog/editorial test run passed all 29 tests, and Astro reported no errors or warnings.

Worker version `e1b1218c-0db0-4389-b6c5-4fb5be46dfa0`; active search has 7,030 records. Live verification checked all 100 detail pages, 100 thumbnails, 100 full-size Images, the guide, search in all four formats, and actual signed downloads in all four formats. The four formats consumed one selection for an isolated guest. UI checks passed at 375, 768, and 1440 pixels, including skill/orientation/color filters, reset, More/Less, zoom, and button alignment. Noindex remains enabled and billing remains disabled.


## Consortium Agreements — 2026-11-14

Published 100 source-reviewed designs (75 standard, 25 color), 300 source downloads, and 100 thumbnails. All 2,270 PDF and Word pages rendered with matching page counts; 22,727 PDF fields and 22,727 Word controls checked. First pages visually reviewed in both source previews and rendered Word; internal-page QA was automated. R2 verified 401 objects including immutable source ZIP. All 100 detail pages and 200 public image assets matched expected bytes; signed PDF, Word, and Image downloads matched source checksums. Filters, More, zoom, buttons, and overflow passed at 375/768/1440; 29 import tests passed. Worker f2fa28c1-f29f-46ba-b989-57a6d16c5047; active search 7,130. Noindex and billing-disabled preserved.


## Divorce Agreements — 2026-11-14

100 designs, 300 source downloads, 100 thumbnails, and a private source ZIP published. Complete PDF/Word documents retain 1,489 pages; all 13,914 PDF fields passed structure/bounds checks. Word uses native editable text, not content controls. All first-page previews and rendered Word first pages were visually reviewed; internal pages received automated QA. Five sample fill/save/reopen tests passed. All 100 live detail pages and 200 Image/thumbnail bytes verified, plus signed PDF/Word/Image downloads. UI tests passed at 375/768/1440; 29 import tests passed. Worker a556bb2f-ae04-4f3e-b5f7-102d1bb1b54a; search 7,230; noindex and billing-disabled retained.
