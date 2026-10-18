const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  let errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/') + '#demo');
  assert.equal(await page.getByText('BETA', { exact: true }).count(), 0);
  await page.locator('.message').first().waitFor();
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [667, 375],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(40);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `overflow at ${width}`,
    );
    assert.ok(
      (await page.locator('#timeline').evaluate((el) => el.clientHeight)) > 70,
      `timeline visible at ${width}`,
    );
    console.log('Viewport', width, height, 'fits');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--mobile-safe-bottom', '34px'),
  );
  const spacing = await page.evaluate(() => {
    const form = document.querySelector('#composer').getBoundingClientRect(),
      footer = document.querySelector('.composer-wrap').getBoundingClientRect(),
      nav = document.querySelector('.bottom-nav');
    return {
      gap: footer.bottom - form.bottom,
      navTop: nav.getBoundingClientRect().top,
      footerBottom: footer.bottom,
      safePadding: parseFloat(getComputedStyle(nav).paddingBottom),
    };
  });
  assert.ok(spacing.gap <= 7, JSON.stringify(spacing));
  assert.ok(Math.abs(spacing.navTop - spacing.footerBottom) < 1);
  assert.equal(spacing.safePadding, 34);
  await page.screenshot({ path: '/tmp/acidum-mobile-safe-area.png' });
  await page.evaluate(() => document.documentElement.style.removeProperty('--mobile-safe-bottom'));
  await page.screenshot({ path: '/tmp/acidum-qa-mobile-chat.png' });
  await page.locator('#mobile-accounts button').nth(2).click();
  await page.waitForTimeout(40);
  assert.equal(await page.locator('#view-title').textContent(), 'Milo');
  assert.equal(await page.locator('#send-as').inputValue(), 'Milo');
  await page.locator('#mobile-accounts [role=tab]').last().press('Home');
  assert.equal(await page.locator('#view-title').textContent(), 'Alle samtaler');
  await page.locator('#mobile-accounts [role=tab]').first().press('ArrowRight');
  assert.equal(await page.locator('#view-title').textContent(), 'Nova');
  await page.locator('#mobile-accounts [role=tab]').nth(1).press('End');
  assert.equal(await page.locator('#view-title').textContent(), 'Milo');
  await page.locator('#bottom-rooms').click();
  await page.locator('#rooms-dialog[open]').waitFor();
  assert.equal(await page.locator('.room-card').count(), 2);
  assert.ok((await page.locator('.people-list li').count()) > 0);
  await page.screenshot({ path: '/tmp/acidum-qa-mobile-rooms.png' });
  await page.locator('#rooms-dialog .close-sheet').click();
  await page.locator('#bottom-settings').click();
  const help = page.locator('summary[aria-label="Om historik"]');
  assert.equal(await page.locator('#show-saved').count(), 0);
  assert.equal(await page.locator('#mobile-connection').count(), 0);
  assert.equal(
    await page
      .getByText('Gem op til 10.000 beskeder lokalt i din browser.', { exact: false })
      .isVisible(),
    false,
  );
  await help.click();
  assert.equal(
    await page
      .getByText('Gem op til 10.000 beskeder lokalt i din browser.', { exact: false })
      .isVisible(),
    true,
  );
  assert.equal(await page.locator('#save-history').isChecked(), false);
  await help.press('Enter');
  assert.equal(
    await page
      .getByText('Gem op til 10.000 beskeder lokalt i din browser.', { exact: false })
      .isVisible(),
    false,
  );
  await page.locator('#settings-dialog').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: '/tmp/acidum-qa-mobile-settings.png' });
  await page.locator('#save-history').check();
  await page.locator('#settings-dialog .close-sheet').click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#search-toggle').click();
  assert.equal(await page.locator('#private-toggle').isVisible(), true);
  await page.locator('#search').fill('kaffe');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.message').count(), 1);
  assert.ok((await page.locator('#search-bar').boundingBox()).height < 80);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#search').fill('');
  await page.waitForTimeout(200);
  await page.locator('#search-toggle').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#bottom-log').click();
  await page.waitForTimeout(40);
  assert.equal(await page.locator('#view-title').textContent(), 'Hændelseslog');
  await page.locator('#bottom-chat').click();
  await page.waitForTimeout(40);
  assert.equal(await page.locator('#view-title').textContent(), 'Milo');
  assert.deepEqual(errors, []);
  console.log('Mobile account switch, room sheets, settings, search, log navigation: passed');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: '/tmp/acidum-qa-desktop-latest.png' });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
