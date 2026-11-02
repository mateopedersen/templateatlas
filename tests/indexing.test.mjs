import test from 'node:test';
import assert from 'node:assert/strict';
import { withNoIndex } from '../src/lib/indexing.mjs';

test('indexing directive preserves resource content, status and existing headers', async () => {
  for (const mime of ['text/html', 'image/webp', 'application/pdf']) {
    const original = new Response('example bytes', {status: 200, headers: {'Content-Type': mime, 'Cache-Control': 'public, max-age=3600'}});
    const result = withNoIndex(original);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('x-robots-tag'), 'noindex, noimageindex');
    assert.equal(result.headers.get('content-type'), mime);
    assert.equal(result.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal(await result.text(), 'example bytes');
  }
});
