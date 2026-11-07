import collections from '../src/data/imported-collections.json' with {type:'json'};
import {validateImportedEditorial} from '../src/lib/imported-editorial.mjs';
const reviewedCollections = collections.filter((collection) => !collection.preservedProduction);
validateImportedEditorial(collections);
console.log(`Editorial checks passed for ${reviewedCollections.reduce((n,c)=>n+c.items.length,0)} source-reviewed imports; ${collections.filter(c=>c.preservedProduction).reduce((n,c)=>n+c.items.length,0)} existing production records remain marked as preserved.`);
