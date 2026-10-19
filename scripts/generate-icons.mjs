import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  const icons = await page.evaluate(async (svg) => {
    const icon = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    icon.src = url;
    await icon.decode();
    const images = [180, 192, 512].map((size) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#1a1a18';
      context.fillRect(0, 0, size, size);
      context.drawImage(icon, 0, 0, size, size);
      return { size, png: canvas.toDataURL('image/png').split(',')[1] };
    });
    URL.revokeObjectURL(url);
    return images;
  }, source);
  for (const { size, png } of icons) {
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    await writeFile(new URL(`../public/${name}`, import.meta.url), Buffer.from(png, 'base64'));
    console.log(`Generated ${name} (${size} × ${size})`);
  }
} finally {
  await browser.close();
}
