import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatStore } from '../src/lib/core.js';
import { restoreMessage } from '../src/lib/message-text.js';
import { EventLog } from '../src/lib/event-log.js';
import { LocalData, exportText } from '../src/lib/local-data.js';

const cases = [
  ['join', {}, 'er kommet ind', 'joined the room'],
  ['quit', {}, 'har forladt chatten', 'left the chat'],
  ['part', { room: { id: 53, name: 'X-perten' } }, 'er gået til X-perten', 'moved to X-perten'],
  ['part', {}, 'er gået til et andet rum', 'moved to another room'],
  [
    'room',
    { room: { id: 12, name: 'Torvet' } },
    'Velkommen til Torvet · 12',
    'Welcome to Torvet · 12',
  ],
  ['room', {}, 'Velkommen til rummet', 'Welcome to the room'],
  [
    'log',
    { event: 'panic', users: [{ name: 'Mod' }] },
    'Panic aktiveret af Mod',
    'Panic activated by Mod',
  ],
  ['log', { event: 'panic', users: [] }, 'Panic deaktiveret', 'Panic deactivated'],
  [
    'priv',
    { from: { name: 'Alma' }, to: { name: 'Nova' }, text: 'Hej, er kommet ind' },
    'hvisker: Hej, er kommet ind',
    'whispers: Hej, er kommet ind',
  ],
  [
    'priv',
    { from: { name: 'Nova' }, to: { name: 'Alma' }, text: 'Hej' },
    'til Alma: Hej',
    'to Alma: Hej',
  ],
];

function example(type, extra = {}) {
  return { me: { name: 'Nova' }, user: { name: 'Alma' }, time: 1700000000000, type, ...extra };
}

test('Danish chat events preserve existing message identities and restore saved English events', () => {
  for (const [type, extra, expected, englishText] of cases) {
    const store = new ChatStore();
    store.setTabs(['Nova']);
    const message = store.add(example(type, extra));
    assert.equal(message.text, expected);
    assert.equal(JSON.parse(message.key)[3], expected);
    assert.equal(restoreMessage({ ...message, text: englishText }).text, expected);
    assert.equal(store.add(example(type, extra)), null);
  }
});

test('restored event logs and bookmarks stay compatible with replays and exports', () => {
  const store = new ChatStore();
  store.setTabs(['Nova']);
  const current = store.add(example('join', { log: true }));
  const legacy = { ...current, text: 'joined the room' };
  const values = new Map([
    ['acidum-events-one', JSON.stringify([legacy])],
    ['acidum-local-one', JSON.stringify({ saved: [legacy], drafts: [['Nova', 'Min kladde']] })],
  ]);
  const disk = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const log = new EventLog(disk, 'one');
  const saved = new LocalData(disk, 'one');
  assert.equal(log.rows[0].text, 'er kommet ind');
  log.capture([current]);
  assert.equal(log.rows.length, 1);
  assert.equal(saved.isSaved(current), true);
  assert.equal([...saved.saved.values()][0].text, 'er kommet ind');
  assert.equal(saved.draft('Nova'), 'Min kladde');
  assert.ok(exportText(log.rows).includes('Alma: er kommet ind'));
  saved.toggleSaved(current);
  assert.equal(saved.saved.size, 0);
});

test('received message text is never translated, including text that looks like a system event', () => {
  for (const text of ['joined the room', 'Panic deactivated', 'Hej Søren!']) {
    const original = { type: 'text', text };
    assert.equal(restoreMessage(original), original);
    const store = new ChatStore();
    store.setTabs(['Nova']);
    assert.equal(store.add(example('text', { text })).text, text);
  }
});
