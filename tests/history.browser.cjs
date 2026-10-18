const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    let socket;
    page.on('pageerror', (error) => errors.push(error.message));
    const events = (count, start) =>
      Array.from({ length: count }, (_, index) => ({
        time: start + index,
        me: { name: 'Fixture' },
        user: { name: 'Example' },
        type: 'text',
        text: 'Saved message ' + (start + index),
      }));
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Fixture'] }));
      ws.onMessage((data) => {
        if (JSON.parse(data).lastLine === 0) ws.send(JSON.stringify(events(2000, 1700000000000)));
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('acium-webchat-save-history', 'yes');
      window.archiveStats = async (token) => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        const scope = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (
          !(await indexedDB.databases()).some(
            (database) => database.name === 'acium-webchat-history',
          )
        )
          return { count: -1, latest: 0 };
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('acium-webchat-history', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('messages');
            const index = transaction.objectStore('messages').index('timeline');
            const range = IDBKeyRange.bound([scope, -Infinity], [scope, Infinity, []]);
            const count = index.count(range);
            const latest = index.openCursor(range, 'prev');
            let time = 0;
            latest.onsuccess = () => (time = latest.result?.value.time || 0);
            transaction.oncomplete = () => {
              database.close();
              resolve({ count: count.result, latest: time });
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
          };
        });
      };
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('test_history_token_123');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 250);
    await page.waitForFunction(
      async () => (await archiveStats('test_history_token_123')).count === 2000,
    );
    console.log('Initial DOM / archived records: 250 / 2000');
    for (const count of [500, 700, 950]) {
      await page.locator('#timeline').evaluate((element) => (element.scrollTop = 0));
      await page.waitForFunction(
        (count) => document.querySelectorAll('.message').length === count,
        count,
      );
      assert.ok(await page.locator('#timeline').evaluate((element) => element.scrollTop > 0));
      console.log('Scroll-up lazy load count:', count, 'anchor preserved');
    }
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 250);
    console.log('Session reload initially renders only 250 rows');
    assert.equal(
      await page.evaluate(async () => (await archiveStats('different_history_token')).count),
      0,
    );
    await page.locator('#settings-button').click();
    await page.locator('#clear-history').click();
    await page.waitForFunction(() =>
      document.querySelector('#history-status').textContent.includes('slettet'),
    );
    assert.equal(
      await page.evaluate(async () => (await archiveStats('test_history_token_123')).count),
      0,
    );
    await page.locator('#settings-dialog .close-sheet').click();
    console.log('Different login archive isolated; archive deletion passes');
    const start = 1700001000000;
    socket.send(JSON.stringify(events(10000, start)));
    socket.send(JSON.stringify(events(20, start + 10000)));
    await page.waitForFunction(async (latest) => {
      const result = await archiveStats('test_history_token_123');
      return result.count === 10000 && result.latest === latest;
    }, start + 10019);
    assert.equal(await page.locator('.message').count(), 250);
    console.log('10,020 incoming messages retain 10,000 archive records and 250 visible rows');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
