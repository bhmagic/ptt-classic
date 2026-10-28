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

export async function exerciseMedia(page, send, results) {
  const imageRequests = [];
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#267b92"/><text x="100" y="200" font-size="90" fill="white">Media preview fixture</text></svg>';
  await page.route(/^https:\/\/(i\.imgur\.com|i\.meee\.com\.tw|i\.verb\.tw)\//, route => {
    const url = route.request().url();
    imageRequests.push(url);
    if (url === 'https://i.meee.com.tw/fixture.jpg') {
      return route.fulfill({ contentType: 'image/png', body: 'invalid-image-for-fallback-test' });
    }
    if (url.endsWith('.mp4')) return route.fulfill({ contentType: 'video/mp4', body: '' });
    return route.fulfill({ contentType: 'image/svg+xml', body: image });
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
  const album = page.locator('[data-media-href="https://imgur.com/a/album123"]');
  await album.scrollIntoViewIfNeeded();
  await album.locator('video').waitFor();
  assert.equal(await album.locator('img').count(), 1);
  const youtube = page.locator('[data-media-href="https://youtu.be/M7lc1UVf-VE?t=45"] iframe');
  await youtube.scrollIntoViewIfNeeded();
  assert.match(await youtube.getAttribute('src'), /\/embed\/M7lc1UVf-VE\?start=45$/);
  assert.equal(await youtube.getAttribute('loading'), 'lazy');
  const twitch = page.locator('[data-media-href^="https://clips.twitch.tv/"]');
  await twitch.scrollIntoViewIfNeeded();
  await twitch.locator('a').waitFor();
  assert.equal(await twitch.locator('a').getAttribute('target'), '_blank');
  assert.equal(await twitch.locator('iframe').count(), 0);
  await page.locator('[data-media-href="https://i.verb.tw/inline.jpg"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${results}/media-inline.png` });
  return { canvasHover: true, domHover: true, verbHover: true, verbInline: true, meeeFallback: true,
    imgurAlbum: true, imgurUnknown: true, stalePreviewCleanup: true, realArticleInline: true,
    albumVideo: true, youtubeElement: true, twitchLink: true, borderlessImages: true };
}
