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
    await context.addInitScript(() => {
      window.testVisible = true;
      Object.defineProperty(document, 'hidden', { get: () => !window.testVisible });
    });
    const page = await context.newPage();
    const requests = [],
      historyRequests = [],
      errors = [];
    let socket,
      connections = 0;
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    const event = (time, text) => ({
      time,
      me: { name: 'Nova' },
      user: { name: 'Alma' },
      type: 'text',
      text,
    });
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      connections++;
      ws.send(JSON.stringify({ tabs: ['Nova'] }));
      ws.onMessage((raw) => {
        const request = JSON.parse(raw);
        if (request.lastLine == null) return;
        historyRequests.push(request);
        if (request.lastLine === 0)
          ws.send(JSON.stringify([event(1700000000000, 'First message')]));
      });
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_session_login_123');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 1);
    assert.equal(
      requests.some((url) => /\/UtilitySheets-.*\.js/.test(url)),
      false,
    );
    assert.equal(
      requests.some((url) => /\/archive-.*\.js/.test(url)),
      false,
    );
    await page.evaluate(() => {
      window.testVisible = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    socket.send(JSON.stringify(event(1700000000001, 'Message while the tab is hidden')));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.message').count(), 1);
    await page.evaluate(() => {
      window.testVisible = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 2);
    await page.locator('#bottom-settings').click();
    await page.locator('#settings-dialog[open]').waitFor();
    assert.equal(requests.filter((url) => /\/UtilitySheets-.*\.js/.test(url)).length, 1);
    await page.locator('#settings-reconnect').click();
    await page.waitForFunction(
      () => document.querySelector('#settings-status').textContent === 'Connected',
    );
    assert.equal(connections, 2);
    assert.equal(historyRequests.at(-1).lastLine, 1700000000001);
    const archiveResponse = page.waitForResponse((response) =>
      /\/archive-.*\.js/.test(response.url()),
    );
    await page.locator('#save-history').check();
    assert.equal((await archiveResponse).status(), 200);
    assert.equal(requests.filter((url) => /\/archive-.*\.js/.test(url)).length, 1);
    await page.locator('#settings-dialog .close-sheet').click();
    await page.locator('#bottom-settings').click();
    assert.equal(requests.filter((url) => /\/UtilitySheets-.*\.js/.test(url)).length, 1);
    await page.locator('#settings-dialog .close-sheet').click();
    await page.evaluate(() => document.querySelector('#disconnect').click());
    await page.locator('#chat-link').fill('synthetic_session_second_login');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 1);
    assert.deepEqual(errors, []);
    console.log(
      'Hidden chats pause rendering; reconnect resumes from newest event; optional modules load once; logout and a new login reset the view',
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
