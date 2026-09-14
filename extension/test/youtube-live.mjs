import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.cache', 'playwright');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
const { chromium } = await import('playwright');
const output = path.join(root, 'dist', 'ptt-classic');
const results = path.join(root, 'test-results');
const info = JSON.parse(await readFile(path.join(root, 'dist', 'extension-build.json'), 'utf8'));
await mkdir(results, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`]
});
try {
  const page = await context.newPage();
  // Only YouTube is live in this check; PTT is simulated and no video is played.
  await page.routeWebSocket('wss://ws.ptt.cc/bbs', socket => socket.send(Buffer.from('Local media test')));
  await page.goto(info.bookmark);
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube.com/embed/M7lc1UVf-VE';
    frame.style.cssText = 'position:fixed;inset:0;width:800px;height:450px;z-index:1000';
    document.body.append(frame);
  });
  const locator = page.locator('iframe').contentFrame();
  await locator.locator('#movie_player').waitFor();
  const frame = page.frames().find(item => item.url().startsWith('https://www.youtube.com/embed/'));
  await frame.waitForFunction(() => document.querySelector('#movie_player')?.getDuration?.() > 0, null, { timeout: 20000 });
  const report = await locator.locator('#movie_player').evaluate(player => ({
    title: document.title,
    error: player.querySelector('.ytp-error')?.textContent || null,
    duration: player.getDuration(),
    state: player.getPlayerState()
  }));
  assert.equal(report.error, null);
  assert.ok(report.duration > 0);
  assert.notEqual(report.state, 1, 'The test must not start playback');
  await page.screenshot({ path: path.join(results, 'youtube-live.png') });
  await writeFile(path.join(results, 'youtube-live.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
}
