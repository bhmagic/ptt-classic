import assert from 'node:assert/strict';
import { u2b } from '../../src/js/string_util.js';

export function articleFrame(links, title = 'Media preview fixture') {
  const text = `\x1b[2J\x1b[H${title}\r\n${links.join('\r\n')}\r\n`
    + '\x1b[24;1H\x1b[37;44m  瀏覽 第 1/1 頁 (100%)  目前顯示: 第 1~23 行\x1b[0m\x1b[24;80H';
  return u2b(text);
}

async function assertBorderless(locator) {
  const style = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return { border: style.borderTopWidth, padding: style.paddingTop, background: style.backgroundColor };
  });
  assert.deepEqual(style, { border: '0px', padding: '0px', background: 'rgba(0, 0, 0, 0)' });
}

async function assertImageSize(locator, { width, height }) {
  const bounds = await locator.boundingBox();
  assert.ok(Math.abs(bounds.width - width) < 1, `Expected image width ${width}, got ${bounds.width}`);
  assert.ok(Math.abs(bounds.height - height) < 1, `Expected image height ${height}, got ${bounds.height}`);
}

async function textAreaSize(page, inline = false) {
  return page.evaluate(inline => {
    const style = getComputedStyle(document.querySelector(inline ? '#easyReadingOverlay' : '#TermWindow'));
    const width = parseFloat(style.getPropertyValue('--term-chw')) * Number(style.getPropertyValue('--term-cols'));
    const height = parseFloat(style.getPropertyValue('--term-chh')) * Number(style.getPropertyValue('--term-rows'));
    return {
      width: width * (inline ? 1 : window.app.view.scaleX),
      height: height * (inline ? 1 : window.app.view.scaleY),
    };
  }, inline);
}

async function resizeWindow(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(() => {
    const app = window.app;
    const actual = app.view.getWindowInnerBounds();
    return !app.resizeTimeout && actual.width === app.view.innerBounds.width && actual.height === app.view.innerBounds.height;
  });
}

async function setImageLimits(page, width, height) {
  await page.evaluate(({ width, height }) => window.app.onValuesPrefChange({
    ...window.app.prefValues, picPreviewMaxWidth: width, picPreviewMaxHeight: height,
  }), { width, height });
}

async function setYoutubeWidth(page, youtubePreviewWidth) {
  await page.evaluate(youtubePreviewWidth => window.app.onValuesPrefChange({
    ...window.app.prefValues, youtubePreviewWidth,
  }), youtubePreviewWidth);
}

