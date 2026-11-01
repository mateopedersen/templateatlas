import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('converter is private and the image build context is allowlisted',async()=>{
 const base=new URL('../',import.meta.url),cfg=JSON.parse(await readFile(new URL('wrangler.json',base),'utf8'));assert.equal(cfg.workers_dev,false);assert.equal(cfg.preview_urls,false);assert.equal(cfg.routes,undefined);assert.equal(cfg.containers[0].max_instances,1);assert.equal(cfg.containers[0].image_build_context,'./image');
 const globs=(await readFile(new URL('image/.dockerignore',base),'utf8')).trim().split(/\r?\n/);assert.deepEqual(globs,['*','!Dockerfile','!renderer_impl.py','!container_server.py','!input_policy.py','!locked_exec.py']);
});
