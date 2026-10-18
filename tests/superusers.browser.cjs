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
    const event = (time, type, extra = {}, account = 'Nova') => ({
      time: 1700000000000 + time,
      type,
      me: { name: account },
      ...extra,
    });
    const room = (account, users = []) =>
      event(
        1,
        'room',
        {
          room: { id: 12, name: 'Torvet' },
          users,
        },
        account,
      );
    const quiet = (account) =>
      event(
        2,
        'text',
        {
          user: { name: 'QuietMod' },
          text: 'Besked fra en stille superbruger',
        },
        account,
      );
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Nova', 'Milo'] }));
      ws.onMessage((raw) => {
        const request = JSON.parse(raw);
        if (request.lastLine !== 0) return;
        ws.send(
          JSON.stringify(
            request.name === 'Nova'
              ? [
                  room('Nova', [{ name: 'QuietMod', superuser: 1 }]),
                  quiet('Nova'),
                  event(3, 'text', { user: { name: 'PanicMod' }, text: 'Besked før panic' }),
                  event(4, 'text', {
                    user: { name: 'Alma' },
                    text: 'Ordet superbruger giver ingen markering',
                  }),
                  event(5, 'join', { user: { name: 'DirectMod', superuser: true } }),
                  event(6, 'text', { user: { name: 'DirectMod' }, text: 'Hej Nova', notify: true }),
                  event(7, 'priv', {
                    from: { name: 'WhisperMod', superuser: true },
                    to: { name: 'Nova' },
                    text: 'Privat besked',
                  }),
                ]
              : [room('Milo'), quiet('Milo')],
          ),
        );
      });
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    await page.locator('#chat-link').fill('synthetic_superusers_login');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 7);
    const group = (name) =>
      page.locator('.message-group').filter({
        has: page.locator('.message-name', { hasText: name }),
      });
    assert.equal(await page.locator('.message-group.superuser').count(), 3);
    assert.deepEqual(await group('QuietMod').locator('.message-account').allTextContents(), [
      'Milo',
      'Nova',
    ]);
    assert.equal(await group('QuietMod').locator('.message').count(), 1);
    assert.equal(await group('DirectMod').locator('.message').count(), 2);
    assert.equal(await group('DirectMod').locator('.attention').count(), 1);
    assert.equal(await group('WhisperMod').locator('.private-label').textContent(), 'Hvisken');
    assert.equal(
      await group('QuietMod').locator('.message-name').getAttribute('title'),
      'Superbruger',
    );
    const style = await group('DirectMod').evaluate((node) => ({
      name: getComputedStyle(node.querySelector('.message-name')).color,
      background: getComputedStyle(node).backgroundColor,
      border: getComputedStyle(node).boxShadow,
    }));
    assert.equal(style.name, 'rgb(255, 196, 119)');
    assert.ok(style.border.includes('rgb(255, 196, 119)'));
    assert.notEqual(
      style.background,
      await group('Alma').evaluate((node) => getComputedStyle(node).backgroundColor),
    );
    await page.locator('#bottom-settings').click();
    await page.locator('#show-events').uncheck();
    await page.locator('#settings-dialog .close-sheet').click();
    await page.waitForFunction(() => document.querySelectorAll('.message').length === 5);
    await group('PanicMod').evaluate((node) => (window.panicGroup = node));
    socket.send(JSON.stringify(event(8, 'log', { event: 'panic', users: [{ name: 'PanicMod' }] })));
    await page.waitForFunction(
      () => document.querySelectorAll('.message-group.superuser').length === 4,
    );
    assert.equal(await page.locator('.message').count(), 5);
    assert.equal(await group('PanicMod').evaluate((node) => node === window.panicGroup), true);
    socket.send(JSON.stringify(event(9, 'log', { event: 'panic', users: [] })));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.message-group.superuser').count(), 4);
    await page.screenshot({ path: '/tmp/acidum-superusers-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '/tmp/acidum-superusers-desktop.png' });
    assert.deepEqual(errors, []);
    console.log(
      'Superuser snapshots, grouped text, whispers, merged accounts and late panic markers pass',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
