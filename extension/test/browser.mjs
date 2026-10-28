import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
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
  page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
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
  const sentEvents = new EventEmitter();
  const waitForSent = async pattern => {
    const signal = AbortSignal.timeout(12000);
    while (!pattern.test(sent.join(''))) await once(sentEvents, 'message', { signal });
  };
  let offlineSocket;
  if (!live) {
    await page.addInitScript(() => {
      if (!localStorage.getItem('pttchrome.pref.v1')) {
        localStorage.setItem('pttchrome.pref.v1', JSON.stringify({ values: {
          fontFace: 'monospace', bbsMargin: 12, enablePicPreview: true,
          mouseLeftFunction: 1, mouseMiddleFunction: 3, mouseWheelFunction1: 1,
          enableLiveUpdate: true, enableAutoLogin: true,
        } }));
      }
    });
    await page.routeWebSocket('wss://ws.ptt.cc/bbs', socket => {
      offlineSocket = socket;
      socket.send(Buffer.concat([
        Buffer.from('\x1b[2J\x1b[HPTT CLASSIC OFFLINE TEST\r\n\x1b[31mRed text\x1b[0m '),
        Buffer.from([0xa4, 0xa4, 0xa4, 0xe5]),
        Buffer.from('\r\nTerminal ready\r\n')
      ]));
      socket.onMessage(message => {
        sent.push(Buffer.from(message).toString('latin1'));
        sentEvents.emit('message');
      });
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
      youtubeTopLevel: await matches('https://www.youtube.com/embed/M7lc1UVf-VE', location.origin, 'main_frame'),
      ownVerbImage: await matches('https://i.verb.tw/test.jpg', location.origin, 'image'),
      otherPageVerbImage: await matches('https://i.verb.tw/test.jpg', 'https://example.com', 'image'),
      verbTopLevel: await matches('https://i.verb.tw/test.jpg', location.origin, 'main_frame'),
      verbFetch: await matches('https://i.verb.tw/test.jpg', location.origin, 'xmlhttprequest'),
      verbOtherHost: await matches('https://img.verb.tw/test.jpg', location.origin, 'image'),
      verbLookalike: await matches('https://i.verb.tw.example.com/test.jpg', location.origin, 'image'),
      verbHttp: await matches('http://i.verb.tw/test.jpg', location.origin, 'image')
    };
  });
  assert.equal(scope.ownConnection, 1);
  assert.equal(scope.officialPage + scope.anotherWebsite + scope.differentEndpoint + scope.lookalikeDomain, 0);
  assert.equal(scope.ownImgurImage, 1);
  assert.equal(scope.ownYoutubeEmbed, 1);
  assert.equal(scope.ownVerbImage, 1);
  assert.equal(scope.otherPageVerbImage + scope.verbTopLevel + scope.verbFetch + scope.verbOtherHost + scope.verbLookalike + scope.verbHttp, 0);
  assert.equal(scope.otherPageImgurImage + scope.otherPageYoutubeEmbed + scope.youtubeTopLevel, 0);
  assert.deepEqual([...scope.permissions.origins].sort(), ['https://*.imgur.com/*', 'https://i.verb.tw/*', 'https://www.youtube.com/*', 'wss://ws.ptt.cc/*']);
  await page.locator('#TermWindow').waitFor({ state: 'visible' });
  const terminalText = () => page.evaluate(() => {
    const buf = window.app.buf;
    return Array.from({ length: buf.rows }, (_, row) => buf.getRowText(row, 0, buf.cols)).join('\n');
  });
  const waitForTerminal = text => page.waitForFunction(text => {
    const buf = window.app?.buf;
    return buf && Array.from({ length: buf.rows }, (_, row) => buf.getRowText(row, 0, buf.cols)).join('\n').includes(text);
  }, text);
  if (live) {
    await waitForTerminal('請輸入代號').catch(async error => {
      await page.screenshot({ path: path.join(results, 'live-failure.png') });
      console.log(JSON.stringify({ origin, handshakeStatus, bytesReceived, errors, text: await terminalText() }, null, 2));
      throw error;
    });
    assert.equal(handshakeStatus, 101, 'PTT must accept the direct WebSocket handshake');
    assert.equal(origin, 'app://ptt-classic', 'The browser must send the scoped Origin header');
    assert.ok(bytesReceived > 0, 'PTT must return terminal bytes');
  } else {
    await waitForTerminal('PTT CLASSIC OFFLINE TEST');
    await page.locator('#mainContainer canvas').waitFor();
    assert.match(await terminalText(), /中文/);
    assert.equal(await page.evaluate(() => window.app.prefValues.termMargin), 12);
    assert.equal(await page.evaluate(() => window.app.prefValues.mouseWheelAction), 'none');
    assert.ok(await page.evaluate(() => localStorage.getItem('pttclassic.preferences.before-0.2.0')));
    assert.deepEqual(await page.evaluate(() => window.app.getPluginList().map(plugin => plugin.id).sort()),
      ['anti_idle', 'auto_wrap', 'easy_reading', 'input_helper', 'media_previewer']);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await waitForSent(/\x1b\[A\x1b\[Babc\r/);
    assert.match(sent.join(''), /\x1b\[A\x1b\[Babc\r/);

    const openMenu = async () => {
      await page.locator('#TermWindow').click({ button: 'right', position: { x: 100, y: 160 } });
      // Upstream ignores clicks for the menu's initial 350 ms to prevent click-through.
      await page.waitForTimeout(380);
    };
    await openMenu();
    await page.getByRole('menuitem', { name: '設定', exact: true }).click();
    const modal = page.locator('.PrefModal');
    await modal.waitFor({ state: 'visible' });
    await modal.locator('.nav a').nth(1).click();
    await modal.locator('input[name="termMargin"]').fill('18');
    await modal.locator('select[name="termSizeMode"]').selectOption('fixed-term-size');
    await page.screenshot({ path: path.join(results, 'classic-settings.png') });
    await modal.locator('.close:visible').click();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pttchrome.pref.v1')).values.termMargin), 18);
    await page.reload();
    await waitForTerminal('PTT CLASSIC OFFLINE TEST');
    await openMenu();
    await page.getByRole('menuitem', { name: '設定', exact: true }).click();
    await modal.locator('.nav a').nth(1).click();
    assert.equal(await modal.locator('input[name="termMargin"]').inputValue(), '18');
    assert.equal(await page.evaluate(() => window.app.prefValues.fontFace), 'monospace');
    await modal.locator('.nav a').nth(3).click();
    assert.deepEqual(await modal.locator('input[type="checkbox"]').evaluateAll(inputs => inputs.map(input => input.name)), ['trimTrailingSpaces']);
    assert.deepEqual(await modal.locator('select').evaluateAll(inputs => inputs.map(input => input.name)), ['rightClickAction']);
    await page.screenshot({ path: path.join(results, 'mouse-settings.png') });
    await modal.locator('.nav a').nth(4).click();
    assert.doesNotMatch(await modal.innerText(), /虛擬鍵盤|PWA|輔助登入|滑鼠瀏覽|Live文|開發者工具/);
    await page.screenshot({ path: path.join(results, 'plugin-settings.png') });
    const mediaSettings = modal.locator('.PrefModal__MacListItem').filter({ has: page.locator('input[name="enableMediaPreviewer"]') });
    assert.equal(await mediaSettings.locator('input[type="range"]').count(), 0, 'Image size controls start folded');
    await mediaSettings.locator('.PrefModal__MacOptionsBtn').click();
    const heightSlider = mediaSettings.getByRole('slider', { name: '最大顯示高度' });
    const widthSlider = mediaSettings.getByRole('slider', { name: '最大顯示寬度' });
    const youtubeSlider = mediaSettings.getByRole('slider', { name: 'YouTube 顯示寬度' });
    assert.equal(await mediaSettings.getByRole('slider').count(), 3);
    assert.equal(await heightSlider.inputValue(), '80');
    assert.equal(await widthSlider.inputValue(), '90');
    assert.equal(await youtubeSlider.inputValue(), '800');
    await page.screenshot({ path: path.join(results, 'image-size-settings.png'), animations: 'disabled' });
    for (const slider of [heightSlider, widthSlider]) {
      await slider.press('Home');
      assert.equal(await slider.inputValue(), '10');
      await slider.press('End');
      await slider.press('ArrowLeft');
      assert.equal(await slider.inputValue(), '99');
      assert.equal(await slider.getAttribute('aria-valuetext'), '99%');
    }
    await youtubeSlider.press('End');
    assert.equal(await youtubeSlider.inputValue(), '2560');
    await youtubeSlider.press('Home');
    assert.equal(await youtubeSlider.inputValue(), '240');
    await youtubeSlider.press('ArrowRight');
    assert.equal(await youtubeSlider.getAttribute('aria-valuetext'), '250 px');
    assert.deepEqual(await mediaSettings.locator('output').allTextContents(), ['99%', '99%', '250 px']);
    await modal.locator('.close:visible').click();
    await modal.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => {
      const values = JSON.parse(localStorage.getItem('pttchrome.pref.v1')).values;
      return [values.picPreviewMaxHeight, values.picPreviewMaxWidth, values.youtubePreviewWidth];
    }), [99, 99, 250]);
    await page.reload();
    await waitForTerminal('PTT CLASSIC OFFLINE TEST');
    assert.deepEqual(await page.evaluate(() => [window.app.prefValues.picPreviewMaxHeight, window.app.prefValues.picPreviewMaxWidth, window.app.prefValues.youtubePreviewWidth]), [99, 99, 250]);
    await openMenu();
    await page.getByRole('menuitem', { name: '設定', exact: true }).click();
    await modal.locator('.nav a').nth(4).click();
    await mediaSettings.locator('.PrefModal__MacOptionsBtn').click();
    assert.equal(await heightSlider.inputValue(), '99');
    assert.equal(await widthSlider.inputValue(), '99');
    assert.equal(await youtubeSlider.inputValue(), '250');
    await modal.locator('.close:visible').click();
    await modal.waitFor({ state: 'hidden' });

    // Substitute the clipboard service so tests never read or replace the user's clipboard.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: {
        readText: async () => 'paste fixture 中文',
        writeText: async text => { window.testCopiedText = text; },
      }, configurable: true });
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
    await waitForSent(/paste fixture \xa4\xa4\xa4\xe5/);
    assert.match(sent.join(''), /paste fixture \xa4\xa4\xa4\xe5/);
    await openMenu();
    await page.getByRole('menuitem', { name: /全選/ }).click();
    await openMenu();
    await page.getByRole('menuitem', { name: /^複製\s*Ctrl\+C$/ }).click();
    assert.match(await page.evaluate(() => window.testCopiedText), /PTT CLASSIC OFFLINE TEST/);
    await page.evaluate(() => window.getSelection().removeAllRanges());

    const sentBeforeMouse = sent.join('');
    const canvasBounds = await page.locator('#mainContainer canvas').boundingBox();
    await page.mouse.move(canvasBounds.x + 2, canvasBounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(canvasBounds.x + 300, canvasBounds.y + 12, { steps: 12 });
    await page.mouse.up();
    assert.match(await page.evaluate(() => window.app.view.getSelectedText()), /PTT CLASSIC/);
    await page.locator('#mainContainer').click({ button: 'middle', position: { x: 20, y: 20 } });
    await page.mouse.wheel(0, 350);
    await page.locator('#mainContainer').dispatchEvent('wheel', { deltaY: 150, buttons: 1, bubbles: true });
    await page.locator('#mainContainer').dispatchEvent('wheel', { deltaY: 150, buttons: 2, bubbles: true });
    await page.waitForTimeout(200);
    assert.equal(sent.join(''), sentBeforeMouse, 'Disabled mouse actions must not send PTT commands');

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
    console.error(await page.evaluate(() => ({
      app: Boolean(window.app), plugins: window.app?.getPluginList?.().map(plugin => plugin.id),
      terminal: document.querySelector('#TermWindow')?.outerHTML.slice(0, 1200),
    })).catch(() => 'Diagnostics unavailable'));
  }
  throw error;
} finally {
  await context.close();
  if (path.dirname(profile) !== profiles || !path.basename(profile).startsWith('extension-')) {
    throw new Error('Unexpected test profile directory');
  }
  await rm(profile, { recursive: true, force: true });
}
