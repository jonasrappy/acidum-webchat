import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertManager, isLiveAlert } from '../src/lib/notifications.js';
const live = (extra = {}) => ({
  account: 'Nova',
  key: 'one',
  name: 'Alma',
  type: 'text',
  text: 'Hello',
  time: Date.now(),
  serverNotify: true,
  ...extra,
});
test('only recent desktop notification markers produce live alerts', () => {
  assert.equal(isLiveAlert(live()), true);
  for (const extra of [
    { serverNotify: false, log: true },
    { type: 'join' },
    { time: Date.now() - 61000 },
    { time: Date.now() + 11000 },
    { time: NaN },
  ])
    assert.equal(isLiveAlert(live(extra)), false);
  assert.equal(isLiveAlert(live({ type: 'priv' })), true);
});
test('notifications require opt-in, deduplicate replays and open the correct account', async () => {
  const disk = new Map(),
    banners = [],
    native = [],
    opened = [],
    listeners = new Map();
  let requests = 0,
    registrations = 0;
  const registration = {
    showNotification: async (title, options) => native.push({ title, options }),
  };
  const environment = {
    localStorage: { getItem: (k) => disk.get(k), setItem: (k, v) => disk.set(k, v) },
    location: { href: 'https://example.test/acidum-webchat/' },
    Notification: {
      permission: 'default',
      requestPermission: async () => {
        requests++;
        environment.Notification.permission = 'granted';
        return 'granted';
      },
    },
    navigator: {
      serviceWorker: {
        addEventListener: (type, fn) => listeners.set(type, fn),
        register: async () => {
          registrations++;
        },
        ready: Promise.resolve(registration),
      },
    },
  };
  const manager = new AlertManager({
    onAlert: (m) => banners.push(m),
    onOpen: (a) => opened.push(a),
    environment,
  });
  assert.equal(manager.receive(live()), true);
  assert.equal(manager.receive(live()), false);
  assert.equal(manager.receive(live({ key: 'ignored', serverNotify: false })), false);
  assert.equal(banners.length, 1);
  assert.equal(requests, 0);
  assert.equal(native.length, 0);
  assert.equal(await manager.enable(), 'granted');
  assert.equal(requests, 1);
  assert.equal(registrations, 1);
  manager.receive(live({ key: 'two' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(native.length, 1);
  assert.equal(native[0].options.data.account, 'Nova');
  assert.equal(native[0].options.icon, 'https://example.test/acidum-webchat/icon.svg');
  manager.receive(live({ key: 'three' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(native.length, 1);
  listeners.get('message')({ data: { type: 'acidum-open-account', account: 'Nova' } });
  assert.deepEqual(opened, ['Nova']);
  manager.disable();
  assert.equal(disk.get('acidum-notifications'), 'no');
  assert.equal(
    new AlertManager({ onAlert: () => {}, onOpen: () => {}, environment }).enabled,
    false,
  );
});
test('unsupported or refused notifications retain in-app alerts without repeated permission requests', async () => {
  const received = [],
    environment = {
      Notification: { permission: 'denied', requestPermission: async () => 'denied' },
    };
  const manager = new AlertManager({
    onAlert: (m) => received.push(m),
    onOpen: () => {},
    environment,
  });
  assert.equal(await manager.enable(), 'denied');
  assert.equal(manager.enabled, false);
  assert.equal(manager.receive(live()), true);
  assert.equal(received.length, 1);
  assert.equal(
    await new AlertManager({ onAlert: () => {}, onOpen: () => {}, environment: {} }).enable(),
    'unsupported',
  );
});
