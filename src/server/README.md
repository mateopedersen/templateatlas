# TemplateAtlas member services

The Worker mounts `handleApi(request, env, ctx, {renderDocument})` on member APIs and exports `DownloadActor`. The scheduled handler runs `resumePending(env)` at least every five minutes. Apply all D1 migrations, in order, to the intended environment. Deploy the SQLite-backed Durable Object migration before enabling downloads. Staging and production need separate resources and secrets.

## Service configuration

| Binding or secret | Purpose |
|---|---|
| `DB` | D1 member records, first verification timestamps, immutable asset metadata, billing inbox, document revisions, and operator audit |
| `ASSET_ORIGINALS` | Private R2 bucket for catalog files |
| `USER_DOCUMENTS` | Separate private R2 bucket for customer input and generated files |
| `DOWNLOAD_ACTORS` | SQLite Durable Object namespace for atomic reservations, grants, transfer state, trial and billing |
| `PUBLIC_SITE_URL` | Exact HTTPS origin of this deployment with no trailing slash |
| `AUTH_SECRET`, `GUEST_COOKIE_SIGNING_KEY`, `DOWNLOAD_TOKEN_SECRET` | Three independent high-entropy Worker secrets of at least 32 characters, shared only within one environment |
| `EMAIL_API_KEY`, `EMAIL_FROM` | Resend API credential and verified transactional sender. Enable delivery only for a domain the operator controls |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe API credential for the selected mode and signing secret for this environment’s webhook |
| `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL` | Explicit allowed recurring USD prices, retrieved from Stripe |
| `BILLING_LIVE_ENABLED` | Set to `true` only after approval of live prices, seller terms and provider setup |
| `ACCESS_ISSUER`, `ACCESS_AUD` | Exact Cloudflare Access team issuer and audience for the private admin application |
| `ADMIN_TOTP_KEYS` | Secret JSON object mapping individual authorized lowercase operator email addresses to independently generated Base32 authenticator seeds |

Use the deployment's Worker secrets manager. Keep R2 public access and development bucket URLs disabled. Set a Worker cron in each environment you operate. Never store real provider keys, test mail links, live ticket URLs, user inputs, or operator authenticator seeds in source control.

## Register a reviewed catalog release

The trusted private content pipeline writes immutable files with actual MIME and byte count, computes SHA-256, uploads with `customMetadata.sha256` and verifies the uploaded bytes before promotion. Store SHA-256 in the object’s native checksum as well when supported. Add a `downloadable_assets` row for each validated format. Required catalog fields are `id, template_id, version, format, object_key, sha256, size_bytes, filename, mime, published`. A new revision and actual format may share the logical template ID. The unique index admits one published catalog file per template/format. Switch versions inside one D1 batch after all bytes have passed private intake. Do not publish a personal export as a catalog file.

## Downloads and the trial

1. The client opens `GET /api/session` to establish a signed first-party guest cookie. Every request that changes state requires the exact allowed Origin.
2. Submit `POST /api/download-intents` with `{templateId,format}` or `{documentId,documentRevision,format}` and a unique Idempotency-Key. The server resolves the owner and file, verifies private R2 metadata, then reserves an actor slot for 120 seconds.
3. Fetch the returned same-origin URL using the same cookies. The Worker obtains the actual body, verifies its identity, checks the current authority at commit, and streams only after that transaction succeeds. Ranges, retries and alternate formats use one logical resource. The signed ticket cannot be used from a different actor. Cookie deletion or a separate device can create a new anonymous identity.
4. First verified email confirmation records a write-once UTC timestamp in D1 in the same transaction as the verification. The member's actor reconciles that timestamp, imports existing guest selections with an idempotent freeze/import protocol, and grants access for exactly 2,592,000 seconds. There is no Stripe subscription or automatic charge during the card-free trial. Expiration preserves permanent free selections.

A guest who signs out after transferring their browser identity must sign in again for further protected delivery on that identity. A customer can read saved drafts after their plan lapses. Storage and abuse controls are separate from permanent download grants. Fresh ticket admission is capped at 1,024 retained rows per actor across the one-day replay window. Reusing an unexpired ticket key and redeeming an existing ticket remain available at that limit; new keys return HTTP 429 until retained tickets age out. One actor may submit up to 40 write operations per minute. Password rechecks and admin authenticator attempts are limited to five per minute.

## Accounts and billing

Use Better Auth email/password routes under `/api/auth/`. Confirmation and reset links use the configured origin. The verification link initiates the trial. Profile settings accept a real IANA time zone. User email, document input, quota and ticket responses are private and uncacheable. For a native file export, save a typed document and immutable revision, request `POST /api/exports` with the document ID, revision, format, and Idempotency-Key, then use the returned download intent. Synchronous bounded renderers support the supplied invoice, tool and chart formats. Long-running Office conversion and a distributed render queue would need a separate worker.

