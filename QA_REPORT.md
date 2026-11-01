# Local release verification

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

The owner handoff includes a separate, condition-by-condition review of the 136 acceptance scenarios. Passing local checks does not establish live production status. The public domain, managed production Worker, external verification email, actual provider checkout, production observability and production recovery still require release validation. Live payment prices and business/legal information have not been supplied. No Canva or native Adobe integration is advertised.
