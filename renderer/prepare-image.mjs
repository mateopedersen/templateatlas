import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// The Docker context contains only the runtime and the approved local converter.
const bytes=await readFile(new URL('../scripts/local-renderer.py',import.meta.url));
await writeFile(new URL('./image/renderer_impl.py',import.meta.url),bytes);
console.log('Converter implementation SHA-256 '+createHash('sha256').update(bytes).digest('hex'));
