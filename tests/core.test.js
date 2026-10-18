import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChatStore,
  parseToken,
  retryDelay,
  needsAttention,
  messageAttention,
} from '../src/lib/core.js';
const event = (i, name = 'Test') => ({
  type: 'text',
  me: { name },
  user: { name: 'Guest' },
  text: `message ${i}`,
  time: 1700000000000 + i,
});
test('tokens accept the official link and reject other hosts, missing tokens and arbitrary URL strings', () => {
  assert.equal(
    parseToken('https://acium.app/chat?token=example_token_123#log'),
    'example_token_123',
  );
  for (const link of [
    'https://evil.test/chat?token=example_token_123',
    'https://acium.app.evil.test/chat?token=example_token_123',
    'https://acium.app/chat',
    'javascript:alert(1)',
    'short',
  ])
    assert.throws(() => parseToken(link));
});
test('long sessions retain a bounded history, deduplicate replays, and resume from newest timestamp', () => {
  const s = new ChatStore(700);
  s.setTabs(['Test']);
  for (let i = 0; i < 20000; i++) s.add(event(i));
  assert.equal(s.tab('Test').messages.length, 700);
  assert.equal(s.tab('Test').keys.size, 700);
  assert.equal(s.tab('Test').lastLine, event(19999).time);
  assert.equal(s.add(event(19999)), null);
  assert.equal(s.tab('Test').messages[0].text, 'message 19300');
});
test('accounts stay separate, chronological overview and filters work, disconnected tabs are discarded', () => {
  const s = new ChatStore();
  s.setTabs(['Test', 'Other']);
  s.add(event(2));
  s.add({ ...event(1, 'Other'), notify: true });
  assert.deepEqual(
    s.messages('').map((e) => e.account),
    ['Other', 'Test'],
  );
  assert.equal(s.messages('', true).length, 1);
  assert.equal(s.messages('Test', false, 'MESSAGE 2').length, 1);
  assert.equal(s.messages('Other', false, 'no match').length, 0);
  s.setTabs(['Test']);
  assert.equal(s.tabs.size, 1);
  assert.equal(s.add(event(3, 'Other')), null);
});
test('malformed and unsupported messages are ignored, user text stays plain text', () => {
  const s = new ChatStore();
  s.setTabs(['Test']);
  for (const value of [
    null,
    {},
    { ...event(1), time: 'bad' },
    { ...event(1), time: 1e30 },
    { ...event(1), type: 'unknown' },
  ])
    assert.equal(s.add(value), null);
  assert.equal(
    s.add({ ...event(2), text: '<img src=x onerror=alert(1)>' }).text,
    '<img src=x onerror=alert(1)>',
  );
});
test('retry intervals back off with jitter and remain bounded', () => {
  assert.equal(
    retryDelay(0, () => 0.5),
    1000,
  );
  assert.equal(
    retryDelay(1, () => 0.5),
    2000,
  );
  assert.equal(
    retryDelay(999, () => 0.5),
    30000,
  );
  assert.ok(retryDelay(4, () => 0) < retryDelay(4, () => 1));
  assert.ok(retryDelay(999, () => 1) <= 36000);
});
test('presence follows each account independently, clears at room changes, ignores old replays and whispers', () => {
  const s = new ChatStore();
  s.setTabs(['Test', 'Other']);
  s.add({ ...event(1), type: 'room', room: { id: 7, name: 'Cafe' } });
  s.add({ ...event(2), type: 'join', user: { name: 'Alma' } });
  s.add({ ...event(3), user: { name: 'Luna' } });
  s.add({ ...event(4), type: 'part', user: { name: 'Alma' }, room: { id: 9, name: 'Elsewhere' } });
  assert.equal(s.tab('Test').room.name, 'Cafe');
  assert.deepEqual(
    [...s.tab('Test').presence.values()].filter((u) => u.present).map((u) => u.name),
    ['Test', 'Luna'],
  );
  s.add({
    ...event(5),
    type: 'priv',
    from: { name: 'Remote' },
    to: { name: 'Test' },
    text: 'hello',
  });
  assert.equal(s.tab('Test').presence.has('Remote'), false);
  s.add({ ...event(1), type: 'join', user: { name: 'Alma' } });
  assert.equal(s.tab('Test').presence.get('Alma').present, false);
  s.add({ ...event(6), type: 'room', room: { id: 8, name: 'Torvet' } });
  assert.deepEqual([...s.tab('Test').presence.keys()], ['Test']);
  s.add({ ...event(4), type: 'join', user: { name: 'Old room guest' } });
  assert.equal(s.tab('Test').presence.has('Old room guest'), false);
  s.add({ ...event(7, 'Other'), user: { name: 'Separate' } });
  assert.equal(s.tab('Test').presence.has('Separate'), false);
  assert.equal(s.tab('Other').presence.get('Separate').present, true);
});

