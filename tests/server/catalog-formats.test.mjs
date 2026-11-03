import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFormat,formatMimes,createExport} from '../../src/server/documents.mjs';

test('ODT originals are downloadable without claiming personal ODT generation',async()=>{
 assert.doesNotThrow(()=>checkFormat('odt'));
 assert.equal(formatMimes.odt,'application/vnd.oasis.opendocument.text');
 await assert.rejects(createExport({},'actor',{documentId:'00000000-0000-4000-8000-000000000000',documentRevision:1,format:'odt'},'test'),error=>error.message==='FORMAT_UNAVAILABLE');
});

test('HTML shortcuts are catalog downloads, not personal document exports',async()=>{
 assert.doesNotThrow(()=>checkFormat('html'));
 assert.equal(formatMimes.html,'text/html');
 await assert.rejects(createExport({},'actor',{documentId:'00000000-0000-4000-8000-000000000000',documentRevision:1,format:'html'},'test'),error=>error.message==='FORMAT_UNAVAILABLE');
});