export async function exerciseMedia(page, send, results) {
  const imageRequests = [];
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#267b92"/><text x="100" y="200" font-size="90" fill="white">Media preview fixture</text></svg>';
  const smallImage = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#267b92"/><text x="20" y="100" font-size="24" fill="white">320 × 200 original</text></svg>';
  await page.route(/^https:\/\/(i\.imgur\.com|i\.meee\.com\.tw|i\.verb\.tw)\//, route => {
    const url = route.request().url();
    imageRequests.push(url);
    if (url === 'https://i.meee.com.tw/fixture.jpg') {
      return route.fulfill({ contentType: 'image/png', body: 'invalid-image-for-fallback-test' });
    }
    if (url.endsWith('.mp4')) return route.fulfill({ contentType: 'video/mp4', body: '' });
    return route.fulfill({ contentType: 'image/svg+xml', body: url.endsWith('/small.jpg') ? smallImage : image });
  });
  await page.route('https://api.imgur.com/3/**', route => {
    const album = route.request().url().includes('/album/');
    return route.fulfill({ json: { success: true, data: album ? {
      images: [{ link: 'https://i.imgur.com/album-first.jpg' }, { link: 'https://i.imgur.com/album-motion.gif' }]
    } : { type: 'image/png', link: 'https://i.imgur.com/resolved-image.png' } } });
  });
  await page.route('https://www.youtube.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<p>Embedded player fixture</p>' }));

  const links = [
    ['https://i.imgur.com/fixture.jpg', 'https://i.imgur.com/fixture.jpg'],
    ['https://meee.com.tw/fixture', 'https://i.meee.com.tw/fixture.png'],
    ['https://imgur.com/a/album123', 'https://i.imgur.com/album-first.jpg'],
    ['https://imgur.com/unknown123', 'https://i.imgur.com/resolved-image.png'],
    ['https://i.verb.tw/fixture.jpg', 'https://i.verb.tw/fixture.jpg'],
    ['https://i.imgur.com/small.jpg', 'https://i.imgur.com/small.jpg'],
  ];
  const container = page.locator('#mainContainer');
  const preview = page.locator('.image-preview-loaded img');
  for (const useCanvasEngine of [true, false]) {
    await page.evaluate(useCanvasEngine => window.app.onValuesPrefChange({ ...window.app.prefValues, useCanvasEngine }), useCanvasEngine);
    send(`\x1b[2J\x1b[H${links.map(([href]) => href).join('\r\n')}\r\n`);
    for (const [href, expected] of links) {
      await container.locator(`a[href="${href}"]`).hover();
      await page.waitForFunction(src => {
        const img = document.querySelector('.image-preview-loaded img');
        return img?.src === src && img.complete && img.naturalWidth > 0;
      }, expected);
      const bounds = await preview.boundingBox();
      const viewport = page.viewportSize();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
      await assertBorderless(preview);
      await assertBorderless(page.locator('.image-preview-loaded'));
      assert.equal(await preview.evaluate(img => getComputedStyle(img).pointerEvents), 'none');
      assert.equal(await page.locator('.image-preview-loaded').count(), 1);
      await page.mouse.move(10, 10);
      await preview.waitFor({ state: 'detached' });
    }
    await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
    await preview.waitFor();
    // Each slider must independently constrain the same image in both renderers.
    for (const [width, height] of [[30, 100], [100, 25], [100, 100]]) {
      await setImageLimits(page, width, height);
      await page.mouse.move(10, 10);
      await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
      await page.waitForFunction(() => document.querySelector('.image-preview-loaded img')?.complete);
      const viewport = page.viewportSize();
      const textArea = await textAreaSize(page);
      const scale = Math.min(1, Math.min(textArea.width * width / 100, viewport.width - 16) / 1600,
        Math.min(textArea.height * height / 100, viewport.height - 16) / 1000);
      await assertImageSize(preview, { width: 1600 * scale, height: 1000 * scale });
      const bounds = await preview.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    }
    for (const [width, height] of [[100, 100], [10, 100], [100, 10], [100, 100]]) {
      await setImageLimits(page, width, height);
      await page.mouse.move(10, 10);
      await container.locator('a[href="https://i.imgur.com/small.jpg"]').hover();
      await page.waitForFunction(() => document.querySelector('.image-preview-loaded img')?.src.endsWith('/small.jpg'));
      const textArea = await textAreaSize(page);
      const scale = Math.min(1, textArea.width * width / 100 / 320, textArea.height * height / 100 / 200);
      await assertImageSize(preview, { width: 320 * scale, height: 200 * scale });
    }
    const originalViewport = page.viewportSize();
    await setImageLimits(page, 30, 100);
    // Adding empty space beside an unchanged 80-column text grid must not enlarge images.
    for (const width of [1920, 2560]) {
      await resizeWindow(page, { width, height: 900 });
      await page.mouse.move(10, 10);
      await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
      await preview.waitFor();
      await assertImageSize(preview, { width: 432, height: 270 });
    }
    await resizeWindow(page, { width: 1920, height: 900 });
    await page.evaluate(() => window.app.onValuesPrefChange({
      ...window.app.prefValues, termSize: { cols: 120, rows: 30 },
    }));
    await page.mouse.move(10, 10);
    await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
    await preview.waitFor();
    await assertImageSize(preview, { width: 504, height: 315 });
    await page.evaluate(() => window.app.onValuesPrefChange({
      ...window.app.prefValues, termSize: { cols: 80, rows: 24 }, fontFitWindowWidth: true,
    }));
    await page.mouse.move(10, 10);
    await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
    await preview.waitFor();
    const stretchedGrid = await textAreaSize(page);
    await assertImageSize(preview, { width: stretchedGrid.width * 0.3, height: stretchedGrid.width * 0.3 / 1.6 });
    await page.evaluate(() => window.app.onValuesPrefChange({ ...window.app.prefValues, fontFitWindowWidth: false }));
    await resizeWindow(page, originalViewport);
    await setImageLimits(page, 90, 80);
    await page.mouse.move(10, 10);
    await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
    await preview.waitFor();
    await page.screenshot({ path: `${results}/media-hover-${useCanvasEngine ? 'canvas' : 'dom'}.png` });
    send('\x1b[2J\x1b[HAnother article\r\n');
    await preview.waitFor({ state: 'detached' });
  }
  assert.ok(imageRequests.includes('https://i.meee.com.tw/fixture.jpg'));
  assert.ok(imageRequests.includes('https://i.meee.com.tw/fixture.png'));
  assert.ok(!imageRequests.includes('https://i.imgur.com/a/album123.jpg'));

  await page.evaluate(() => window.app.onValuesPrefChange({ ...window.app.prefValues, useCanvasEngine: true, enableEasyReading: true }));
  const inlineLinks = [
    'https://i.imgur.com/inline.jpg',
    'https://i.verb.tw/inline.jpg',
    'https://imgur.com/a/album123',
    'https://youtu.be/M7lc1UVf-VE?t=45',
    'https://clips.twitch.tv/IncredulousAbstemiousFennelImGlitch',
    'https://i.imgur.com/small.jpg',
  ];
  // Feed a real Big5/ANSI article through the socket, parser and Easy Reading.
  send(articleFrame(inlineLinks));
  await page.locator('#easyReadingOverlay').waitFor({ state: 'visible' });
  for (const href of inlineLinks.slice(0, 2)) {
    const target = page.locator(`[data-media-href="${href}"]`);
    await target.scrollIntoViewIfNeeded();
    await page.waitForFunction(href => {
      const img = document.querySelector(`[data-media-href="${href}"] img`);
      return img?.complete && img.naturalWidth > 0;
    }, href);
    await assertBorderless(target.locator('img'));
  }
  const inlineImage = page.locator('[data-media-href="https://i.imgur.com/inline.jpg"] img');
  await inlineImage.scrollIntoViewIfNeeded();
  await inlineImage.evaluate(img => { img.dataset.sizeTestMounted = 'true'; });
  await setImageLimits(page, 30, 100);
  const viewport = page.viewportSize();
  const textArea = await textAreaSize(page, true);
  await assertImageSize(inlineImage, { width: textArea.width * 0.3, height: textArea.width * 0.3 / 1.6 });
  await setImageLimits(page, 100, 25);
  await assertImageSize(inlineImage, { width: textArea.height * 0.25 * 1.6, height: textArea.height * 0.25 });
  assert.equal(await inlineImage.getAttribute('data-size-test-mounted'), 'true', 'Changing limits resizes existing inline images without remounting them');
  await resizeWindow(page, { width: 900, height: 600 });
  const smallerTextArea = await textAreaSize(page, true);
  await assertImageSize(inlineImage, { width: smallerTextArea.height * 0.25 * 1.6, height: smallerTextArea.height * 0.25 });
  await resizeWindow(page, viewport);
  await setImageLimits(page, 100, 100);
  const containerWidth = await inlineImage.evaluate(img => img.parentElement.clientWidth);
  const scale = Math.min(1, containerWidth / 1600, textArea.width / 1600, textArea.height / 1000);
  await assertImageSize(inlineImage, { width: 1600 * scale, height: 1000 * scale });
  await setImageLimits(page, 30, 100);
  for (const width of [1920, 2560]) {
    await resizeWindow(page, { width, height: 900 });
    await assertImageSize(inlineImage, { width: 432, height: 270 });
  }
  await setImageLimits(page, 100, 25);
  // Adding empty space below the same text grid must not increase the height limit.
  for (const height of [900, 1200]) {
    await resizeWindow(page, { width: 1400, height });
    await assertImageSize(inlineImage, { width: 307.2, height: 192 });
  }
  assert.equal(await inlineImage.getAttribute('data-size-test-mounted'), 'true', 'Text-area resizing must preserve mounted inline images');
  await resizeWindow(page, viewport);
  await setImageLimits(page, 90, 80);
  const album = page.locator('[data-media-href="https://imgur.com/a/album123"]');
  await album.scrollIntoViewIfNeeded();
  await album.locator('video').waitFor();
  assert.equal(await album.locator('img').count(), 1);
  const youtube = page.locator('[data-media-href="https://youtu.be/M7lc1UVf-VE?t=45"] iframe');
  await youtube.scrollIntoViewIfNeeded();
  assert.match(await youtube.getAttribute('src'), /\/embed\/M7lc1UVf-VE\?start=45$/);
  assert.equal(await youtube.getAttribute('loading'), 'lazy');
  await youtube.evaluate(frame => { frame.dataset.sizeTestMounted = 'true'; });
  await setYoutubeWidth(page, 960);
  for (const [width, height] of [[100, 100], [30, 100], [100, 25], [90, 80]]) {
    await setImageLimits(page, width, height);
    await assertImageSize(youtube, { width: 960, height: 540 });
  }
  const imageBeforeVideoResize = await inlineImage.boundingBox();
  for (const width of [240, 800, 1200, 2560]) {
    await setYoutubeWidth(page, width);
    const parent = await youtube.locator('..').boundingBox();
    const expectedWidth = Math.min(parent.width, width);
    await assertImageSize(youtube, { width: expectedWidth, height: expectedWidth * 9 / 16 });
    const frame = await youtube.boundingBox();
    if (width === 1200) assert.ok(frame.width > 800, 'The YouTube slider must allow widths above 800px');
    assert.ok(Math.abs(frame.x + frame.width / 2 - parent.x - parent.width / 2) < 1, 'YouTube must stay centered within the article');
  }
  await assertImageSize(inlineImage, imageBeforeVideoResize);
  assert.equal(await youtube.getAttribute('data-size-test-mounted'), 'true', 'Changing either setting must not recreate the YouTube player');
  await setYoutubeWidth(page, 640);
  await resizeWindow(page, { width: 900, height: 600 });
  await assertImageSize(youtube, { width: 640, height: 360 });
  await setYoutubeWidth(page, 2560);
  const narrowParent = await youtube.locator('..').boundingBox();
  await assertImageSize(youtube, { width: narrowParent.width, height: narrowParent.width * 9 / 16 });
  await resizeWindow(page, viewport);
  await setYoutubeWidth(page, 800);
  const twitch = page.locator('[data-media-href^="https://clips.twitch.tv/"]');
  await twitch.scrollIntoViewIfNeeded();
  await twitch.locator('a').waitFor();
  assert.equal(await twitch.locator('a').getAttribute('target'), '_blank');
  assert.equal(await twitch.locator('iframe').count(), 0);
  await page.locator('[data-media-href="https://i.verb.tw/inline.jpg"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${results}/media-inline.png` });
  const smallInline = page.locator('[data-media-href="https://i.imgur.com/small.jpg"] img');
  await page.locator('[data-media-href="https://i.imgur.com/small.jpg"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-media-href="https://i.imgur.com/small.jpg"] img');
    return img?.complete && img.naturalWidth === 320 && img.naturalHeight === 200;
  });
  for (const useCanvasEngine of [true, false]) {
    await page.evaluate(useCanvasEngine => window.app.onValuesPrefChange({ ...window.app.prefValues, useCanvasEngine }), useCanvasEngine);
    for (const [width, height] of [[100, 100], [10, 100], [100, 10], [100, 100]]) {
      await setImageLimits(page, width, height);
      const currentTextArea = await textAreaSize(page, true);
      const scale = Math.min(1, currentTextArea.width * width / 100 / 320, currentTextArea.height * height / 100 / 200);
      await assertImageSize(smallInline, { width: 320 * scale, height: 200 * scale });
    }
    // The article overlay is outside the scaled terminal and must ignore its legacy inverse scale.
    await page.locator('#easyReadingOverlay').evaluate(overlay => {
      overlay.style.setProperty('--preview-scale-x', '1.5');
      overlay.style.setProperty('--preview-scale-y', '2');
    });
    await assertImageSize(smallInline, { width: 320, height: 200 });
    await page.locator('#easyReadingOverlay').evaluate(overlay => {
      overlay.style.removeProperty('--preview-scale-x');
      overlay.style.removeProperty('--preview-scale-y');
    });
  }
  await setImageLimits(page, 90, 80);
  return { canvasHover: true, domHover: true, verbHover: true, verbInline: true, meeeFallback: true,
    imgurAlbum: true, imgurUnknown: true, stalePreviewCleanup: true, realArticleInline: true,
    albumVideo: true, youtubeElement: true, twitchLink: true, borderlessImages: true,
    sharedImageSizeSliders: true, independentWidthAndHeight: true, inlineResizeWithoutRemount: true,
    smallImagesNeverEnlarged: true, inlineIgnoresTerminalScaling: true,
    textAreaRelativeLimits: true, emptyWindowSpaceIgnored: true, configuredGridSize: true, stretchedTerminalHover: true,
    youtubeIndependentPixelWidth: true, youtubeCentered: true, youtubeResizeWithoutRemount: true };
}
