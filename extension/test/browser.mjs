import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exerciseMedia } from './media.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const browserCache = path.join(root, '.cache', 'playwright');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(browserCache)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserCache;
}
const { chromium } = await import('playwright');
const output = path.join(root, 'dist', 'ptt-classic');
const info = JSON.parse(await readFile(path.join(root, 'dist', 'extension-build.json'), 'utf8'));
const live = process.argv.includes('--live');
const results = path.join(root, 'test-results');
const profiles = path.join(root, '.cache', 'test-profiles');
await mkdir(profiles, { recursive: true });
await mkdir(results, { recursive: true });
const profile = await mkdtemp(path.join(profiles, 'extension-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1366, height: 900 },
  locale: 'zh-TW',
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`]
});
context.setDefaultTimeout(12000);

try {
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  const remoteRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
      console.error(message.text());
    }
  });
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  let origin;
  let handshakeStatus;
  let bytesReceived = 0;
  cdp.on('Network.webSocketWillSendHandshakeRequest', event => {
    origin = event.request.headers.Origin;
    console.log(`WebSocket Origin: ${origin}`);
  });
  cdp.on('Network.webSocketHandshakeResponseReceived', event => {
    handshakeStatus = event.response.status;
    console.log(`WebSocket status: ${handshakeStatus}`);
  });
  cdp.on('Network.webSocketFrameReceived', event => {
    bytesReceived += event.response.opcode === 2
      ? Buffer.from(event.response.payloadData, 'base64').length
      : Buffer.byteLength(event.response.payloadData);
  });

  const sent = [];
  let offlineSocket;
  if (!live) {
    await page.routeWebSocket('wss://ws.ptt.cc/bbs', socket => {
      offlineSocket = socket;
      socket.send(Buffer.concat([
        Buffer.from('\x1b[2J\x1b[HPTT CLASSIC OFFLINE TEST\r\n\x1b[31mRed text\x1b[0m '),
        Buffer.from([0xa4, 0xa4, 0xa4, 0xe5]),
        Buffer.from('\r\nTerminal ready\r\n')
      ]));
      socket.onMessage(message => sent.push(Buffer.from(message).toString('latin1')));
    });
    await page.route(/^https?:/, route => route.abort());
  }

  await page.goto(info.bookmark);
  const scope = await page.evaluate(async () => {
    const matches = async (url, initiator = location.origin, type = 'websocket') =>
      (await chrome.declarativeNetRequest.testMatchOutcome({ url, type, initiator })).matchedRules.length;
    return {
      permissions: await chrome.permissions.getAll(),
      ownConnection: await matches('wss://ws.ptt.cc/bbs'),
      officialPage: await matches('wss://ws.ptt.cc/bbs', 'https://term.ptt.cc'),
      anotherWebsite: await matches('wss://ws.ptt.cc/bbs', 'https://example.com'),
      differentEndpoint: await matches('wss://ws.ptt.cc/other'),
      lookalikeDomain: await matches('wss://ws.ptt.cc.example.com/bbs'),
      ownImgurImage: await matches('https://i.imgur.com/test.png', location.origin, 'image'),
      otherPageImgurImage: await matches('https://i.imgur.com/test.png', 'https://example.com', 'image'),
      ownYoutubeEmbed: await matches('https://www.youtube.com/embed/M7lc1UVf-VE', location.origin, 'sub_frame'),
      otherPageYoutubeEmbed: await matches('https://www.youtube.com/embed/M7lc1UVf-VE', 'https://example.com', 'sub_frame'),
      youtubeTopLevel: await matches('https://www.youtube.com/embed/M7lc1UVf-VE', location.origin, 'main_frame')
    };
  });
  assert.equal(scope.ownConnection, 1);
  assert.equal(scope.officialPage + scope.anotherWebsite + scope.differentEndpoint + scope.lookalikeDomain, 0);
  assert.equal(scope.ownImgurImage, 1);
  assert.equal(scope.ownYoutubeEmbed, 1);
  assert.equal(scope.otherPageImgurImage + scope.otherPageYoutubeEmbed + scope.youtubeTopLevel, 0);
  assert.deepEqual([...scope.permissions.origins].sort(), ['https://*.imgur.com/*', 'https://www.youtube.com/*', 'wss://ws.ptt.cc/*']);
  await page.locator('#BBSWindow').waitFor({ state: 'visible' });
  if (live) {
    await page.waitForFunction(() => document.body.textContent.includes('請輸入代號'), null, { timeout: 20000 }).catch(async error => {
      await page.screenshot({ path: path.join(results, 'live-failure.png') });
      console.log(JSON.stringify({ origin, handshakeStatus, bytesReceived, errors, text: await page.locator('body').innerText() }, null, 2));
      throw error;
    });
    assert.equal(handshakeStatus, 101, 'PTT must accept the direct WebSocket handshake');
    assert.equal(origin, 'app://ptt-classic', 'The browser must send the scoped Origin header');
    assert.ok(bytesReceived > 0, 'PTT must return terminal bytes');
  } else {
    await page.getByText('PTT CLASSIC OFFLINE TEST', { exact: false }).waitFor();
    assert.match(await page.locator('body').innerText(), /中文/);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    assert.match(sent.join(''), /\x1b\[A\x1b\[Babc\r/);

    const openMenu = () => page.locator('#BBSWindow').click({ button: 'right', position: { x: 100, y: 160 } });
    await openMenu();
    await page.getByRole('menuitem', { name: '設定', exact: true }).click();
    const modal = page.locator('.PrefModal');
    await modal.waitFor({ state: 'visible' });
    await modal.locator('input[name="fontFace"]').fill('monospace');
    await modal.locator('input[name="bbsMargin"]').fill('12');
    await modal.locator('select[name="termSizeMode"]').selectOption('fixed-term-size');
    await page.screenshot({ path: path.join(results, 'classic-settings.png') });
    await modal.locator('.close:visible').click();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pttchrome.pref.v1')).values.bbsMargin), 12);
    await page.reload();
    await page.getByText('PTT CLASSIC OFFLINE TEST', { exact: false }).waitFor();
    await openMenu();
    await page.getByRole('menuitem', { name: '設定', exact: true }).click();
    assert.equal(await modal.locator('input[name="fontFace"]').inputValue(), 'monospace');
    assert.equal(await modal.locator('input[name="bbsMargin"]').inputValue(), '12');
    await modal.locator('.close:visible').click();
    await modal.waitFor({ state: 'hidden' });

    // Substitute the clipboard service so tests never read or replace the user's clipboard.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => 'paste fixture 中文' }, configurable: true });
      document.execCommand = command => {
        if (command !== 'copy') return false;
        const data = new DataTransfer();
        document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, cancelable: true }));
        window.testCopiedText = data.getData('text');
        return true;
      };
    });
    await openMenu();
    await page.getByRole('menuitem', { name: /貼上/ }).click();
    await page.waitForFunction(() => !document.querySelector('#cmenuReact .open'));
    assert.match(sent.join(''), /paste fixture \xa4\xa4\xa4\xe5/);
    await page.getByText('PTT CLASSIC OFFLINE TEST', { exact: false }).evaluate(element => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator('#BBSWindow').dispatchEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 160 });
    await page.getByRole('menuitem', { name: /^複製\s*Ctrl\+C$/ }).click();
    assert.match(await page.evaluate(() => window.testCopiedText), /PTT CLASSIC OFFLINE TEST/);
    await page.evaluate(() => window.getSelection().removeAllRanges());

    for (const viewport of [{ width: 900, height: 600 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const bounds = document.querySelector('#mainContainer').getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
      });
    }
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  await page.screenshot({ path: path.join(results, live ? 'live-login.png' : 'classic-terminal.png') });
  assert.deepEqual(remoteRequests, [], 'Startup must not load remote scripts or other HTTP assets');
  const media = live ? undefined : await exerciseMedia(page, data => offlineSocket.send(Buffer.from(data, 'latin1')), results);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(errors, [], 'The client must start without script or CSP errors');
  const report = { mode: live ? 'live' : 'offline', bookmark: info.bookmark, origin, handshakeStatus, bytesReceived, scope, media, remoteRequests, errors };
  await writeFile(path.join(results, live ? 'live.json' : 'offline.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const page = context.pages().at(-1);
  if (page) {
    await page.screenshot({ path: path.join(results, `${live ? 'live' : 'offline'}-failure.png`) }).catch(() => {});
    console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
  }
  throw error;
} finally {
  await context.close();
  if (path.dirname(profile) !== profiles || !path.basename(profile).startsWith('extension-')) {
    throw new Error('Unexpected test profile directory');
  }
  await rm(profile, { recursive: true, force: true });
}
