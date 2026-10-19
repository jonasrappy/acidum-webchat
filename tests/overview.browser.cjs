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
    const input = (name) => page.getByRole('combobox', { name: 'Message as ' + name, exact: true });
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
    assert.equal(new Set(positions.map((p) => p.x)).size, 2);
    assert.equal(new Set(positions.map((p) => p.y)).size, 3);
    assert.ok(positions.every((p) => p.right <= 1920 && p.bottom <= 1080));
    for (const name of accounts)
      assert.equal(
        await panel(name)
          .locator('.panel-messages')
          .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight < 2),
        true,
      );

    assert.equal(await page.locator('.composer-form').count(), 6);
    assert.equal(
      await page.locator('#composer, #message, #send-as, .room-panel select').count(),
      0,
    );
    assert.equal(
      await page
        .locator('[id]')
        .evaluateAll((nodes) => new Set(nodes.map((node) => node.id)).size === nodes.length),
      true,
    );
    await input('Nova').fill('Nova draft');
    await page.getByRole('button', { name: 'Reply as Milo', exact: true }).click();
    assert.equal(await page.locator('#view-title').textContent(), 'All chats');
    assert.equal(await panel('Milo').locator('.sender-label').textContent(), 'Milo');
    assert.equal(await input('Milo').inputValue(), '');
    assert.equal(await input('Milo').evaluate((node) => node === document.activeElement), true);
    await input('Milo').fill('Milo reply');
    await input('Milo').press('Enter');
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Message as Milo"]').value === '',
    );
    assert.deepEqual(sent, [{ name: 'Milo', say: 'Milo reply' }]);
    await page.getByRole('button', { name: 'Reply as Nova', exact: true }).click();
    assert.equal(await input('Nova').inputValue(), 'Nova draft');
    await input('Milo').fill('Milo draft');
    await input('Iris').fill('@Mil');
    assert.equal(await input('Iris').getAttribute('aria-expanded'), 'false');
    await input('Iris').fill('@A');
    await page.getByRole('option', { name: 'Alma', exact: true }).click();
    assert.equal(await input('Iris').inputValue(), 'Alma ');
    assert.equal(await input('Nova').inputValue(), 'Nova draft');
    await panel('Nova')
      .locator('.composer-form')
      .evaluate((form) => form.requestSubmit());
    assert.deepEqual(sent.at(-1), { name: 'Nova', say: 'Nova draft' });
    assert.equal(await input('Nova').inputValue(), '');
    assert.equal(await input('Milo').inputValue(), 'Milo draft');
    assert.equal(await input('Iris').inputValue(), 'Alma ');
    await input('Nova').fill('Nova draft');

    await page.locator('#settings-button').click();
    await page.getByRole('radio', { name: 'One bottom bar', exact: true }).check();
    await page.locator('#settings-dialog .close-sheet').click();
    assert.equal(await page.locator('.room-panel').count(), 6);
    assert.equal(await page.locator('.composer-form').count(), 1);
    assert.equal(await page.locator('.panel-composers').count(), 0);
    assert.equal(await page.locator('#message').inputValue(), 'Nova draft');
    await page.getByRole('button', { name: 'Reply as Milo', exact: true }).click();
    assert.equal(await page.locator('#send-as').inputValue(), 'Milo');
    assert.equal(await page.locator('#message').inputValue(), 'Milo draft');
    assert.equal(
      await page.locator('#message').evaluate((node) => node === document.activeElement),
      true,
    );
    await page.locator('#message').fill('Shared bar reply');
    await page.locator('#message').press('Enter');
    assert.deepEqual(sent.at(-1), { name: 'Milo', say: 'Shared bar reply' });
    await page.locator('#message').fill('Milo draft');
    await page.reload();
    await page.locator('#send-as').waitFor();
    assert.equal(await page.locator('.composer-form').count(), 1);
    await page.locator('#settings-button').click();
    assert.equal(
      await page.getByRole('radio', { name: 'One bottom bar', exact: true }).isChecked(),
      true,
    );
    await page.getByRole('radio', { name: 'Under each chat', exact: true }).check();
    await page.locator('#settings-dialog .close-sheet').click();
    assert.equal(await page.locator('.composer-form').count(), 6);
    assert.equal(await input('Nova').inputValue(), 'Nova draft');
    assert.equal(await input('Milo').inputValue(), 'Milo draft');
    assert.equal(await input('Iris').inputValue(), 'Alma ');
    await page.reload();
    await input('Nova').waitFor();
    assert.equal(await page.locator('.composer-form').count(), 6);
    await page.locator('#settings-button').click();
    assert.equal(
      await page.getByRole('radio', { name: 'Under each chat', exact: true }).isChecked(),
      true,
    );
    await page.locator('#settings-dialog .close-sheet').click();
    await page.locator('.message').first().waitFor();

    for (const count of [3, 4, 5, 6]) {
      socket.send(JSON.stringify({ tabs: accounts.slice(0, count) }));
      await page.waitForFunction(
        (count) => document.querySelectorAll('.room-panel').length === count,
        count,
      );
      const layout = await page.locator('#timeline').evaluate((root) => {
        const bounds = root.getBoundingClientRect();
        const cards = [...root.querySelectorAll('.room-panel')].map((node) =>
          node.getBoundingClientRect(),
        );
        return {
          columns: new Set(cards.map((rect) => rect.x)).size,
          rows: new Set(cards.map((rect) => rect.y)).size,
          heights: cards.map((rect) => rect.height),
          visible: cards.every(
            (rect) => rect.top >= bounds.top && rect.bottom <= bounds.bottom + 1,
          ),
        };
      });
      assert.equal(layout.columns, 2);
      assert.equal(layout.rows, Math.ceil(count / 2));
      assert.ok(Math.max(...layout.heights) - Math.min(...layout.heights) < 1);
      assert.equal(layout.visible, true);
    }
    socket.send(JSON.stringify({ tabs: [...accounts, 'Extra'] }));
    await page.locator('#layout-overview:disabled').waitFor();
    assert.equal(await page.locator('.room-panel').count(), 0);
    assert.equal(await page.locator('#messages').count(), 1);
    assert.equal(await page.locator('#layout-timeline').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#send-as option').count(), 8);
    socket.send(JSON.stringify({ tabs: accounts }));
    await page.waitForFunction(() => document.querySelectorAll('.room-panel').length === 6);
    assert.equal(await page.locator('#layout-overview').isEnabled(), true);

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
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.panel-messages')].every(
        (node) => node.scrollHeight - node.scrollTop - node.clientHeight < 2,
      ),
    );
    socket.send(
      JSON.stringify(
        event('Milo', 'room', {
          room: { id: 1, name: 'Room Nova' },
          users: [{ name: 'Nova' }, { name: 'Milo' }, { name: 'Alma' }],
        }),
      ),
    );
    await page.waitForFunction(() => document.querySelectorAll('.room-panel').length === 5);
    assert.equal(await panel('Nova').locator('.composer-form').count(), 2);
    assert.equal(await input('Milo').inputValue(), 'Milo draft');
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
    await input('Nova').fill('Restored Nova draft');
    await input('Milo').fill('Restored Milo draft');
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Message as Nova"]')?.value === 'Restored Nova draft' &&
        document.querySelector('[aria-label="Message as Milo"]')?.value === 'Restored Milo draft',
    );
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
      if (width >= 1100) {
        assert.equal(await page.locator('.composer-form').count(), 6);
        assert.equal(await page.locator('#send-as').count(), 0);
        assert.equal(await input('Nova').inputValue(), 'Restored Nova draft');
        assert.equal(await input('Milo').inputValue(), 'Restored Milo draft');
      } else {
        assert.equal(await page.locator('.composer-form').count(), 1);
        await page.locator('#send-as').selectOption('Milo');
        assert.equal(await page.locator('#message').inputValue(), 'Restored Milo draft');
      }
      assert.equal(
        await page.locator('#timeline').evaluate((node) => node.scrollWidth > node.clientWidth),
        false,
      );
    }
    await page.setViewportSize({ width: 1100, height: 600 });
    await page.waitForTimeout(100);
    socket.send(JSON.stringify(event('Echo', 'text', { text: 'Visible attention', log: true })));
    await panel('Echo')
      .locator('.message-text')
      .filter({ hasText: 'Visible attention', exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator('#timeline')
        .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
      true,
    );
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
    assert.equal(await input('Nova').inputValue(), '');
    assert.equal(await input('Milo').inputValue(), '');
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
