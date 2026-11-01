import {readFile,writeFile} from 'node:fs/promises';
const image=process.argv[2];
if(!/^registry\.cloudflare\.com\/[a-f0-9]{32}\/templateatlas-renderer(?:@sha256:[a-f0-9]{64}|:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$/.test(image??''))throw Error('Supply the verified TemplateAtlas registry reference.');
const config=JSON.parse(await readFile(new URL('./wrangler.json',import.meta.url),'utf8'));
delete config.build;delete config.containers[0].image_build_context;config.containers[0].image=image;
await writeFile(new URL('./wrangler.image.json',import.meta.url),JSON.stringify(config,null,2)+'\n');console.log('Created private-renderer configuration for the prebuilt registry image.');
