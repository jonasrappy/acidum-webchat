const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  const url = process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/',
    key = 'acium-webchat-token',
    fixture = 'synthetic_persistent_login_123';
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.routeWebSocket('wss://ws0.acium.app/**', (ws) =>
      ws.send(JSON.stringify({ tabs: ['Fixture'] })),
    );
    let page = await context.newPage();
    await page.goto(url);
    assert.equal(await page.locator('#welcome p:not(:empty)').count(), 1);
    assert.equal(await page.locator('#link-guide a').getAttribute('href'), 'https://acium.app/');
    assert.equal(await page.locator('#welcome input').count(), 1);
    await page.screenshot({ path: '/tmp/acidum-minimal-login.png' });
    await page.locator('#chat-link').fill(fixture);
    await page.locator('#connect-form').evaluate((f) => f.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#accounts button'));
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), fixture);
    await page.close();
    page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#accounts button'));
    console.log('Closing and reopening the tab restores login');
    const state = await context.storageState();
    await context.close();
    const reopened = await browser.newContext({ storageState: state });
    await reopened.routeWebSocket('wss://ws0.acium.app/**', (ws) =>
      ws.send(JSON.stringify({ tabs: ['Fixture'] })),
    );
    page = await reopened.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#accounts button'));
    await page.locator('#disconnect').evaluate((button) => button.click());
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), null);
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), key), null);
    console.log('Browser storage restoration and explicit logout pass');
    await page.evaluate(({ key, fixture }) => sessionStorage.setItem(key, fixture), {
      key,
      fixture,
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#accounts button'));
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), key), fixture);
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), key), null);
    console.log('Existing session login migrates to persistent storage');
    await reopened.close();
    for (const code of [1005, 1006]) {
      const ctx = await browser.newContext();
      await ctx.addInitScript(
        ({ key, fixture, code }) => {
          localStorage.setItem(key, fixture);
          const originalTimeout = window.setTimeout.bind(window);
          window.setTimeout = (fn, delay, ...args) =>
            originalTimeout(fn, Math.min(delay, 10), ...args);
          window.WebSocket = class {
            static OPEN = 1;
            readyState = 0;
            constructor() {
              originalTimeout(() => {
                this.readyState = 1;
                this.onopen?.();
                originalTimeout(() => {
                  this.readyState = 3;
                  this.onclose?.({ code });
                }, 2);
              }, 2);
            }
            close() {
              this.readyState = 3;
            }
            send() {}
          };
        },
        { key, fixture, code },
      );
      const p = await ctx.newPage();
      await p.goto(url);
      await p.waitForTimeout(250);
      assert.equal(await p.evaluate((k) => localStorage.getItem(k), key), fixture);
      assert.equal(await p.locator('#welcome').isVisible(), code === 1005);
      if (code === 1005) assert.equal(await p.locator('#resume-saved').isVisible(), true);
      console.log(
        code === 1005
          ? 'Repeated server refusal offers retry and retains saved link'
          : 'Network failures retain login and continue retrying',
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
