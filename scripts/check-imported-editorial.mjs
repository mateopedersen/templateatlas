import collections from '../src/data/imported-collections.json' with {type:'json'};
import {validateImportedEditorial} from '../src/lib/imported-editorial.mjs';
validateImportedEditorial(collections);
console.log(`Editorial checks passed for ${collections.reduce((n,c)=>n+c.items.length,0)} imported templates.`);
