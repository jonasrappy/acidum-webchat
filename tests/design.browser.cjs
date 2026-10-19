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
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const accounts = ['Nova', 'Milo', 'EtMegetLangtBrugernavn'];
    let time = Date.now() - 60000;
    await page.routeWebSocket('wss://ws0.acium.app/**', (socket) => {
      socket.send(JSON.stringify({ tabs: accounts }));
      socket.onMessage((raw) => {
        const request = JSON.parse(raw);
        if (request.lastLine !== 0) return;
        socket.send(
          JSON.stringify([
            {
              me: { name: request.name },
              type: 'room',
              time: ++time,
              room: { id: 53, name: 'Et langt rumnavn med mange ord' },
              users: Array.from({ length: 80 }, (_, index) => ({ name: 'Deltager' + index })),
            },
            ...Array.from({ length: 8 }, (_, index) => ({
              me: { name: request.name },
              type: 'text',
              time: ++time,
              user: { name: 'Deltager' + index },
              text: 'Message ' + index,
            })),
          ]),
        );
      });
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_design_login_123');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.locator('.message-name').first().waitFor();

    const frame = () =>
      page.evaluate(() => {
        const bounds = (selector) => {
          const node = document.querySelector(selector);
          if (!node.getClientRects().length) return null;
          const { x, y, width, height } = node.getBoundingClientRect();
          return selector === '#view-title' ? { x, y } : { x, y, width, height };
        };
        return Object.fromEntries(
          [
            '.workspace',
            '.chat-main',
            '.chat-header',
            '#view-title',
            '#search-toggle',
            '#rooms-button',
            '#settings-button',
          ].map((selector) => [selector, bounds(selector)]),
        );
      });
    const messageBounds = () =>
      page.locator('#messages').evaluate((node) => {
        const { x, width } = node.getBoundingClientRect();
        return { x, width };
      });
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [768, 1024],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
    ]) {
      await page.setViewportSize({ width, height });
      const mobile = width <= 700;
      const all = page.locator(mobile ? '#mobile-accounts button' : '#all-button').first();
      await all.click();
      const expected = await frame();
      await page.locator(mobile ? '#bottom-log' : '#log-button').click();
      assert.deepEqual(await frame(), expected, `Event log frame at ${width}`);
      const logBounds = await messageBounds();
      await page
        .locator(mobile ? '#mobile-accounts button' : '#accounts button')
        .nth(mobile ? 1 : 0)
        .click();
      assert.deepEqual(await frame(), expected, `Account frame at ${width}`);
      if (width >= 1100) {
        await page.locator('#participants-toggle').click();
        assert.deepEqual(await frame(), expected, `Participant toggle at ${width}`);
        await page.locator('#participants-toggle').click();
      }
      await all.click();
      if (width >= 1100) {
        await page.locator('#layout-timeline').click();
        assert.deepEqual(await frame(), expected, `Timeline frame at ${width}`);
      }
      assert.deepEqual(await messageBounds(), logBounds, `Message width at ${width}`);
      if (width >= 1100) {
        await page.locator('#layout-overview').click();
        assert.deepEqual(await frame(), expected, `Overview frame at ${width}`);
      }
    }

    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.equal(
        await page.locator('#timeline').evaluate((node) => node.scrollWidth > node.clientWidth),
        false,
      );
      for (const control of await page.locator('#search-toggle, #send-as, .send-button').all()) {
        const bounds = await control.boundingBox();
        assert.ok(
          bounds.width >= 44 && bounds.height >= 44,
          `Control at ${width}: ${JSON.stringify(bounds)}`,
        );
      }
      const compactTargets = await page
        .locator('.message-time, .message-name')
        .evaluateAll((nodes) =>
          nodes.every((node) => {
            const bounds = node.getBoundingClientRect();
            return bounds.width >= 24 && bounds.height >= 24;
          }),
        );
      assert.equal(compactTargets, true);
    }
    await page.locator('#accounts button').last().click();
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForFunction(() => {
      const list = document.querySelector('#mobile-accounts').getBoundingClientRect();
      const tab = document
        .querySelector('#mobile-accounts [aria-selected=true]')
        .getBoundingClientRect();
      return tab.left >= list.left && tab.right <= list.right;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const widths = await page
      .locator('#mobile-accounts .nav-item')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    assert.ok(widths[3] > widths[1]);
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('ingen resultater');
    await page.locator('#empty h2').filter({ hasText: 'No messages found' }).waitFor();
    await page.locator('#search').press('Escape');
    assert.equal(
      await page.locator('#search-toggle').evaluate((node) => node === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: 'Remove search filter', exact: true }).click();
    await page.locator('.message-name').first().waitFor();
    await page.locator('#search-toggle').click();
    await page.locator('#private-toggle').click();
    await page.locator('#search').press('Escape');
    await page.getByRole('button', { name: 'Show all messages again', exact: true }).click();
    await page.locator('.message-name').first().waitFor();
    assert.equal(await page.locator('#view-filters').isVisible(), false);
    assert.equal(await page.locator('#send').isDisabled(), true);
    await page.locator('#message').fill('Hello');
    assert.equal(await page.locator('#send').isDisabled(), false);

    await page.locator('#bottom-settings').click();
    await page.locator('#settings-dialog[open]').waitFor();
    assert.equal(await page.locator('.bottom-nav .selected').count(), 1);
    const header = page.locator('#settings-dialog .sheet-header');
    const before = await header.boundingBox();
    await page
      .locator('#settings-dialog .sheet-body')
      .evaluate((node) => (node.scrollTop = node.scrollHeight));
    const after = await header.boundingBox();
    assert.equal(after.y, before.y);
    assert.equal(await page.locator('#settings-dialog .close-sheet').isVisible(), true);
    await page.locator('#mobile-exit').focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page
        .locator('#settings-dialog .close-sheet')
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('#bottom-settings').evaluate((node) => node === document.activeElement),
      true,
    );
    await page.locator('#bottom-settings').click();
    assert.equal(
      await page.locator('#settings-dialog .sheet-body').evaluate((node) => node.scrollTop),
      0,
    );
    await page.locator('#text-size').focus();
    await page.locator('#text-size').press('End');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 568 });
    await page
      .locator('#message')
      .fill('A long message that should still leave enough room to send. '.repeat(2).slice(0, 100));
    const controls = await page.locator('#composer').evaluate((form) => {
      const bounds = form.getBoundingClientRect();
      return [...form.children]
        .filter((node) => !node.hidden)
        .every((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right;
        });
    });
    assert.equal(controls, true);
    assert.equal(
      await page.locator('#timeline').evaluate((node) => node.scrollWidth > node.clientWidth),
      false,
    );
    await page.locator('#bottom-rooms').click();
    await page.locator('#rooms-dialog[open]').waitFor();
    await page.locator('.room-people summary').first().click();
    await page
      .locator('#rooms-dialog .sheet-body')
      .evaluate((node) => (node.scrollTop = node.scrollHeight));
    assert.equal(
      await page.locator('#rooms-dialog .sheet-header').evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= innerHeight;
      }),
      true,
    );
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
    await page.locator('#connection-notice').waitFor();
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.ok((await page.locator('#message').inputValue()).startsWith('A long message'));
    assert.deepEqual(errors, []);
    console.log(
      'Stable view frames, touch targets, responsive long names, removable filters, modal scroll/focus, large text and offline feedback pass',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
