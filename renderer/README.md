# Private document renderer

A separate, service-binding-only Worker routes authenticated document bytes to one Linux container. The existing application keeps originals and user documents in private storage. This service has no R2, D1, email, billing, or account credentials.

The gateway accepts the application’s existing render contract at `https://private-renderer.internal/v1/render`. It verifies the bearer secret before waking a container. The fixed Durable Object starts with outbound Internet disabled and a two-minute inactivity timeout. The image runs one conversion at a time as UID 10001. Each request uses a temporary office profile and files. The converter child receives a restricted environment and process limits. A Linux seccomp filter denies IP sockets, including loopback, while allowing Unix sockets for LibreOffice. The HTTP server remains reachable through the private container port. Container transport authentication uses a derived token separate from the application secret.

## Operator prerequisites

Use a Cloudflare account with Containers access and an approved Workers billing plan. Verify the target account before rollout. The frontend and renderer Worker names must be distinct. The configuration here creates `templateatlas-private-renderer`. Keep the previous tested image digest for rollback.

## Build with Workers Builds

Connect a distinct renderer Worker to the source repository. Use the repository root, a build command of `npm ci && node renderer/prepare-image.mjs`, and a production-branch deploy command of `npx --no-install wrangler deploy --config renderer/wrangler.json`. The configured Docker context contains just the Python runtime files. Wrangler stages the reviewed local converter automatically. The application repository’s primary Astro deploy continues to use its own configuration.

The production-branch Workers Builds environment supports Dockerfile image builds. The default nonproduction command `wrangler versions upload` does not build or roll out an image. Use a separate staging Worker for a full staging rollout. A Worker deployment can succeed before container image rollout has completed. Verify a conversion through the actual application service binding. [Cloudflare deployment guide](https://developers.cloudflare.com/containers/guides/deploy/)

## Build with a GitHub-hosted runner

Run **Build private renderer image** manually at the approved commit on the default branch. The workflow has read-only repository permissions and needs no Cloudflare secrets. It checks out the renderer sources, builds Linux AMD64, verifies the seccomp network rule, starts a network-isolated, non-root, read-only container, exercises the private HTTP service, and saves the tested Docker image. The artifact `templateatlas-renderer-amd64-<full-commit>` expires after one day. It contains the image, its checksum, its configuration digest, and the source revision. Do not place customer data or premium files in the build context. [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

Download the artifact for the successful workflow run through GitHub Actions and extract it to a private directory. Verify it before transferring. Run from the repository root, substituting the approved commit and account.

```sh
python3 renderer/transfer-image.py "$ARTIFACT_DIRECTORY" --commit "$COMMIT"
python3 renderer/transfer-image.py "$ARTIFACT_DIRECTORY" --commit "$COMMIT" \
  --push --account "$CLOUDFLARE_ACCOUNT_ID" --node "$NODE_BIN" --crane "$CRANE_BIN"
```

The transfer helper checks the compressed archive digest, commit, tag, architecture, non-root UID, and image configuration digest. Push mode requests short-lived pull/push credentials using the existing authorized Wrangler session. It sends the password to crane on stdin. The temporary registry configuration and Wrangler debug log are removed at exit. The final output is a digest-pinned `registry.cloudflare.com` reference. A Docker daemon is unnecessary on the transfer workstation. [Cloudflare managed-registry credentials](https://developers.cloudflare.com/workers/wrangler/commands/containers/) · [crane](https://github.com/google/go-containerregistry/tree/main/cmd/crane)

Select the printed reference and deploy the separate service.

```sh
node renderer/select-image.mjs "$VERIFIED_REGISTRY_REFERENCE"
npx --no-install wrangler deploy --config renderer/wrangler.image.json
```

Keep the explicit config argument. This prevents the main Astro-generated Wrangler configuration from being selected. Direct GHCR references are outside Cloudflare’s currently documented list of external image registries. The transfer procedure uses the Cloudflare-managed registry. [Image management](https://developers.cloudflare.com/containers/guides/image-management/)

## Connect and verify

1. Set the same strong `RENDER_SECRET` on the renderer Worker and the intended application environment using the appropriate secret UI or interactive `wrangler secret put`. Use the chosen renderer config for the renderer secret and the existing app config for the app secret. Never store the value in Git, image layers, build arguments, or logs.
2. Add a service binding on the intended application environment with binding name `PRIVATE_RENDERER` and service `templateatlas-private-renderer`. For first-page thumbnails, explicitly set `PRIVATE_PREVIEW_ENABLED` to `true` on that application environment. Apply through its normal build/deploy pipeline. Keep the renderer’s public routes, workers.dev URL and preview URLs disabled.
3. In the private test environment, edit a source-backed Word file, save it, and prepare the edited PDF. Open the real file, confirm the changed text and US Letter layout, then request the first-page preview. Confirm it is watermarked, at most 480 pixels, owner-only, and does not consume a download selection. Repeat with an Excel workbook, presentation and chart. Check a request after the idle window to verify cold start.
4. Check image and deployment state with `wrangler containers list` and `wrangler containers images list` in the intended account. Retain the verified image digest and Worker deployment identifier. To revert the converter, select the previous image digest and deploy the renderer configuration again. If needed, remove the application binding and preview flag through its normal release process.

The Worker bundle may be verified without rolling out a local container using `wrangler deploy --config renderer/wrangler.json --dry-run --containers-rollout=none`. This checks bundling and configuration only. The image workflow checks the actual Linux runtime. Native template fonts available on macOS and Debian can differ, so check representative production output after the first Linux rollout. [Durable Object Container API](https://developers.cloudflare.com/containers/api/durable-object-container/) · [Instance limits](https://developers.cloudflare.com/containers/platform/limits/) · [Pricing](https://developers.cloudflare.com/containers/platform/pricing/)

## Anonymous release smoke test

After the main application binding, secrets, source catalog, and preview setting are active, run the following from the repository root with Python, pypdf and Pillow. This intentionally visits the real application and spends one selection on a new guest session.

```sh
python3 renderer/smoke-release.py --origin https://templateatlas.com --run --report "$QA_DIRECTORY/live-renderer.json"
```

The script creates a small chart, checks personalized text and page dimensions in the downloaded PDF, opens the JPEG, and checks quota across both formats. It then previews two saved revisions of an appreciation certificate, checks that the cached revision is byte-identical and that another guest receives a 404, and marks its two test documents for deletion. The report contains checksums, dimensions, timings, and pass/fail results. It omits private document identifiers, cookies, tickets and personal data. An operator can use the same command against an explicit loopback origin before the live run.
