import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { rasterSize } from '../../src/lib/raster.mjs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const run = process.env.TEMPLATEATLAS_RENDERER_TEST === '1';
test(
  'workerd sends a private chart revision to the authenticated local renderer',
  { skip: !run, timeout: 90000 },
  async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url)),
      secret = randomBytes(30).toString('hex'),
      listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise((r) => listener.close(r));
    const py = spawn(
      process.env.TEMPLATEATLAS_PYTHON ?? 'python3',
      ['scripts/local-renderer.py', '--port', String(port)],
      {
        cwd: root,
        env: { ...process.env, TEMPLATEATLAS_RENDER_SECRET: secret },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let mf;
    try {
      await Promise.race([
        once(py.stdout, 'data').then(([line]) =>
          assert.match(String(line), /ready on loopback/),
        ),
        once(py, 'exit').then(() => {
          throw Error('The local renderer did not start.');
        }),
      ]);
      const bundle = await build({
        stdin: {
          contents: `import {convertPrivate} from './src/native/renderer.mjs';import {renderChartSvg} from './src/charts/render.mjs';import {initial} from './src/charts/model.mjs';
   export default {async fetch(req,env){if(new URL(req.url).searchParams.has('probe')){try{const resp=await fetch('http://127.0.0.1:'+env.LOCAL_RENDER_PORT+'/health',{headers:{authorization:'Bearer '+env.RENDER_SECRET}});return new Response('health '+resp.status);}catch(e){return new Response('probe: '+e.message);}}const d=initial('line-chart');d.title='Support hours';d.revision=3;const {bytes,mime}=await convertPrivate(env,new TextEncoder().encode(renderChartSvg(d)),'svg',new URL(req.url).searchParams.get('format'));return new Response(bytes,{headers:{'content-type':mime}});}}`,
          resolveDir: root,
        },
        platform: 'browser',
        bundle: true,
        format: 'esm',
        write: false,
      });
      mf = new Miniflare(
        convertV4MiniflareOptions({
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: '2026-10-01',
          bindings: {
            PUBLIC_SITE_URL: 'http://localhost:4321',
            DEPLOY_STAGE: 'local',
            LOCAL_RENDER_PORT: String(port),
            RENDER_SECRET: secret,
          },
        }),
      );
      for (const fmt of ['pdf', 'jpg', 'preview-jpg']) {
        const res = await mf.dispatchFetch(
          'http://localhost:4321/?format=' + fmt,
        );
        if (res.status !== 200) {
          const diagnostic = await (
            await mf.dispatchFetch('http://localhost:4321/?probe=1')
          ).text();
          assert.fail(
            'Renderer response ' +
              res.status +
              '; ' +
              diagnostic +
              '; ' +
              (await res.text()).slice(0, 550),
          );
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (fmt === 'pdf')
          assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
        else {
          assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
          const { width, height } = rasterSize(bytes);
          if (fmt === 'preview-jpg') assert.ok(Math.max(width, height) <= 480);
          else assert.equal(Math.max(width, height), 1800);
        }
      }
    } finally {
      if (mf) await mf.dispose();
      py.kill('SIGTERM');
    }
  },
);
