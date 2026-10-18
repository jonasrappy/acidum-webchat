const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let socket;
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Nova'] }));
    });
    const url = process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/';
    await page.goto(url);
    await page.locator('#chat-link').fill('synthetic_persistent_log_one');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.locator('#send-as option[value=Nova]').waitFor({ state: 'attached' });
    const event = (index, marked = true) => ({
      type: 'text',
      me: { name: 'Nova' },
      user: { name: 'Alma' },
      time: 1700000000000 + index,
      text: (marked ? 'Log ' : 'Trafik ') + index,
      log: marked,
    });
    socket.send(JSON.stringify(Array.from({ length: 120 }, (_, index) => event(index))));
    await page.waitForFunction(() =>
      Object.keys(localStorage).some(
        (key) =>
          key.startsWith('acidum-events-') && JSON.parse(localStorage.getItem(key)).length === 100,
      ),
    );
    await page.locator('#bottom-log').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 100);
    assert.equal(await page.locator('.message-text').first().textContent(), 'Log 20');
    socket.send(
      JSON.stringify(Array.from({ length: 1000 }, (_, index) => event(1000 + index, false))),
    );
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.message').count(), 100);
    await page.reload();
    await page.locator('#bottom-log').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 100);
    assert.equal(await page.locator('.message-text').first().textContent(), 'Log 20');
    assert.equal(await page.locator('.message-text').last().textContent(), 'Log 119');
    assert.equal(await page.locator('#older').isVisible(), false);
    await page.locator('#bottom-settings').click();
    assert.equal(await page.locator('#save-history').isChecked(), false);
    await page.locator('#save-history').check();
    await page.locator('#clear-history').click();
    await page.locator('#save-history').uncheck();
    await page.locator('#settings-dialog .close-sheet').click();
    assert.equal(await page.locator('.message').count(), 100);
    socket.send(JSON.stringify([event(5), event(119), event(2000)]));
    await page.waitForFunction(
      () => document.querySelector('.message:last-child .message-text')?.textContent === 'Log 2000',
    );
    assert.equal(await page.locator('.message').count(), 100);
    assert.equal(await page.locator('.message-text').first().textContent(), 'Log 21');
    await page.evaluate(() => (window.testVisible = false));
    await page.evaluate(() =>
      Object.defineProperty(document, 'hidden', { get: () => !window.testVisible }),
    );
    socket.send(JSON.stringify(event(2001)));
    await page.waitForFunction(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('acidum-events-'))
        .some((key) => JSON.parse(localStorage.getItem(key)).at(-1)?.text === 'Log 2001'),
    );
    await page.reload();
    await page.locator('#bottom-log').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 100);
    assert.equal(await page.locator('.message-text').last().textContent(), 'Log 2001');
    socket.send(
      JSON.stringify(Array.from({ length: 900 }, (_, index) => event(3000 + index)).reverse()),
    );
    await page.waitForFunction(
      () => document.querySelector('.message:last-child .message-text')?.textContent === 'Log 3899',
    );
    assert.equal(await page.locator('.message').count(), 100);
    assert.equal(await page.locator('.message-text').first().textContent(), 'Log 3800');
    await page.locator('#bottom-settings').click();
    await page.locator('#mobile-exit').click();
    await page.locator('#chat-link').fill('synthetic_persistent_log_two');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.locator('#bottom-log').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.message').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'Always-on local log survives reload, traffic eviction, archive deletion and hidden tabs; 100-event cap and login isolation pass',
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
