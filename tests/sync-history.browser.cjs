const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const { default: worker } = await import('../server/worker.js');
  const { D1, quotaBinding } = await import('./helpers/d1.mjs');
  const { syncKeys, encryptSyncMessage, SyncClient } = await import('../src/lib/sync-protocol.js');
  const DB = new D1();
  const key = 'synthetic_private_instance_key_1234567890123';
  const link = 'https://sync.example.test/#key=' + key;
  const token = 'synthetic_per_account_history_token';
  const env = {
    DB,
    QUOTA: quotaBinding(),
    INSTANCE_KEY_HASH: Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
    ).toString('base64url'),
  };
  const client = new SyncClient(link, await syncKeys(token), (url, init) =>
    worker.fetch(new Request(url, init), env),
  );
  for (const account of ['Nova', 'Milo']) {
    for (let start = 0; start < 150; start += 30) {
      await client.upload(
        await Promise.all(
          Array.from({ length: 30 }, (_, offset) => {
            const index = start + offset;
            return encryptSyncMessage(client.keys, {
              account,
              name: 'Alma',
              key: account + '-' + index,
              text: (account === 'Nova' ? 'Active' : 'Quiet') + ' history ' + index,
              time: (account === 'Milo' ? 1600000000000 : 1700000000000) + index,
              type: 'text',
              log: index === 0,
            });
          }),
        ),
      );
    }
  }
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  const contexts = [],
    requests = [],
    errors = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      contexts.push(context);
      await context.route('https://sync.example.test/**', async (route) => {
        const req = route.request();
        requests.push({ method: req.method(), url: new URL(req.url()) });
        const res = await worker.fetch(
          new Request(req.url(), {
            method: req.method(),
            headers: req.headers(),
            body: req.postDataBuffer() || undefined,
          }),
          env,
        );
        await route.fulfill({
          status: res.status,
          headers: Object.fromEntries(res.headers),
          body: await res.text(),
        });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
        ws.send(JSON.stringify({ tabs: ['Nova', 'Milo'] }));
        ws.onMessage((raw) => assert.equal('say' in JSON.parse(raw), false));
      });
      await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
      await page.locator('#chat-link').fill(token);
      await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
      const settings = () =>
        (width > 1100
          ? page.locator('#settings-button')
          : page.locator('#bottom-settings')
        ).click();
      await settings();
      await page.locator('#sync-link').fill(link);
      await page.locator('#sync-connect').click();
      await page.waitForFunction(
        () => document.querySelector('#sync-status').textContent === 'Sync connected',
      );
      await page.locator('#settings-dialog .close-sheet').click();
      assert.equal(await page.locator('.message').count(), 200);
      assert.equal(await page.getByText('Active history 0', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Quiet history 0', { exact: true }).count(), 0);
      if (width > 1100) {
        const nova = page
          .locator('.room-panel')
          .filter({ has: page.getByRole('button', { name: 'Reply as Nova', exact: true }) });
        const milo = page
          .locator('.room-panel')
          .filter({ has: page.getByRole('button', { name: 'Reply as Milo', exact: true }) });
        assert.equal(await nova.locator('.message').count(), 100);
        assert.equal(await milo.locator('.message').count(), 100);
        await nova.getByRole('button', { name: 'Load older messages' }).click();
        await nova.getByText('Active history 0', { exact: true }).waitFor();
        assert.equal(await nova.locator('.message').count(), 150);
        assert.equal(await milo.locator('.message').count(), 100);
      }
      await (width > 1100 ? page.locator('#log-button') : page.locator('#bottom-log')).click();
      await page.getByText('Active history 0', { exact: true }).waitFor();
      await page.getByText('Quiet history 0', { exact: true }).waitFor();
      assert.equal(await page.locator('.message').count(), 2);
      requests.length = 0;
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('.message').length === 200);
      const history = requests.filter(
        (r) => r.method === 'GET' && r.url.searchParams.get('kind') === 'chat',
      );
      assert.equal(history.length, 2);
      assert.equal(
        history.every((r) => r.url.searchParams.has('stream') && !r.url.searchParams.has('before')),
        true,
      );
      assert.equal(
        requests.some((r) => r.method === 'POST'),
        false,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      'Each account loads exactly its newest 100 messages, even when another account is busier; older history loads per panel; marked log events sync independently on desktop and phone',
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await browser.close();
    DB.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
