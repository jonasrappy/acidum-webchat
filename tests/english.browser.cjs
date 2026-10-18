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
    const errors = [],
      sent = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let socket;
    await page.routeWebSocket('wss://ws0.acium.app/**', (ws) => {
      socket = ws;
      ws.send(JSON.stringify({ tabs: ['Nova', 'Milo'] }));
      ws.onMessage((raw) => {
        const request = JSON.parse(raw);
        if (request.say !== undefined) sent.push(request);
        else if (request.lastLine === 0)
          ws.send(
            JSON.stringify([
              {
                me: { name: request.name },
                type: 'room',
                room: { id: 12, name: 'Torvet' },
                time: Date.now(),
              },
              {
                me: { name: request.name },
                user: { name: 'Alma' },
                type: 'text',
                text: 'Hej, er kommet ind',
                time: Date.now() + 1,
              },
            ]),
          );
      });
    });
    await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.ok((await page.locator('#link-guide').textContent()).includes('Sign in to acidum'));
    await page.evaluate(async () => {
      const token = 'synthetic_english_login_123';
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const scope = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const legacy = (type, text, time, log = false, extra = {}) => ({
        account: 'Nova',
        name: 'Alma',
        key: JSON.stringify([time, type, 'Alma', text, log, false]),
        time,
        type,
        text,
        log,
        serverMarked: log,
        serverNotify: false,
        system: true,
        roomKey: 'id:12',
        ...extra,
      });
      const join = {
        ...legacy('join', 'er kommet ind', 1700000000000, true),
        text: 'joined the room',
      };
      const part = legacy('part', 'er gået til X-perten', 1700000001000, true, {
        destination: { id: 53, name: 'X-perten' },
        text: 'moved to X-perten',
      });
      const quit = {
        ...legacy('quit', 'har forladt chatten', 1699999999000),
        text: 'left the chat',
      };
      localStorage.setItem('acidum-events-' + scope, JSON.stringify([join, part]));
      localStorage.setItem(
        'acidum-local-' + scope,
        JSON.stringify({ drafts: [['Nova', 'Min kladde']], saved: [join] }),
      );
      localStorage.setItem('acium-webchat-save-history', 'yes');
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('acium-webchat-history', 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore('messages', { keyPath: 'archiveId' });
          store.createIndex('timeline', ['scope', 'time', 'archiveId']);
          store.createIndex('account', ['scope', 'account', 'time', 'archiveId']);
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('messages', 'readwrite');
          for (const message of [quit, join])
            tx.objectStore('messages').put({
              ...message,
              scope,
              archiveId: JSON.stringify([scope, message.account, message.key]),
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.reload();
    await page.locator('#chat-link').fill('synthetic_english_login_123');
    await page.locator('#connect-form').evaluate((form) => form.requestSubmit());
    await page.locator('.message-name').first().waitFor();
    assert.equal(await page.locator('#view-title').textContent(), 'All chats');
    assert.equal(await page.locator('#message').inputValue(), 'Min kladde');
    assert.ok(
      (await page.locator('.message-text').allTextContents()).includes('Hej, er kommet ind'),
    );
    await page.locator('#bottom-log').click();
    assert.deepEqual(await page.locator('.message-text').allTextContents(), [
      'er kommet ind',
      'er gået til X-perten (53)',
    ]);
    assert.ok((await page.locator('.day-divider').textContent()).includes('November'));
    await page.locator('.message-time').first().click();
    assert.equal(await page.locator('#message-preview').textContent(), 'er kommet ind');
    assert.equal(await page.locator('#save-message').textContent(), 'Remove from saved');
    await page.locator('#message-dialog .close-sheet').click();
    socket.send(
      JSON.stringify({
        me: { name: 'Nova' },
        user: { name: 'Alma' },
        type: 'join',
        time: 1700000000000,
        log: true,
      }),
    );
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.message').count(), 2);
    await page.locator('#bottom-chat').click();
    await page.locator('#older').click();
    await page.locator('.message-text').filter({ hasText: 'har forladt chatten' }).waitFor();
    await page.locator('#mobile-accounts button').nth(1).click();
    assert.equal(await page.locator('#send-as').count(), 0);
    assert.equal(await page.locator('#message').inputValue(), 'Min kladde');
    await page.locator('#message').fill('Nova draft');
    await page.locator('#mobile-accounts button').nth(2).click();
    assert.equal(await page.locator('#send-as').count(), 0);
    assert.equal(await page.locator('#message').inputValue(), '');
    await page.locator('#message').fill('Milo message');
    await page.locator('#message').press('Enter');
    await page.waitForFunction(() => document.querySelector('#message').value === '');
    assert.deepEqual(sent, [{ name: 'Milo', say: 'Milo message' }]);
    await page.locator('#message').fill('Milo draft');
    await page.locator('#mobile-accounts button').first().click();
    assert.equal(await page.locator('#send-as').inputValue(), 'Milo');
    assert.equal(await page.locator('#message').inputValue(), 'Milo draft');
    await page.locator('#send-as').selectOption('Nova');
    assert.equal(await page.locator('#message').inputValue(), 'Nova draft');
    assert.deepEqual(errors, []);
    console.log(
      'English UI, Danish chat events, unchanged user content, compatible saved data, and account-aware composer pass',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
