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
    let socket;
    const base = Date.now() - 60000;
    const event = (account, time, type, extra = {}) => ({
      me: { name: account },
      user: { name: 'Nova' },
      type,
      time: base + time,
      ...extra,
    });
    const fixtures = {
      Nova: [
        event('Nova', 0, 'room', { room: { id: 12, name: 'Town Square' } }),
        event('Nova', 100, 'text', { text: 'My public message' }),
        event('Nova', 199, 'join', { user: { name: 'nOvA' } }),
        event('Nova', 200, 'text', { user: { name: 'nOvA' }, text: 'Mixed case sender' }),
        event('Nova', 201, 'text', { user: { name: 'nOvA' }, text: 'Another message from me' }),
        event('Nova', 300, 'priv', {
          from: { name: 'Nova' },
          to: { name: 'Alma' },
          text: 'My outgoing whisper',
        }),
        event('Nova', 400, 'priv', {
          from: { name: 'Alma' },
          to: { name: 'Nova' },
          text: 'An incoming whisper',
        }),
        event('Nova', 500, 'priv', {
          from: { name: 'Milo' },
          to: { name: 'Nova' },
          text: 'From my other account',
        }),
        event('Nova', 600, 'text', { text: 'A marked message', log: true }),
        event('Nova', 700, 'text', {
          user: { name: 'Guest' },
          text: 'An ordinary incoming message',
        }),
        event('Nova', 800, 'text', {
          user: { name: 'Alma' },
          text: 'Nova is mentioned here',
        }),
      ],
      Milo: [
        event('Milo', 0, 'room', { room: { id: 12, name: 'Town Square' } }),
        event('Milo', 100, 'text', { text: 'My public message' }),
      ],
      Guest: [event('Guest', 0, 'room', { room: { id: 7, name: 'Cafe' } })],
    };
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Nova', 'Milo'] }));
      ws.onMessage((raw) => {
        const request = JSON.parse(raw);
        if (request.lastLine === 0) ws.send(JSON.stringify(fixtures[request.name] || []));
      });
    });
    const row = (text) => page.locator('.message').filter({ hasText: text });
    const group = (text) => page.locator('.message-group').filter({ has: row(text) });
    const ownCount = () => page.locator('.message-group.own').count();
    const checkMarked = async () => {
      await page.waitForFunction(
        () => document.querySelectorAll('.message-group.own').length === 5,
      );
      assert.equal(await row('My public message').count(), 1);
      assert.equal(await group('Mixed case sender').locator('.message').count(), 3);
      assert.equal(await group('Mixed case sender').locator('.message-name').count(), 1);
      for (const text of [
        'My public message',
        'Mixed case sender',
        'My outgoing whisper',
        'From my other account',
      ]) {
        assert.equal(await group(text).evaluate((node) => node.classList.contains('own')), true);
        assert.equal(
          await row(text)
            .locator('.message-text')
            .evaluate((node) => getComputedStyle(node).borderLeftWidth),
          '0px',
        );
        assert.equal(
          await row(text)
            .locator('.message-text')
            .evaluate((node) => getComputedStyle(node).backgroundColor),
          'rgba(0, 0, 0, 0)',
        );
      }
      for (const text of [
        'An incoming whisper',
        'An ordinary incoming message',
        'Nova is mentioned here',
      ])
        assert.equal(await group(text).evaluate((node) => node.classList.contains('own')), false);
      assert.equal(await page.locator('.message.own').count(), 0);
      assert.equal(
        await page
          .locator('.message-group.own')
          .evaluateAll((groups) =>
            groups.every((node) => node.querySelector('.message:not(.system)')),
          ),
        true,
      );
      assert.notEqual(
        await group('Mixed case sender').evaluate((node) => getComputedStyle(node).backgroundColor),
        await group('An ordinary incoming message').evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        ),
      );
      const background = (text) =>
        row(text)
          .locator('.message-text')
          .evaluate((node) => getComputedStyle(node).backgroundColor);
      assert.notEqual(await background('A marked message'), await background('My public message'));
      assert.equal(
        await row('A marked message').evaluate((node) => node.classList.contains('attention')),
        true,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    };
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_own_messages_login_123');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await checkMarked();
    await page.screenshot({ path: '/tmp/acidum-own-messages-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.overview').waitFor();
    await checkMarked();
    assert.equal(await page.locator('.message-accounts').count(), 0);
    await page.screenshot({ path: '/tmp/acidum-own-messages-desktop.png' });
    await page.locator('#layout-timeline').click();
    await page.locator('#messages').waitFor();
    await checkMarked();
    await page.locator('#layout-overview').click();
    await page.locator('#settings-button').click();
    assert.equal(await page.locator('#highlight-own-messages').isChecked(), true);
    await page.evaluate(() => {
      window.originalRows = [...document.querySelectorAll('.message')];
    });
    await page.locator('#highlight-own-messages').uncheck();
    assert.equal(await ownCount(), 0);
    assert.equal(
      await page.evaluate(() => window.originalRows.every((node) => node.isConnected)),
      true,
    );
    await page.reload();
    await row('My public message').waitFor();
    assert.equal(await ownCount(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#bottom-settings').click();
    assert.equal(await page.locator('#highlight-own-messages').isChecked(), false);
    await page.locator('#highlight-own-messages').check();
    await page.locator('#settings-dialog .close-sheet').click();
    await checkMarked();
    await page.reload();
    await checkMarked();
    socket.send(JSON.stringify({ tabs: ['Nova', 'Milo', 'Guest'] }));
    await page.waitForFunction(() => document.querySelectorAll('.message-group.own').length === 6);
    assert.equal(
      await group('An ordinary incoming message').evaluate((node) =>
        node.classList.contains('own'),
      ),
      true,
    );
    socket.send(JSON.stringify({ tabs: ['Nova', 'Milo'] }));
    await checkMarked();
    await page.locator('#mobile-accounts button').nth(1).click();
    await checkMarked();
    assert.deepEqual(errors, []);
    console.log(
      'Own messages, shared room copies, case variants, whispers, account changes, alert priority, responsive views, and persistent settings pass',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