Validate your live Resend sender in its dashboard and send a verification and reset message to an approved test recipient. Use Stripe test mode first. Configure Checkout with recurring USD prices and enable the Customer Portal for cancellations and payment updates. Subscribe the endpoint `/api/webhooks/stripe` to customer.subscription.created, updated and deleted, plus invoice.paid, payment_failed and payment_action_required. Webhook verification checks raw bytes and timestamp, then persists a replay-safe event record. Reconciliation retrieves the current customer subscription before changing access. Scheduled retries handle interrupted work. Checkout success URLs confer no payment entitlement. The server pins Stripe API version 2025-06-30.basil. Dispute, refund, tax and legal retention policies require owner decisions before an unrestricted commercial launch.

## Private administration

1. Configure a dedicated self-hosted Cloudflare Access application for the intended host and both `/admin/*` and `/api/admin/*`. Require MFA in the identity provider policy. Restrict membership to named operators. Configure the corresponding Access issuer and exact application audience in the Worker.
2. Provision an independent random authenticator seed of at least 160 bits per operator in the Worker secret and the operator's authenticator through a private channel. Rotate or remove the operator's entry to revoke access. Never copy shared admin secrets into a client bundle. The Worker validates the RS256 JWT against the pinned issuer's public keys and checks its audience, expiration, application type, subject and allowlisted email.
3. Visit `/admin/`, authenticate through Access, then enter a fresh authenticator code. The second factor unlocks management for up to ten minutes, bounded by the Access JWT's expiry. Reusing a previous code is rejected.
4. Use Catalog to inspect an existing release, suspend delivery or restore it with a reason. Restoration verifies the bytes and SHA-256 of every current format. Safe conditional writes reject stale operator actions. A delivery hold takes effect for downloads and dependent document exports. Publishing a brand-new template, changing public cards, and changing discovery metadata still go through the private release pipeline.
5. Jobs shows pending guest transfers, billing reconciliations and closures. Retry runs eligible maintenance and records the reason. Member support requires an exact email and a reason and exposes a limited profile. Audit shows the last 100 operations.

## Retention and recovery

Users can request a paginated archive of their current inputs under Account → Personal data. Reauthentication is required, and the archive excludes paid catalog binaries. Users can close their account by reauthenticating and explicitly confirming deletion. The request revokes sessions immediately and schedules private file cleanup and stopping plan renewals. A failure to reach Stripe keeps the closure pending for retry. Provider-side accounting records follow the operator’s legal and provider retention policies.

Inactive guest drafts enter deletion after seven days. Deleted documents are hidden immediately. After 24 hours, scheduled maintenance removes their private input and export objects, revisions, and corresponding metadata. User-owned drafts are not removed solely because a trial expires. On account closure the remaining account records are purged only after the billing and storage jobs finish. Backups require a separate, time-bounded retention schedule.

Back up D1, the private R2 files and the Durable Object entitlement data with environment-specific provider tools. Restore into an isolated account environment and match reviewed SHA-256 values before serving downloads. Restoring only D1 cannot restore a member's quota authority. Do not roll back entitlement storage independently while serving traffic. The custom restore procedure and production payment/email flows require an operational rehearsal. Never mirror private objects into a public repository.

## Tests

Run `node --test tests/server/policy.test.mjs` and `node --test tests/server/workerd.test.mjs`. The latter starts an isolated local workerd with D1, R2 and SQLite Durable Objects. It uses provider doubles for Resend, Stripe and Access key discovery. It exercises actual verification tokens, passwords, authenticated sessions, signed billing messages, JWT signatures, ephemeral TOTP, private export bytes, range requests and concurrent reservations. Passing local tests does not establish a live provider connection.

