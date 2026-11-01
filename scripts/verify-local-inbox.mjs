// Operates only against an explicit loopback capture environment and an isolated test recipient.
// Usage: node scripts/verify-local-inbox.mjs path/to/.dev.vars [evidence.json]
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHmac, createHash, randomBytes, randomUUID } from 'node:crypto';
const env = parseEnv(await readFile(process.argv[2] || '.dev.vars', 'utf8')),
  base = new URL(env.PUBLIC_SITE_URL);
if (
  env.DEPLOY_STAGE !== 'local' ||
  env.LOCAL_MAILBOX_ENABLED !== 'true' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
  !env.LOCAL_MAILBOX_SECRET?.length
)
  throw Error('Requires the explicit, isolated local capture configuration.');
const jar = new Map(),
  email = 'qa-' + randomUUID() + '@example.test',
  password = randomBytes(32).toString('hex');
async function call(path, data, method = data ? 'POST' : 'GET') {
  const r = await fetch(new URL(path, base), {
    method,
    redirect: 'manual',
    headers: {
      origin: base.origin,
      'content-type': 'application/json',
      cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  for (const cookie of r.headers.getSetCookie()) {
    const pair = cookie.split(';')[0],
      i = pair.indexOf('='),
      k = pair.slice(0, i),
      v = pair.slice(i + 1);
    if (v) jar.set(k, v);
    else jar.delete(k);
  }
  if (!r.ok)
    throw Error(
      'Local check failed on ' + path.split('?')[0] + ' (' + r.status + ').',
    );
  return r.json();
}
const pre = await call('/api/session');
if (pre.localTestInbox !== true || pre.user !== null)
  throw Error('Expected isolated guest session.');
const exp = Math.floor(Date.now() / 1000) + 90,
  nonce = randomUUID(),
  sig = createHmac('sha256', env.LOCAL_MAILBOX_SECRET)
    .update('unlock|' + exp + '|' + nonce)
    .digest('hex');
await call('/api/dev/mailbox/unlock', { token: exp + '.' + nonce + '.' + sig });
await call('/api/auth/sign-up/email', {
  name: 'Local QA Reader',
  email,
  password,
  callbackURL: base.origin + '/account/',
});
const box = await call('/api/dev/mailbox/messages'),
  message = box.messages.find(
    (m) => m.to === email && m.subject.includes('Verify'),
  );
if (!message || message.text.includes('token='))
  throw Error('Expected a sanitized local verification message.');
await call('/api/dev/mailbox/open', { id: message.id });
const verified = await call('/api/session');
if (
  verified.user?.email !== email ||
  !verified.user.verified ||
  !verified.premium ||
  Math.abs(verified.trialEndsAt - Math.floor(Date.now() / 1000) - 2592000) > 15
)
  throw Error('Verified session or UTC trial did not match policy.');
let deliveryAudit = null;
if (process.argv.includes('--full-library')) {
  const { entries } = await import('../src/lib/catalog.mjs');
  const tasks = entries.flatMap((e) =>
    Object.entries(e.assets).map(([format, file]) => ({
      id: e.id,
      format,
      file,
    })),
  );
  let at = 0,
    verified = 0,
    bytesRead = 0;
  const failed = [];
  const cookie = [...jar].map(([k, v]) => k + '=' + v).join('; ');
  async function next() {
    for (;;) {
      const task = tasks[at++];
      if (!task) return;
      try {
        const r = await fetch(new URL('/api/download-intents', base), {
          method: 'POST',
          headers: {
            origin: base.origin,
            cookie,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({ templateId: task.id, format: task.format }),
        });
        if (!r.ok) throw Error('intent ' + r.status);
        const { url } = await r.json();
        if (!url.startsWith('/api/downloads/')) throw Error('ticket target');
        const d = await fetch(new URL(url, base), { headers: { cookie } }),
          bytes = new Uint8Array(await d.arrayBuffer());
        if (
          d.status !== 200 ||
          d.headers.get('content-type') !== task.file.mime ||
          bytes.length !== task.file.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== task.file.sha256
        )
          throw Error('delivered content mismatch');
        verified++;
        bytesRead += bytes.length;
      } catch (err) {
        failed.push({ id: task.id, format: task.format, reason: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, next));
  deliveryAudit = {
    logicalTemplates: entries.length,
    expectedFiles: tasks.length,
    verified,
    bytesRead,
    failed,
  };
}
await call('/api/account', { password, confirm: 'DELETE' }, 'DELETE');
const after = await call('/api/session');
if (after.user !== null)
  throw Error('Expected local QA session to be revoked.');
const results = {
  testedAt: new Date().toISOString(),
  origin: base.origin,
  isolatedLocalMailCapture: true,
  persistentGuestSession: true,
  realEmailVerificationTokenConsumed: true,
  sanitizedMailboxPreview: true,
  verifiedTrialSeconds: 2592000,
  localTestAccountClosureRequested: true,
  sessionRevoked: true,
  externalEmailDeliveryTested: false,
  deliveryAudit,
};
if (process.argv[3])
  await writeFile(process.argv[3], JSON.stringify(results, null, 2) + '\n');
console.log(
  JSON.stringify({
    ...results,
    deliveryAudit: deliveryAudit
      ? { ...deliveryAudit, failed: deliveryAudit.failed.slice(0, 5) }
      : null,
  }),
);
if (deliveryAudit?.failed.length) process.exitCode = 1;
