import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const imageUrl = new URL(process.argv.slice(2).find(arg => arg !== '--') || '');
if (imageUrl.origin !== 'https://i.verb.tw' || imageUrl.username || imageUrl.password) {
  throw new Error('Provide an HTTPS image URL hosted on i.verb.tw.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.cache', 'playwright');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
const { chromium } = await import('playwright');
const output = path.join(root, 'dist', 'ptt-classic');
const results = path.join(root, 'test-results');
const info = JSON.parse(await readFile(path.join(root, 'dist', 'extension-build.json'), 'utf8'));
const expectedReferer = `https://ptt-classic.${info.extensionId}/`;
await mkdir(results, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1366, height: 900 },
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`]
});
context.setDefaultTimeout(15000);
try {
  const page = await context.newPage();
  const requests = new Map();
  const headers = new Map();
  const statuses = new Map();
  const responseHeaders = new Map();
  const failures = [];
  page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.url === imageUrl.href) requests.set(event.requestId, event.request.url);
  });
  cdp.on('Network.requestWillBeSentExtraInfo', event => headers.set(event.requestId, event.headers));
  cdp.on('Network.responseReceived', event => statuses.set(event.requestId, event.response.status));
  cdp.on('Network.responseReceivedExtraInfo', event => {
    statuses.set(event.requestId, event.statusCode);
    responseHeaders.set(event.requestId, event.headers);
  });

  // PTT is simulated; the image uses the packaged extension rules without test header overrides.
  await page.routeWebSocket('wss://ws.ptt.cc/bbs', socket =>
    socket.send(Buffer.from(`\x1b[2J\x1b[H${imageUrl.href}\r\n`)));
  await page.goto(info.bookmark);
  const main = page.locator('#mainContainer');
  await page.locator('[data-ptt-media-preview-container]').waitFor();
  await main.locator('a').hover();
  const hover = page.locator('img[data-ptt-media-preview-fallback]');
  await page.waitForFunction(() => {
    const image = document.querySelector('img[data-ptt-media-preview-fallback]');
    return image?.complete && image.naturalWidth > 0;
  }).catch(async error => {
    console.error(JSON.stringify({
      failures,
      network: [...requests].map(([id, url]) => ({ url, headers: headers.get(id), status: statuses.get(id), responseHeaders: responseHeaders.get(id) })),
      images: await main.locator('img').evaluateAll(images => images.map(image => ({ src: image.src, complete: image.complete, width: image.naturalWidth })))
    }, null, 2));
    await page.screenshot({ path: path.join(results, 'verb-live-failure.png') });
    throw error;
  });
  const hoverSize = await hover.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
  await page.screenshot({ path: path.join(results, 'verb-live-hover.png') });

  // Enable inline previews only in this temporary profile; preference UI is covered offline.
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('pttchrome.pref.v1')) || { values: {} };
    prefs.values.enableEasyReading = true;
    localStorage.setItem('pttchrome.pref.v1', JSON.stringify(prefs));
  });
  await page.reload();
  await main.locator('a').waitFor({ state: 'attached' });
  await main.evaluate((container, src) => {
    container.replaceChildren();
    const marker = document.createElement('span');
    marker.className = 'q4 b7';
    marker.textContent = 'Image preview test';
    const wrapper = document.createElement('span');
    const link = document.createElement('a');
    link.href = src;
    link.textContent = src;
    wrapper.append(link);
    const target = document.createElement('div');
    target.dataset.testPreview = 'verb-live';
    container.append(marker, wrapper, target);
  }, imageUrl.href);
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-test-preview="verb-live"] img');
    return image?.complete && image.naturalWidth > 0;
  });
  const inlineSize = await page.locator('[data-test-preview="verb-live"] img').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }));
  await page.screenshot({ path: path.join(results, 'verb-live-inline.png') });

  const network = [...requests].map(([id, url]) => {
    const sentHeaders = headers.get(id) || {};
    const referer = Object.entries(sentHeaders).find(([key]) => key.toLowerCase() === 'referer')?.[1];
    return { url, status: statuses.get(id), referer };
  });
  assert.ok(network.some(request => request.referer === expectedReferer && request.status === 200), 'The packaged rule must supply the app Referer and receive an image');
  assert.deepEqual(inlineSize, hoverSize);
  assert.deepEqual(failures, []);
  const report = { imageUrl: imageUrl.href, hover: hoverSize, inline: inlineSize, network, failures };
  await writeFile(path.join(results, 'verb-live.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
}