Reference: [Cloudflare Durable Object SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Better Auth email](https://better-auth.com/docs/concepts/email), [Stripe webhooks](https://docs.stripe.com/webhooks), [Resend API](https://resend.com/docs/api-reference/emails/send-email).

## Isolated local testing

For a loopback-only installation set `DEPLOY_STAGE=local`, `LOCAL_MAILBOX_ENABLED=true`, an independent `LOCAL_MAILBOX_SECRET` of at least 32 characters, and the exact loopback `PUBLIC_SITE_URL` in the private dev variables file. Apply all migrations to the local D1. Sign up with a fresh address ending in `@example.test`. The mail capture stays inside the isolated D1, encrypted with AES-GCM, with an hour-long expiry. Opening any other hostname or enabling this feature in staging or production does not expose the inbox.

From the repository, run `node scripts/open-local-inbox.mjs path/to/private.dev.vars`. The launcher opens a single-use owner link in your browser without printing it. Choose the captured message for your test address. The server consumes the local mail action once. No verification or reset URLs appear in the inbox list or console. A viewed reset link uses a URL fragment. The browser's operator cookie expires after ten minutes. Use `node scripts/verify-local-inbox.mjs path/to/private.dev.vars path/to/evidence.json` for a loopback signup, verification, trial boundary check and cleanup request on an ephemeral test account. Do not place the dev variables file in the public repository.

Contact requests are stored in D1 after the sender consents. Operators review and close them under Jobs. Delivery of a support email is separate from recording a support request. Closed requests are purged by scheduled maintenance after 90 days. Review open cases regularly. Collections are private to each verified account, with room for up to 1,000 saved template/collection pairs. Personal data downloads include these records and the selected IANA time zone.

### Local operator

Start the local preview once to initialize private workspace settings. From the repository run `node scripts/local-operator.mjs setup`. It generates two independent secrets, opens a private local enrollment file, and never prints the key. Add the displayed time-based setup key to your authenticator. Close the page and remove `.wrangler/local-authenticator-setup.html` after enrollment; keep your recovery secret in a private password manager. Restart local preview to load the new settings.

Run `node scripts/local-operator.mjs open` to sign in. A loopback-only, one-time owner link opens in the browser. Enter the current six-digit authenticator code on the admin dashboard. The owner session lasts 15 minutes, with an additional unlock lasting up to ten. This offline authority is rejected if the deployment stage, configured origin or request origin is not explicitly local and loopback. Cloudflare Access remains required for deployed administration.

### Account security and device review

Under Settings, Signed-in devices shows coarse browser/platform labels, session start times and the current session indicator. A member may revoke another selected session or sign out other sessions together. The browser receives opaque record IDs without any authentication bearer token. Email changes require approval at the old verified address followed by verification at the new address. The change keeps the original account and trial expiry. Both addresses in an isolated email capture must end in `@example.test`. Browser authentication callbacks and reset destinations are limited to the configured origin.

A member can duplicate their own document at its current immutable revision. The duplicate has a new document ID and independent future revisions. A derived document retains its original template and pinned source. Current owners alone may read, edit, delete, duplicate or export. A guest transfer or closure in progress prevents a later in-flight save from creating a private draft for the former owner.

### Checkout concurrency

Apply migration `0014_checkout_attempts.sql` before enabling a configured test or live Checkout integration. A verified user has one current purchase attempt in D1, with a pinned customer, plan price, origin, expiry, and Stripe idempotency key. Same-plan requests reopen the current Stripe session across tabs and hour boundaries. A deliberate plan change first confirms the previous session has expired. A compare-and-swap prevents racing plan switches from installing two attempts. The Worker recovers interrupted responses by matching its attempt metadata at Stripe. It refuses a new session when provider state is unavailable, pagination is incomplete, an old session's ownership is ambiguous, or a completed payment has not been reconciled to a conclusively ended subscription. An account closure also prevents new attempts and expires its pending checkout before stopping renewals. Use provider test mode to rehearse checkout, expiration, portal and webhook delivery before enabling real payments.

### Production transactional email

The local inbox is restricted to loopback and must be disabled in a public deployment. For Cloudflare Email Sending, first onboard the selected sender domain in the intended account and verify its DNS status. Set `EMAIL_PROVIDER=cloudflare`, `EMAIL_SENDING_DOMAIN` to that exact domain, and `EMAIL_FROM` to the approved bare sender address. Bind `send_email` as `TRANSACTIONAL_EMAIL`, optionally restricted by `allowed_sender_addresses`. Public signup requires a domain enabled for arbitrary recipients. Cloudflare documents this on the Workers Paid plan. Verified destinations alone support a closed test only. See the [Cloudflare setup guide](https://developers.cloudflare.com/email-service/get-started/send-emails/), [Workers email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [pricing](https://developers.cloudflare.com/email-service/platform/pricing/).

The existing Resend path accepts `EMAIL_PROVIDER=resend`, a verified `EMAIL_FROM` and `EMAIL_API_KEY`. A legacy deployment containing the Resend settings and no provider selection retains that behavior. The application uses the selected provider only and reports an unavailable service if it receives no acceptance ID. Acceptance is not proof of inbox delivery. A rejected verification message cannot start a trial. Cloudflare's provider activity and bounce/suppression metrics are the operator's source for delivery outcomes.

For network-based email, five mail-triggering requests per normalized recipient per 15-minute window are allowed across sign-up, explicit verification resend, password reset and email-address changes. This request budget is checked even when no matching account exists. A second budget permits up to eight actual delivery attempts per recipient per 15 minutes across all auth callbacks. HMAC identifiers, rather than email addresses, are stored in the rate-limit ledger. Auth endpoint per-IP limits remain in force. These limits concern account mail only. Configure Cloudflare usage alerts and observe account-wide quotas before public signup traffic ramps up.
