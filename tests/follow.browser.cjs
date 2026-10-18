const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const sent = [],
      errors = [];
    let replay = true;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      ws.send(JSON.stringify({ tabs: ['Nova', 'Milo'] }));
      ws.onMessage((raw) => {
        const data = JSON.parse(raw);
        if (data.say !== undefined) sent.push(data);
        else if (data.lastLine === 0 && replay)
          ws.send(
            JSON.stringify([
              {
                type: 'room',
                me: { name: data.name },
                time: 1700000000000,
                room: { id: 12, name: 'Town Square' },
              },
              {
                type: 'part',
                me: { name: data.name },
                user: { name: 'Alma' },
                time: 1700000000001,
                room: { id: 53, name: 'X-perten' },
                log: true,
              },
              {
                type: 'part',
                me: { name: data.name },
                user: { name: 'Elliot' },
                time: 1700000000002,
                room: { name: 'Unknown room' },
              },
            ]),
          );
      });
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_follow_login');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.locator('.followable').waitFor();
    await page.locator('#send-as').selectOption('Milo');
    await page.locator('#message').fill('Min usendte kladde');
    await page.locator('.followable').click();
    assert.equal(await page.locator('#follow-message').textContent(), 'Follow as Milo');
    assert.deepEqual(sent, []);
    await page.locator('#follow-message').click();
    await page.waitForFunction(() => !document.querySelector('#message-dialog').open);
    assert.deepEqual(sent, [{ name: 'Milo', say: '/goto 53' }]);
    assert.equal(await page.locator('#message').inputValue(), 'Min usendte kladde');
    await page
      .locator('.message')
      .filter({ hasText: 'er gået til Unknown room' })
      .locator('.message-time')
      .click();
    assert.equal(await page.locator('#follow-message').count(), 0);
    await page.locator('#message-dialog .close-sheet').click();
    replay = false;
    await page.reload();
    await page.locator('#bottom-log').click();
    await page.locator('.followable').waitFor();
    assert.deepEqual(await page.locator('.message-account').allTextContents(), ['Milo', 'Nova']);
    await page.locator('.followable').click();
    assert.equal(await page.locator('#follow-message').textContent(), 'Follow as Nova');
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.locator('#follow-message').click();
    await page.locator('#message-action-status').filter({ hasText: 'Disconnected.' }).waitFor();
    assert.equal(sent.length, 1);
    await page.screenshot({ path: '/tmp/acidum-follow-mobile.png' });
    assert.deepEqual(errors, []);
    console.log(
      'Follow uses the actual room id and selected account, preserves drafts, persists with the log and never sends without an explicit click or while offline',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
