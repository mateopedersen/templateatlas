// One-time enrollment and short-lived local operator sign-in. Neither command prints keys or tokens.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { base32 } from '@better-auth/utils/base32';
const mode = process.argv[2],
  dir = resolve('.wrangler'),
  settings = dir + '/local-development.json';
async function open(url) {
  if (!['darwin', 'linux'].includes(process.platform))
    throw Error('This launcher supports macOS and Linux.');
  const proc = spawn(
    process.platform === 'darwin' ? 'open' : 'xdg-open',
    [url],
    { stdio: 'ignore' },
  );
  await new Promise((res, rej) => {
    proc.on('error', rej);
    proc.on('exit', (code) =>
      code === 0 ? res() : rej(Error('Could not open local browser.')),
    );
  });
}
if (mode === 'setup') {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  let env;
  try {
    env = JSON.parse(await readFile(settings, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT')
      throw Error(
        'Start the local preview once to initialize its private settings, then run setup.',
      );
    throw e;
  }
  if (env.LOCAL_ADMIN_TOTP_SEED)
    throw Error(
      'Local administrator is already enrolled. Use the open command.',
    );
  const seed = base32.encode(randomBytes(20), { padding: false });
  Object.assign(env, {
    LOCAL_ADMIN_ENABLED: 'true',
    LOCAL_ADMIN_ISSUER_SECRET: randomBytes(32).toString('hex'),
    LOCAL_ADMIN_TOTP_SEED: seed,
  });
  const name = dir + '/local-authenticator-setup.html';
  const html =
    '<!doctype html><html lang="en-US"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;"><title>Local authenticator setup</title><h1>Set up the local operator authenticator</h1><p>Add a time-based entry named TemplateAtlas Local Operator in your authenticator app. Enter this private setup key, using six digits and a 30-second period.</p><code>' +
    seed +
    '</code><p>Store a recovery copy privately. Close this page and remove the enrollment file when finished. Restart the local preview, then run the local operator open command.</p>';
  await writeFile(name, html, { mode: 0o600, flag: 'wx' });
  const tmp = settings + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(env), { mode: 0o600, flag: 'wx' });
  await rename(tmp, settings);
  await open(pathToFileURL(name).href);
  console.log(
    'Opened the private authenticator enrollment page. Restart local preview after enrollment.',
  );
} else if (mode === 'open') {
  const env = parseEnv(
      await readFile(process.argv[3] || 'dist/server/.dev.vars', 'utf8'),
    ),
    u = new URL(env.PUBLIC_SITE_URL);
  if (
    env.DEPLOY_STAGE !== 'local' ||
    env.LOCAL_ADMIN_ENABLED !== 'true' ||
    env.LOCAL_ADMIN_ISSUER_SECRET?.length < 32 ||
    !env.LOCAL_ADMIN_ISSUER_SECRET ||
    !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  )
    throw Error(
      'Set up local administration and restart the loopback preview first.',
    );
  const exp = Math.floor(Date.now() / 1000) + 90,
    id = randomUUID(),
    mac = createHmac('sha256', env.LOCAL_ADMIN_ISSUER_SECRET)
      .update('login|' + u.origin + '|' + exp + '|' + id)
      .digest('hex');
  const target = new URL('/api/dev/operator', u);
  target.hash = [exp, id, mac].join('.');
  await open(target.href);
  console.log(
    'Opened a single-use local operator link. Enter your authenticator code to unlock administration.',
  );
} else
  throw Error(
    'Usage: node scripts/local-operator.mjs setup | open [private-dev-vars-file]',
  );
