import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/lib/event-log.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
};
const message = (index, account = 'Nova', marked = true) => ({
  account,
  key: account + index,
  name: 'Alma',
  time: 1700000000000 + index * 2000,
  text: 'Event ' + index,
  type: 'text',
  roomKey: 'id:12',
  log: marked,
  serverMarked: marked,
});

test('the latest 100 events survive reopening and old replays never replace newer events', () => {
  const disk = storage();
  const log = new EventLog(disk, 'one');
  log.capture(Array.from({ length: 120 }, (_, index) => message(index)));
  log.flush();
  assert.equal(JSON.parse(disk.getItem(log.key)).length, 100);
  const reopened = new EventLog(disk, 'one');
  assert.equal(reopened.rows.length, 100);
  assert.equal(reopened.rows[0].text, 'Event 20');
  assert.equal(reopened.rows.at(-1).text, 'Event 119');
  assert.equal(reopened.capture([message(0), message(119)]), false);
  reopened.capture([message(120)]);
  reopened.flush();
  assert.equal(reopened.rows[0].text, 'Event 21');
  assert.equal(new EventLog(disk, 'two').rows.length, 0);
});

test('room copies count once and keep every receiving account after reopening', () => {
  const disk = storage();
  const log = new EventLog(disk, 'one');
  const rows = Array.from({ length: 110 }, (_, index) => [
    message(index, 'Nova', false),
    message(index, 'Milo', true),
  ]).flat();
  log.capture(rows);
  log.flush();
  const reopened = new EventLog(disk, 'one');
  assert.equal(reopened.rows.length, 100);
  assert.deepEqual(reopened.rows[0].accounts, ['Milo', 'Nova']);
  assert.equal(reopened.rows[0].sources.length, 2);
  assert.equal(reopened.capture(rows), false);
  assert.equal(reopened.relevant(message(109, 'Iris', false)), true);
  assert.equal(reopened.relevant(message(999, 'Iris', false)), false);
});

test('name mentions and panic qualify while ordinary traffic does not; failed storage stays usable', () => {
  const log = new EventLog(
    {
      getItem: () => '{broken',
      setItem: () => {
        throw Error('blocked');
      },
    },
    'one',
  );
  log.capture([
    message(1, 'Nova', false),
    { ...message(2, 'Nova', false), text: 'Hello NOVA!' },
    { ...message(3), type: 'log', name: '', text: 'Panic activated' },
  ]);
  assert.doesNotThrow(() => log.flush());
  assert.equal(log.rows.length, 2);
});
