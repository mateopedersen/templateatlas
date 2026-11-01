// Per-workspace development signing keys. This entry point binds only to loopback.
import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
const file = '.wrangler/local-development.json';
mkdirSync('.wrangler', { recursive: true });
if (!existsSync(file)) {
  const keys = Object.fromEntries(
    ['GUEST_COOKIE_SIGNING_KEY', 'DOWNLOAD_TOKEN_SECRET', 'AUTH_SECRET'].map(
      (name) => [name, randomBytes(32).toString('hex')],
    ),
  );
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600, flag: 'wx' });
}
const port = Number(process.env.PORT || 4321);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw Error('Invalid local port');
const localKeys = JSON.parse(readFileSync(file));
for (const k of ['LOCAL_MAILBOX_SECRET', 'RENDER_SECRET'])
  if (!localKeys[k]) localKeys[k] = randomBytes(32).toString('hex');
writeFileSync(file, JSON.stringify(localKeys), { mode: 0o600 });
const renderPort = String(Number(process.env.LOCAL_RENDER_PORT || 4892));
const python = process.env.TEMPLATEATLAS_PYTHON || 'python3';
const argsR = ['scripts/local-renderer.py', '--port', renderPort];
const renderer = spawn(python, argsR, {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, TEMPLATEATLAS_RENDER_SECRET: localKeys.RENDER_SECRET },
});
renderer.on('error', () =>
  console.error('The optional local format converter could not start.'),
);
const vars = {
  LOCAL_MAILBOX_ENABLED: 'true',
  LOCAL_RENDER_PORT: renderPort,
  ...localKeys,
  PUBLIC_SITE_URL: 'http://localhost:' + port,
  DEPLOY_STAGE: 'local',
};
const args = [
  'node_modules/wrangler/bin/wrangler.js',
  'dev',
  '--local',
  '--log-level',
  'error',
  '--test-scheduled',
  '--ip',
  '127.0.0.1',
  '--port',
  String(port),
  '--config',
  'dist/server/wrangler.json',
  '--persist-to',
  '.wrangler/state',
];
// Local development variables are read through the ignored Wrangler dev-vars file.
const devFile = 'dist/server/.dev.vars';
writeFileSync(
  devFile,
  Object.entries(vars)
    .map(([k, v]) => k + '=' + JSON.stringify(v))
    .join('\n'),
  { mode: 0o600 },
);
writeFileSync('.wrangler/preview.pid', String(process.pid), { mode: 0o600 });
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_LOG_PATH: '.wrangler/local.log',
  },
});
// Drive local maintenance only while this loopback development process is running.
const maintenance = setInterval(
  () =>
    fetch('http://localhost:' + port + '/__scheduled?cron=*/5+*+*+*+*', {
      signal: AbortSignal.timeout(45000),
    }).catch(() => {}),
  300000,
);
maintenance.unref();
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    renderer.kill(sig);
    child.kill(sig);
  });
child.on('exit', (code) => {
  renderer.kill('SIGTERM');
  try {
    if (readFileSync('.wrangler/preview.pid', 'utf8') === String(process.pid))
      unlinkSync('.wrangler/preview.pid');
  } catch {}
  process.exit(code ?? 1);
});
