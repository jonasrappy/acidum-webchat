const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const { default: worker } = await import('../server/worker.js');
  const { D1 } = await import('./helpers/d1.mjs');
  const { syncKeys, encryptSyncMessage, SyncClient } = await import('../src/lib/sync-protocol.js');
  const DB = new D1();
  const key = 'synthetic_private_instance_key_1234567890123';
  const link = 'https://sync.example.test/#key=' + key;
  const token = 'synthetic_multidevice_login_123';
  const INSTANCE_KEY_HASH = Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
  ).toString('base64url');
  const env = { DB, INSTANCE_KEY_HASH };
  const client = new SyncClient(link, await syncKeys(token), (url, init) =>
    worker.fetch(new Request(url, init), env),
  );
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  const pages = [],
    contexts = [],
    errors = [],
    sockets = [];
  let unavailable = false,
    syncRequests = 0;
  const count = () => DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total;
  const event = {
    me: { name: 'Nova' },
    user: { name: 'Alma' },
    type: 'text',
    text: 'Shared received message',
    time: 1700000000000,
  };
  const settings = async (page) => {
    const button = page.locator('#settings-button');
    await ((await button.isVisible()) ? button : page.locator('#bottom-settings')).click();
    await page.locator('#settings-dialog[open]').waitFor();
  };
  const sync = async (page) => {
    await page.locator('#sync-now').click();
    await page.waitForFunction(() => !document.querySelector('#sync-now').disabled);
  };
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      contexts.push(context);
      await context.route('https://sync.example.test/**', async (route) => {
        syncRequests++;
        const request = route.request();
        if (unavailable && request.method() === 'POST')
          return route.fulfill({
            status: 503,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: '{}',
          });
        const response = await worker.fetch(
          new Request(request.url(), {
            method: request.method(),
            headers: request.headers(),
            body: request.postDataBuffer() || undefined,
          }),
          env,
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));

      await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
        sockets.push(ws);
        ws.send(JSON.stringify({ tabs: ['Nova'] }));
        ws.onMessage((raw) => {
          const request = JSON.parse(raw);
          assert.equal('say' in request, false);
          if (request.lastLine === 0) ws.send(JSON.stringify([event]));
        });
      });
      await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
      await page.locator('#chat-link').fill(token);
      await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
      await page.locator('.message').waitFor();
      await settings(page);
      assert.equal(await page.locator('#sync-status').textContent(), 'Device only');
      await page.locator('#sync-link').fill(link);
      await page.locator('#sync-connect').click();
      await page.waitForFunction(
        () => document.querySelector('#sync-status').textContent === 'Sync connected',
      );
      pages.push(page);
    }
    for (const page of pages) await sync(page);
    assert.equal(count(), 1);
    for (const page of pages) {
      await page.locator('#settings-dialog .close-sheet').click();
      assert.equal(await page.locator('.message').count(), 1);
    }
    const imported = {
      account: 'Nova',
      name: 'Vega',
      type: 'text',
      text: 'Older server collector message',
      key: 'synthetic-collector-message',
      time: 1699999999990,
    };
    await client.upload([await encryptSyncMessage(client.keys, imported)]);
    for (const page of pages) {
      await settings(page);
      await sync(page);
      await page.locator('#settings-dialog .close-sheet').click();
      await page.getByText(imported.text, { exact: true }).waitFor();
      assert.equal(await page.locator('.message').count(), 2);
    }
    const page = pages[0];
    unavailable = true;
    sockets[0].send(
      JSON.stringify({ ...event, text: 'Private queued fixture', time: 1700000000010 }),
    );
    await page.getByText('Private queued fixture', { exact: true }).waitFor();
    await settings(page);
    await sync(page);
    assert.equal(count(), 2);
    await page.locator('#settings-dialog .close-sheet').click();
    await page.reload();
    await page.getByText(imported.text, { exact: true }).waitFor();
    await settings(page);
    assert.equal(await page.locator('#sync-link').inputValue(), link);
    unavailable = false;
    await sync(page);
    assert.equal(count(), 3);
    await page.locator('#settings-dialog .close-sheet').click();
    for (let start = 0; start < 130; start += 30) {
      const records = await Promise.all(
        Array.from({ length: Math.min(30, 130 - start) }, (_, index) =>
          encryptSyncMessage(client.keys, {
            ...imported,
            key: 'synthetic-older-' + (start + index),
            text: 'Cloud archive ' + (start + index),
            time: 1699999999000 + start + index,
          }),
        ),
      );
      await client.upload(records);
    }
    await page.reload();
    await page.locator('#older:not([hidden])').waitFor();
    assert.equal(await page.locator('.message').count(), 100);
    await page.locator('#older').click();
    await page.getByText('Cloud archive 0', { exact: true }).waitFor();
    assert.equal(await page.locator('.message').count(), 133);
    assert.equal(await page.locator('#older').isVisible(), false);
    await page.addInitScript(() => {
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, delay, ...args) =>
        timeout(fn, delay > 500 && delay < 35000 ? 300 : delay, ...args);
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 0;
        constructor() {
          timeout(() => {
            this.readyState = 1;
            this.onopen?.();
            timeout(() => {
              this.readyState = 3;
              this.onclose?.({ code: 1005 });
            }, 50);
          }, 20);
        }
        send() {}
        close() {}
      };
    });
    await page.reload();
    await page.getByText('Cloud archive 129', { exact: true }).waitFor();
    await settings(page);
    await page.waitForFunction(() =>
      document.querySelector('#settings-status').textContent.includes('saved history is available'),
    );
    assert.equal(await page.locator('#welcome').isVisible(), false);
    await page.locator('#settings-dialog .close-sheet').click();
    await page.locator('#older').click();
    await page.getByText('Cloud archive 0', { exact: true }).waitFor();
    await settings(page);
    await page.locator('#sync-disconnect').click();
    assert.equal(await page.locator('#sync-status').textContent(), 'Device only');
    await page.locator('#settings-dialog .close-sheet').click();
    assert.equal(await page.locator('.message').count(), 0);
    const requestsBefore = syncRequests;
    await page.reload();
    await page.locator('#view-title').waitFor();
    await settings(page);
    assert.equal(await page.locator('#sync-status').textContent(), 'Device only');
    assert.equal(syncRequests, requestsBefore);
    assert.deepEqual(errors, []);
    console.log(
      'Phone and desktop share encrypted history without duplicate rows or messages; sync restores per login and device-only mode sends no sync requests',
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
    DB.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
