// Opens a one-time loopback URL. Do not print it to a terminal or saved log.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
const file = process.argv[2] || '.dev.vars',
  env = parseEnv(await readFile(file, 'utf8'));
const origin = new URL(env.PUBLIC_SITE_URL),
  secret = env.LOCAL_MAILBOX_SECRET;
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
  env.DEPLOY_STAGE !== 'local' ||
  env.LOCAL_MAILBOX_ENABLED !== 'true' ||
  !secret ||
  secret.length < 32
)
  throw Error('Configure the isolated local test inbox first.');
const exp = Math.floor(Date.now() / 1000) + 90,
  nonce = randomUUID(),
  signature = createHmac('sha256', secret)
    .update('unlock|' + exp + '|' + nonce)
    .digest('hex');
const url = new URL('/api/dev/mailbox', origin);
url.hash = exp + '.' + nonce + '.' + signature;
if (!['darwin', 'linux'].includes(process.platform))
  throw Error('This local launcher supports macOS and Linux.');
const child = spawn(
  process.platform === 'darwin' ? 'open' : 'xdg-open',
  [url.href],
  { stdio: 'ignore' },
);
await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (c) =>
    c === 0
      ? resolve()
      : reject(new Error('The local inbox could not be opened.')),
  );
});
console.log('Opened the local test inbox.');
