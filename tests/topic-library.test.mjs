import test from 'node:test';
import assert from 'node:assert/strict';
import { entries, topicEntries } from '../src/lib/catalog.mjs';

test('library has one card for each available topic, including imported collections', () => {
  const topics = topicEntries(entries);
  assert.equal(topics.length, new Set(entries.map(entry => entry.topic_path)).size);
  for (const path of ['/templates/acknowledgment-receipt/', '/templates/snow-removal-contract/']) {
    const matches = topics.filter(entry => entry.topic_path === path);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].importedCollection, undefined);
  }
});

test('topic representative prefers its main entry and supports imported-only topics', () => {
  const design = { id: 'design', topic_path: '/templates/example/', importedCollection: 'example' };
  const topic = { id: 'topic', topic_path: design.topic_path };
  assert.equal(topicEntries([design, topic])[0].id, 'topic');
  const fallback = topicEntries([design])[0];
  assert.equal(fallback.topic_path, design.topic_path);
  assert.equal(fallback.importedCollection, undefined);
});