test('attention badges only match names or server trigger flags, never ordinary room traffic', () => {
  const base = {
    type: 'text',
    me: { name: 'Punktum' },
    user: { name: 'Guest' },
    text: 'Hej alle sammen',
  };
  assert.equal(needsAttention(base), false);
  for (const text of ['Hej Punktum!', '@PUNKTUM: er du der?', 'punktum'])
    assert.equal(needsAttention({ ...base, text }), true);
  for (const text of ['punktummer', 'antipunktum', 'Punktum123'])
    assert.equal(needsAttention({ ...base, text }), false);
  assert.equal(needsAttention({ ...base, notify: true }), true);
  assert.equal(needsAttention({ ...base, log: true }), true);
  assert.equal(needsAttention({ ...base, type: 'join', notify: true }), false);
  assert.equal(
    needsAttention({ ...base, user: { name: 'Punktum' }, text: 'Punktum', notify: true }),
    true,
  );
  assert.equal(needsAttention({ ...base, user: { name: 'Punktum' }, text: 'Punktum' }), false);
  assert.equal(needsAttention({ ...base, me: { name: 'A+B' }, text: 'Hej A+B!' }), true);
  assert.equal(needsAttention({ ...base, me: { name: 'Søren' }, text: 'Hej SØREN!' }), true);
  assert.equal(
    needsAttention({ ...base, type: 'priv', from: { name: 'Punktum' }, notify: true }),
    true,
  );
  const store = new ChatStore();
  store.setTabs(['Punktum']);
  assert.equal(store.add({ ...base, time: 1 }).attention, false);
  assert.equal(store.add({ ...base, time: 2, text: 'Hej Punktum' }).attention, true);
});
test('room snapshot includes quiet users and stays separate from later movements', () => {
  const s = new ChatStore();
  s.setTabs(['Test', 'Other']);
  s.add({
    ...event(1),
    type: 'room',
    room: { id: 12, name: 'Torvet' },
    users: [{ name: 'Quiet' }, { name: 'Guest' }],
  });
  assert.equal(s.tab('Test').rosterComplete, true);
  assert.equal(s.tab('Test').presence.get('Quiet').present, true);
  s.add({ ...event(2), type: 'quit', user: { name: 'Guest' } });
  assert.equal(s.tab('Test').presence.get('Guest').present, false);
  s.add({ ...event(3), type: 'room', room: { id: 15, name: 'Cafe' }, users: [{ name: 'New' }] });
  assert.equal(s.tab('Test').presence.has('Quiet'), false);
  assert.equal(s.tab('Test').presence.get('New').present, true);
  assert.equal(s.tab('Other').presence.size, 0);
});
test('desktop markers stay account-specific and distinguish log highlighting from notifications', () => {
  const s = new ChatStore();
  s.setTabs(['Test', 'Other']);
  const notify = s.add({ ...event(1), text: 'Er der kaffe?', notify: true });
  const plain = s.add({ ...event(2, 'Other'), text: 'Er der kaffe?' });
  const log = s.add({ ...event(3), text: 'En markeret besked', log: true });
  const self = s.add({ ...event(4), user: { name: 'Test' }, notify: true });
  for (const message of [notify, log, self]) {
    assert.equal(message.attention, true);
    assert.equal(messageAttention(message), true);
  }
  assert.equal(messageAttention(plain), false);
  assert.equal(log.serverNotify, false);
  assert.equal(notify.serverNotify, true);
  assert.equal(messageAttention(JSON.parse(JSON.stringify(log))), true);
});

test('superuser metadata follows room snapshots and whisper senders without marking recipients', () => {
  const store = new ChatStore();
  store.setTabs(['Test', 'Other']);
  store.add({
    ...event(1),
    type: 'room',
    users: [{ name: 'Quiet', superuser: 1 }],
  });
  const text = store.add({ ...event(2), user: { name: 'QUIET' } });
  assert.equal(text.superuser, true);
  assert.equal(store.isSuperuser('Other', 'Quiet'), false);
  const whisper = store.add({
    ...event(3),
    type: 'priv',
    from: { name: 'Moderator', superuser: true },
    to: { name: 'Test' },
  });
  assert.equal(whisper.superuser, true);
  assert.equal(
    store.add({
      ...event(4),
      type: 'priv',
      from: { name: 'Guest' },
      to: { name: 'Moderator', superuser: true },
    }).superuser,
    false,
  );
  assert.equal(JSON.parse(JSON.stringify(whisper)).superuser, true);
});

test('panic identifies superusers independently of active panic and rejects older role changes', () => {
  const store = new ChatStore();
  store.setTabs(['Test']);
  const plain = store.add(event(1));
  assert.equal(plain.superuser, false);
  store.add({ ...event(2), type: 'log', event: 'panic', users: [{ name: 'Guest' }] });
  assert.equal(store.isSuperuser('Test', 'guest'), true);
  store.add({ ...event(3), type: 'log', event: 'panic', users: [] });
  assert.equal(store.add(event(4)).superuser, true);
  store.add({ ...event(10), user: { name: 'Guest', superuser: false } });
  store.add({ ...event(5), user: { name: 'Guest', superuser: true } });
  assert.equal(store.isSuperuser('Test', 'Guest'), false);
  assert.equal(
    store.add({ ...event(11), text: 'superbruger panic', notify: true }).superuser,
    false,
  );
});

test('role metadata is bounded and discarded with its account', () => {
  const store = new ChatStore();
  store.setTabs(['Test']);
  for (let i = 0; i < 1100; i++)
    store.add({ ...event(i), user: { name: 'User' + i, superuser: false } });
  assert.equal(store.tab('Test').userRoles.size, 1000);
  store.setTabs([]);
  store.setTabs(['Test']);
  assert.equal(store.tab('Test').userRoles.size, 0);
});

test('departures preserve the destination id separately from the source room', () => {
  const store = new ChatStore();
  store.setTabs(['Test']);
  store.add({ ...event(1), type: 'room', room: { id: 12, name: 'Torvet' } });
  const departure = store.add({ ...event(2), type: 'part', room: { id: '53', name: 'X-perten' } });
  assert.equal(departure.roomKey, 'id:12');
  assert.deepEqual(departure.destination, { id: 53, name: 'X-perten' });
  for (const [index, id] of [null, undefined, -1, '53 /bad', 1.5].entries())
    assert.equal(
      store.add({ ...event(10 + index), type: 'part', room: { id, name: 'Ukendt' } }).destination,
      undefined,
    );
  assert.equal(
    store.add({ ...event(20), room: { id: 53, name: 'X-perten' } }).destination,
    undefined,
  );
});
