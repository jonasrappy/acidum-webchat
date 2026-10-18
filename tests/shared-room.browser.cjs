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
    const base = 1700000000000;
    const event = (account, time, type, extra = {}) => ({
      me: { name: account },
      type,
      time: base + time,
      user: { name: 'Alma' },
      ...extra,
    });
    const fixtures = {};
    for (const [account, room] of [
      ['Nova', 12],
      ['Milo', 12],
      ['Iris', 7],
    ])
      fixtures[account] = [
        event(account, 0, 'room', {
          room: { id: room, name: room === 12 ? 'Town Square' : 'Cafe' },
        }),
      ];
    fixtures.Nova.push(
      event('Nova', 100, 'text', { text: 'Shared message' }),
      event('Nova', 200, 'text', { text: 'Echo' }),
      event('Nova', 250, 'text', { text: 'Echo' }),
      event('Nova', 300, 'priv', {
        from: { name: 'Alma' },
        to: { name: 'Nova' },
        text: 'Privat besked',
      }),
    );
    fixtures.Milo.push(
      event('Milo', 109, 'text', { text: 'Shared message', log: true }),
      event('Milo', 210, 'text', { text: 'Echo' }),
      event('Milo', 260, 'text', { text: 'Echo' }),
      event('Milo', 300, 'priv', {
        from: { name: 'Alma' },
        to: { name: 'Milo' },
        text: 'Privat besked',
      }),
    );
    fixtures.Iris.push(event('Iris', 100, 'text', { text: 'Shared message' }));
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Nova', 'Milo', 'Iris'] }));
      ws.onMessage((raw) => {
        const data = JSON.parse(raw);
        if (data.lastLine === 0) ws.send(JSON.stringify(fixtures[data.name] || []));
      });
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_shared_room_login');
    await page.locator('#connect-form').evaluate((f) => f.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 8);
    const shared = await page
      .locator('.message-text')
      .filter({ hasText: 'Shared message' })
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          accounts: [...node.closest('.message-group').querySelectorAll('.message-account')].map(
            (tag) => tag.textContent,
          ),
          attention: node.closest('.message').classList.contains('attention'),
        })),
      );
    assert.deepEqual(shared.map((item) => item.accounts).sort(), [['Iris'], ['Milo', 'Nova']]);
    assert.equal(shared.find((item) => item.accounts.includes('Nova')).attention, true);
    assert.equal(await page.locator('.message-text').filter({ hasText: 'Echo' }).count(), 2);
    assert.equal(await page.locator('.message.private').count(), 2);
    await page.locator('#send-as').selectOption('Milo');
    await page
      .locator('.message-group')
      .filter({ has: page.locator('.message-account', { hasText: 'Nova' }) })
      .filter({ hasText: 'Shared message' })
      .locator('.message-name')
      .click();
    assert.equal(await page.locator('#person-account').textContent(), 'Milo');
    await page.locator('#person-dialog .close-sheet').click();
    await page.screenshot({ path: '/tmp/acidum-dedup-mobile.png' });
    await page.locator('#mobile-accounts button').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 5);
    assert.equal(
      await page.locator('.message-text').filter({ hasText: 'Shared message' }).count(),
      1,
    );
    await page.locator('#mobile-accounts button').nth(2).click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 5);
    await page.locator('#mobile-accounts button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 8);
    await page.locator('#bottom-log').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 1);
    assert.deepEqual(await page.locator('.message-account').allTextContents(), ['Milo', 'Nova']);
    await page.locator('#bottom-chat').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 8);
    socket.send(JSON.stringify(event('Nova', 400, 'text', { text: 'Live shared' })));
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.message-text')].some(
        (node) => node.textContent === 'Live shared',
      ),
    );
    await page.evaluate(
      () =>
        (window.initialLiveRow = [...document.querySelectorAll('.message-text')]
          .find((node) => node.textContent === 'Live shared')
          .closest('.message')),
    );
    socket.send(JSON.stringify(event('Milo', 410, 'text', { text: 'Live shared' })));
    await page.waitForFunction(() => {
      const node = [...document.querySelectorAll('.message-text')].find(
        (node) => node.textContent === 'Live shared',
      );
      return node?.closest('.message-group').querySelectorAll('.message-account').length === 2;
    });
    assert.equal(await page.locator('.message-text').filter({ hasText: 'Live shared' }).count(), 1);
    assert.equal(await page.evaluate(() => window.initialLiveRow.isConnected), true);
    socket.send(
      JSON.stringify(event('Iris', 500, 'room', { room: { id: 12, name: 'Town Square' } })),
    );
    for (const [index, account] of ['Nova', 'Milo', 'Iris'].entries())
      socket.send(
        JSON.stringify(
          event(account, 600 + index * 10, 'text', { text: 'All three accounts receive this' }),
        ),
      );
    await page.waitForFunction(() => {
      const node = [...document.querySelectorAll('.message-text')].find(
        (node) => node.textContent === 'All three accounts receive this',
      );
      return node?.closest('.message-group').querySelectorAll('.message-account').length === 3;
    });
    assert.equal(
      await page
        .locator('.message-text')
        .filter({ hasText: 'All three accounts receive this' })
        .count(),
      1,
    );
    assert.equal(
      await page.locator('.message-text').filter({ hasText: 'Shared message' }).count(),
      2,
    );
    const sharedRow = page
      .locator('.message')
      .filter({ hasText: 'All three accounts receive this' });
    await sharedRow.locator('.message-time').click();
    await page.locator('#save-message').click();
    await page.locator('#message-dialog .close-sheet').click();
    assert.equal(await sharedRow.locator('.saved-marker').isVisible(), true);
    await sharedRow.locator('.message-time').click();
    assert.equal(await page.locator('#save-message').textContent(), 'Remove from saved');
    await page.locator('#save-message').click();
    await page.locator('#message-dialog .close-sheet').click();
    assert.equal(await sharedRow.locator('.saved-marker').isVisible(), false);
    for (const [index, account] of ['Nova', 'Milo', 'Iris'].entries())
      socket.send(
        JSON.stringify(event(account, 700 + index * 10, 'join', { user: { name: 'Guest' } })),
      );
    await page.waitForFunction(
      () => document.querySelectorAll('.movement-icon.enter').length === 1,
    );
    await page.locator('#search-toggle').click();
    await page.locator('#private-toggle').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 2);
    assert.equal(await page.locator('.message.private').count(), 2);
    assert.deepEqual(errors, []);
    console.log(
      'Shared room copies display once with all receiving accounts; repeats, different rooms, private messages, later room changes and attention markers remain correct',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
