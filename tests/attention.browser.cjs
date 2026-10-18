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
    let socket;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Punktum', 'Other'] }));
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_attention_token');
    await page.locator('#connect-form').evaluate((f) => f.requestSubmit());
    await page.locator('#mobile-accounts button').nth(2).click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#view-caption').isVisible(), false);
    assert.equal(await page.locator('.composer-hint').isVisible(), false);
    assert.equal(await page.locator('#mobile-accounts .account-room').count(), 0);
    assert.equal(await page.locator('#view-subtitle').isVisible(), false);
    assert.ok((await page.locator('.chat-header').boundingBox()).height <= 60);
    let time = 1700000000000;
    const send = async (overrides) => {
      socket.send(
        JSON.stringify({
          type: 'text',
          me: { name: 'Punktum' },
          user: { name: 'Guest' },
          text: 'Hej alle',
          time: ++time,
          ...overrides,
        }),
      );
      await page.waitForTimeout(180);
    };
    await send({});
    await send({ text: 'normal besked' });
    assert.equal(await page.locator('#mobile-accounts .badge').count(), 0);
    await send({ text: 'Hej @PUNKTUM!' });
    assert.equal(await page.locator('#mobile-accounts .badge').textContent(), '1');
    await send({ notify: true });
    assert.equal(await page.locator('#mobile-accounts .badge').textContent(), '2');
    await send({ user: { name: 'Punktum' }, text: 'Punktum', notify: true });
    await send({ type: 'join', notify: true });
    assert.equal(await page.locator('#mobile-accounts .badge').textContent(), '3');
    await page.locator('#mobile-accounts button').nth(1).click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#mobile-accounts .badge').count(), 0);
    await page.locator('#bottom-settings').click();
    await send({ text: 'Punktum, er du her?' });
    assert.equal(await page.locator('#mobile-accounts .badge').textContent(), '1');
    await page.locator('#settings-dialog .close-sheet').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#mobile-accounts .badge').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Compact mobile layout, unknown rooms, attention-only counts and clearing: passed');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
