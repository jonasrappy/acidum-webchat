const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [],
      sent = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('acium-webchat-save-history', 'yes');
    });
    const accounts = ['Nova', 'Milo', 'Iris', 'Luna', 'Otto', 'Echo'];
    let time = Date.now() - 60000,
      socket;
    const event = (account, type, extra = {}) => ({
      me: { name: account },
      user: { name: 'Alma' },
      time: ++time,
      type,
      ...extra,
    });
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: accounts }));
      ws.onMessage((raw) => {
        const request = JSON.parse(raw);
        if (request.say !== undefined) sent.push(request);
        else if (request.lastLine === 0)
          ws.send(
            JSON.stringify([
              event(request.name, 'room', {
                room: { id: accounts.indexOf(request.name) + 1, name: 'Room ' + request.name },
                users: [{ name: request.name }, { name: 'Alma' }],
              }),
              ...Array.from({ length: request.name === 'Echo' ? 2 : 120 }, (_, index) =>
                event(request.name, 'text', { text: `${request.name} message ${index}` }),
              ),
            ]),
          );
      });
    });
    const panel = (name) =>
      page
        .locator('.room-panel')
        .filter({ has: page.getByRole('button', { name: 'Reply as ' + name, exact: true }) });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_overview_login_123');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.room-panel').length === 6);
    await panel('Echo').locator('.message-text').filter({ hasText: 'Echo message 1' }).waitFor();
    assert.ok((await page.locator('.message').count()) <= 250);
    const positions = await page.locator('.room-panel').evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, right, bottom } = node.getBoundingClientRect();
        return { x, y, right, bottom };
      }),
    );
    assert.equal(new Set(positions.map((p) => p.x)).size, 3);
    assert.equal(new Set(positions.map((p) => p.y)).size, 2);
    assert.ok(positions.every((p) => p.right <= 1920 && p.bottom <= 1080));
    for (const name of accounts)
      assert.equal(
        await panel(name)
          .locator('.panel-messages')
          .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight < 2),
        true,
      );

    await page.locator('#message').fill('Nova draft');
    await page.getByRole('button', { name: 'Reply as Milo', exact: true }).click();
    assert.equal(await page.locator('#view-title').textContent(), 'All chats');
    assert.equal(await page.locator('#send-as').inputValue(), 'Milo');
    assert.equal(await page.locator('#message').inputValue(), '');
    assert.equal(
      await page.locator('#message').evaluate((node) => node === document.activeElement),
      true,
    );
    await page.locator('#message').fill('Milo reply');
    await page.locator('#message').press('Enter');
    await page.waitForFunction(() => document.querySelector('#message').value === '');
    assert.deepEqual(sent, [{ name: 'Milo', say: 'Milo reply' }]);
    await page.getByRole('button', { name: 'Reply as Nova', exact: true }).click();
    assert.equal(await page.locator('#message').inputValue(), 'Nova draft');

    await panel('Nova')
      .locator('.panel-messages')
      .evaluate((node) => {
        node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
        node.dispatchEvent(new Event('scroll'));
        window.oldScroll = node.scrollTop;
        window.pausedRows = [...node.querySelectorAll('.message')];
      });
    await panel('Echo')
      .locator('.message')
      .last()
      .evaluate((node) => {
        window.quietRow = node;
      });
    socket.send(
      JSON.stringify([
        event('Nova', 'text', { text: 'Nova needs your attention', log: true }),
        event('Milo', 'text', { text: 'Milo continues live' }),
      ]),
    );
    await panel('Milo')
      .locator('.message-text')
      .filter({ hasText: 'Milo continues live' })
      .waitFor();
    await panel('Nova').locator('.panel-latest').waitFor();
    assert.equal(
      await panel('Nova')
        .locator('.panel-messages')
        .evaluate((node) => node.scrollTop),
      await page.evaluate(() => window.oldScroll),
    );
    assert.equal(
      await page.evaluate(() => window.pausedRows.every((node) => node.isConnected)),
      true,
    );
    assert.equal(await page.evaluate(() => window.quietRow.isConnected), true);
    assert.equal(await panel('Nova').locator('.badge').textContent(), '1');
    assert.deepEqual(
      await page.locator('.room-panel').evaluateAll((nodes) =>
        nodes.map((node) => {
          const { x, y, right, bottom } = node.getBoundingClientRect();
          return { x, y, right, bottom };
        }),
      ),
      positions,
    );
    await panel('Nova').locator('.panel-latest').click();
    await panel('Nova')
      .locator('.message-text')
      .filter({ hasText: 'Nova needs your attention' })
      .waitFor();
    assert.equal(await panel('Nova').locator('.badge').count(), 0);

    socket.send(
      JSON.stringify(
        Array.from({ length: 900 }, (_, index) =>
          event('Nova', 'text', { text: 'Busy room ' + index }),
        ),
      ),
    );
    await panel('Nova')
      .locator('.message-text')
      .filter({ hasText: 'Busy room 899', exact: true })
      .waitFor();
    assert.equal(
      await panel('Echo')
        .locator('.message-text')
        .filter({ hasText: 'Echo message 1', exact: true })
        .count(),
      1,
    );
    assert.ok((await page.locator('.message').count()) <= 250);
    for (const count of [141, 241, 341, 441, 541, 641, 700, 841, 941]) {
      await panel('Nova')
        .locator('.panel-older')
        .evaluate((node) => node.click());
      await page.waitForFunction((expected) => {
        const panel = [...document.querySelectorAll('.room-panel')].find((node) =>
          node.querySelector('[aria-label="Reply as Nova"]'),
        );
        return panel.querySelectorAll('.message').length >= expected;
      }, count);
    }
    assert.equal(
      await panel('Nova')
        .locator('.message-text')
        .filter({ hasText: 'Busy room 0', exact: true })
        .count(),
      1,
    );
    assert.equal(await panel('Echo').locator('.message').count(), 3);
    await page.screenshot({ path: '/tmp/acidum-overview-desktop.png' });

    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('Echo message 1');
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 1);
    assert.equal(await page.locator('.room-panel').count(), 6);
    await page.locator('#search').fill('');
    await page.locator('#search').press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('.message').length > 10);
    socket.send(
      JSON.stringify(
        event('Milo', 'room', {
          room: { id: 1, name: 'Room Nova' },
          users: [{ name: 'Nova' }, { name: 'Milo' }, { name: 'Alma' }],
        }),
      ),
    );
    await page.waitForFunction(() => document.querySelectorAll('.room-panel').length === 5);
    const sharedTime = ++time;
    socket.send(
      JSON.stringify(
        ['Nova', 'Milo'].flatMap((name) => [
          { ...event(name, 'text', { text: 'One shared public message' }), time: sharedTime },
          event(name, 'priv', {
            from: { name: 'Alma' },
            to: { name },
            text: 'Separate private copy',
          }),
        ]),
      ),
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.message-text')].filter(
          (node) => node.textContent === 'One shared public message',
        ).length === 1,
    );
    assert.deepEqual(
      await page
        .locator('.message-group')
        .filter({ hasText: 'One shared public message' })
        .locator('.message-account')
        .allTextContents(),
      ['Milo', 'Nova'],
    );
    assert.equal(
      await page.locator('.message.private').filter({ hasText: 'Separate private copy' }).count(),
      2,
    );
    await page.locator('#search-toggle').click();
    await page.locator('#private-toggle').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 2);
    assert.equal(await page.locator('.message.private').count(), 2);
    await page.locator('#private-toggle').click();
    await page.locator('#search').press('Escape');

    await page.locator('#layout-timeline').click();
    assert.equal(await page.locator('.room-panel').count(), 0);
    assert.equal(await page.locator('#messages').count(), 1);
    await page.reload();
    await page.locator('#layout-timeline[aria-pressed=true]').waitFor();
    assert.equal(await page.locator('.room-panel').count(), 0);
    await page.locator('#layout-overview').click();
    await page.waitForFunction(() => document.querySelectorAll('.room-panel').length === 6);
    for (const [width, height] of [
      [1440, 900],
      [1100, 800],
      [390, 844],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        (wide) => Boolean(document.querySelector('.overview')) === wide,
        width >= 1100,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.equal(
        await page.locator('#timeline').evaluate((node) => node.scrollWidth > node.clientWidth),
        false,
      );
    }
    await page.setViewportSize({ width: 1100, height: 600 });
    await page.waitForTimeout(100);
    socket.send(JSON.stringify(event('Echo', 'text', { text: 'Offscreen attention', log: true })));
    await panel('Echo').locator('.badge').waitFor();
    assert.equal(await panel('Echo').locator('.badge').textContent(), '1');
    await page.locator('#timeline').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Reply as Echo"] .badge'),
    );
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page
      .locator('#accounts button')
      .filter({ has: page.locator('.account-name', { hasText: /^Nova$/ }) })
      .click();
    await page.locator('#room-people').waitFor();
    assert.equal(await page.locator('#send-as').count(), 0);
    await page
      .locator('#room-people button')
      .filter({ hasText: /^Alma$/ })
      .waitFor();
    socket.send(JSON.stringify(event('Nova', 'join', { user: { name: 'NewGuest' } })));
    await page
      .locator('#room-people button')
      .filter({ hasText: /^NewGuest$/ })
      .waitFor();
    socket.send(
      JSON.stringify(
        event('Nova', 'part', { user: { name: 'NewGuest' }, room: { id: 53, name: 'X-perten' } }),
      ),
    );
    await page.waitForFunction(
      () => !document.querySelector('#room-people').textContent.includes('NewGuest'),
    );
    socket.send(
      JSON.stringify(
        event('Nova', 'room', {
          room: { id: 8, name: 'New room' },
          users: [{ name: 'QuietGuest' }],
        }),
      ),
    );
    await page
      .locator('#room-people button')
      .filter({ hasText: /^QuietGuest$/ })
      .waitFor();
    assert.equal(
      await page
        .locator('#room-people button')
        .filter({ hasText: /^Alma$/ })
        .count(),
      0,
    );
    socket.send(
      JSON.stringify(event('Nova', 'log', { event: 'panic', users: [{ name: 'QuietGuest' }] })),
    );
    await page
      .locator('#room-people button.superuser')
      .filter({ hasText: /^QuietGuest$/ })
      .waitFor();
    await page.screenshot({ path: '/tmp/acidum-single-desktop.png' });
    await page.getByRole('button', { name: 'Hide room participants', exact: true }).click();
    assert.equal(await page.locator('#room-people').count(), 0);
    await page.getByRole('button', { name: 'Show room participants', exact: true }).click();
    await page.locator('#room-people').waitFor();
    await page.locator('#settings-button').click();
    assert.equal(await page.getByLabel('Show room activity', { exact: true }).isChecked(), true);
    await page.locator('#mobile-exit').click();
    await page.locator('#chat-link').fill('synthetic_overview_second_login');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.room-panel').length === 6);
    assert.ok((await page.locator('.message').count()) <= 250);
    assert.equal(await page.locator('#message').inputValue(), '');
    assert.deepEqual(errors, []);
    console.log(
      'Six-room overview, bounded rendering, independent reading, lazy history, reply drafts, shared rooms, filters, responsive layouts, live participants, and login isolation pass',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
