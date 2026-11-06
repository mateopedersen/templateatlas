import seeds from '../data/seeds.json' with { type: 'json' };
import catalog from '../data/release.json' with { type: 'json' };
import categories from '../data/categories.json' with { type: 'json' };
import baseRoutes from '../data/routes.json' with { type: 'json' };
import { importedEntries } from './imported.mjs';
const routes = {...baseRoutes, ...Object.fromEntries(importedEntries.map(e=>[e.detail_path,'template_detail']))};
export { categories, routes };
const releases = new Map(catalog.map((r) => [r.id, r]));
const baseEntries = seeds.flatMap((seed) => {
  const release = releases.get(seed.seed_id);
  return release ? [{ ...seed, ...release }] : [];
});
const uniqueEntries = new Map(baseEntries.map((entry) => [entry.id, entry]));
for (const entry of importedEntries) uniqueEntries.set(entry.id, entry);
export const entries = [...uniqueEntries.values()];
// The library's top level lists each topic once. Individual imported designs
// remain available on their topic and detail pages.
export function topicEntries(availableEntries) {
  const topics = new Map();
  for (const entry of availableEntries) {
    const existing = topics.get(entry.topic_path);
    if (!existing || (existing.importedCollection && !entry.importedCollection)) {
      topics.set(entry.topic_path, entry);
    }
  }
  return [...topics.values()].map((entry) =>
    entry.importedCollection ? { ...entry, importedCollection: undefined } : entry,
  );
}
export const topicGroups = new Map();
export const byPath = new Map();
for (const entry of entries) {
  if (!topicGroups.has(entry.topic_path)) topicGroups.set(entry.topic_path, []);
  topicGroups.get(entry.topic_path).push(entry);
  if (!byPath.has(entry.topic_path)) byPath.set(entry.topic_path, entry);
  byPath.set(entry.detail_path, entry);
}
export const display = (s) =>
  s.replace(
    /Business Commerce|Charts Graphs|Education Academic|Design Creative|Food Cooking|Health Medical|Construction Maintenance|Games Entertainment|Home Lifestyle|Music Instruments|Vehicles Transportation|Sports Recreation|Invoices Payments|Contracts Agreements|Marketing Sales|Business Plans Reports|Letters Correspondence|Certificates Licenses/g,
    (m) => m.replace(/ (\S+)$/, ' & $1'),
  );
export function categoryItems(cat) {
  const members = new Set(cat.members);
  return entries.filter(
    (s) =>
      (!cat.exact && s.primary_category_path === cat.path) ||
      members.has(s.seed_id),
  );
}
export function search(query, format, group) {
  const normalize = (s) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const q = normalize(query.slice(0, 160)),
    term =
      {
        nda: 'non disclosure agreement',
        cv: 'curriculum vitae',
        invocie: 'invoice',
      }[q] || q;
  const pool = group
    ? categoryItems(categories.find((c) => c.path === group) || { members: [] })
    : entries;
  if (query.trim() && !q) return [];
  return pool
    .filter((s) => !format || s.formats.includes(format))
    .map((s) => {
      const title = normalize(s.display_title),
        text = title + ' ' + normalize(s.summary);
      const score =
        term === title
          ? 100
          : term && title.includes(term)
            ? 50
            : term.split(' ').every((w) => text.includes(w))
              ? 10
              : 0;
      return { s, score };
    })
    .filter((x) => x.score)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.s.display_title.localeCompare(b.s.display_title, 'en-US'),
    )
    .map((x) => x.s);
}
