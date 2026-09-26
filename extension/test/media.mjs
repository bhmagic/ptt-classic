import assert from 'node:assert/strict';

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
  await page.route(/^https:\/\/(www\.youtube\.com|clips\.twitch\.tv)\//, route =>
    route.fulfill({ contentType: 'text/html', body: '<p>Embedded player fixture</p>' }));

  send('\x1b[2J\x1b[Hhttps://i.imgur.com/fixture.jpg\r\nhttps://meee.com.tw/fixture\r\nhttps://imgur.com/a/album123\r\nhttps://imgur.com/unknown123\r\nhttps://i.verb.tw/fixture.jpg\r\n');
  const container = page.locator('#mainContainer');
  await page.locator('[data-ptt-media-preview-container]').waitFor();
  const preview = page.locator('img[data-ptt-media-preview-fallback]');
  for (const [href, expected] of [
    ['https://i.imgur.com/fixture.jpg', 'https://i.imgur.com/fixture.jpg'],
    ['https://meee.com.tw/fixture', 'https://i.meee.com.tw/fixture.png'],
    ['https://imgur.com/a/album123', 'https://i.imgur.com/album-first.jpg'],
    ['https://imgur.com/unknown123', 'https://i.imgur.com/resolved-image.png'],
    ['https://i.verb.tw/fixture.jpg', 'https://i.verb.tw/fixture.jpg']
  ]) {
    await container.locator(`a[href="${href}"]`).hover();
    await page.waitForFunction(src => {
      const img = document.querySelector('img[data-ptt-media-preview-fallback]');
      return img?.src === src && img.complete && img.naturalWidth > 0;
    }, expected);
    await page.waitForFunction(() => {
      const box = document.querySelector('img[data-ptt-media-preview-fallback]')?.getBoundingClientRect();
      return box && box.x >= 0 && box.y >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
    });
    const bounds = await preview.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
    assert.equal(await preview.evaluate(img => getComputedStyle(img).pointerEvents), 'none');
    assert.equal(await container.locator(':scope > img:visible').count(), 1, 'Only the enhanced preview is visible');
    await page.mouse.move(10, 10);
    await preview.waitFor({ state: 'detached' });
  }
  assert.ok(imageRequests.includes('https://i.meee.com.tw/fixture.jpg'));
  assert.ok(imageRequests.includes('https://i.meee.com.tw/fixture.png'));
  assert.ok(!imageRequests.includes('https://i.imgur.com/a/album123.jpg'), 'The native hover loader must not issue duplicate requests');

  await container.locator('a[href="https://i.imgur.com/fixture.jpg"]').hover();
  await preview.waitFor();
  await page.screenshot({ path: `${results}/media-hover.png` });
  send('\x1b[2J\x1b[HAnother article\r\n');
  await preview.waitFor({ state: 'detached' });

  await page.locator('#BBSWindow').click({ button: 'right', position: { x: 100, y: 160 } });
  await page.getByRole('menuitem', { name: '設定', exact: true }).click();
  await page.locator('.PrefModal input[name="enableEasyReading"]').check();
  await page.locator('.PrefModal .close:visible').click();
  await page.locator('.PrefModal').waitFor({ state: 'detached' });

  // This is the classic renderer's link-wrapper/preview-container DOM contract.
  await container.evaluate(main => {
    main.replaceChildren();
    const marker = document.createElement('span');
    marker.className = 'q4 b7';
    marker.textContent = 'Article fixture';
    main.append(marker);
    for (const [id, href] of [
      ['image', 'https://i.imgur.com/inline.jpg'],
      ['verb', 'https://i.verb.tw/inline.jpg'],
      ['album', 'https://imgur.com/a/album123'],
      ['youtube', 'https://youtu.be/M7lc1UVf-VE?t=45'],
      ['twitch', 'https://clips.twitch.tv/IncredulousAbstemiousFennelImGlitch']
    ]) {
      const wrapper = document.createElement('span');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = href;
      wrapper.append(link);
      const target = document.createElement('div');
      target.dataset.testPreview = id;
      main.append(wrapper, target);
    }
  });
  await page.locator('[data-test-preview="image"] img').waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-test-preview="verb"] img');
    return image?.complete && image.naturalWidth > 0;
  });
  await page.locator('[data-test-preview="album"] video').waitFor();
  assert.equal(await page.locator('[data-test-preview="album"] img').count(), 1);
  const youtube = page.locator('[data-test-preview="youtube"] iframe');
  await youtube.waitFor({ state: 'attached' });
  assert.match(await youtube.getAttribute('src'), /\/embed\/M7lc1UVf-VE\?start=45$/);
  const twitch = page.locator('[data-test-preview="twitch"] a');
  await twitch.waitFor({ state: 'attached' });
  assert.match(await twitch.getAttribute('href'), /clips\.twitch\.tv\/IncredulousAbstemiousFennelImGlitch/);
  assert.equal(await twitch.getAttribute('target'), '_blank');
  assert.equal(await page.locator('[data-test-preview="twitch"] iframe').count(), 0);
  assert.equal(await youtube.getAttribute('loading'), 'lazy');
  return { imageHover: true, verbHover: true, verbInline: true, meeeFallback: true, imgurAlbum: true, imgurUnknown: true, stalePreviewCleanup: true, inlineImage: true, albumVideo: true, youtubeElement: true, twitchLink: true };
}
