import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'dist', 'ptt-classic');
const read = name => readFile(path.join(output, name), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const buildInfo = JSON.parse(await readFile(path.join(root, 'dist', 'extension-build.json'), 'utf8'));

test('the unpacked folder has every referenced resource and no remote executable code', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<%|(?:src|href)=["'](?:https?:|\/\/)/);
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    assert.equal(script[1].trim(), '', 'Executable code must live in bundled script files');
  }
  const resources = [
    manifest.background.service_worker,
    manifest.icons['128'],
    ...manifest.declarative_net_request.rule_resources.map(resource => resource.path),
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1])
  ];
  for (const resource of resources) {
    assert.ok((await stat(path.join(output, resource))).size > 0, resource);
  }
  for (const [file, info] of Object.entries(buildInfo.metafile.outputs)) {
    for (const imported of info.imports) {
      assert.equal(imported.external, undefined, `${file} must bundle ${imported.path}`);
      await stat(path.resolve(root, 'extension', imported.path.split(/[?#]/)[0]));
    }
  }
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self';/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-eval|unsafe-inline/);
  assert.match(await read('LICENSE'), /GNU GENERAL PUBLIC LICENSE/);
  assert.match(await read('THIRD-PARTY-NOTICES.txt'), /react@16\.14\.0/);
  assert.ok(!(await read('THIRD-PARTY-NOTICES.txt')).includes('undefined@undefined'), 'Dependency notices must identify their packages');
});

test('the bookmark identity is fixed by the packaged public key', () => {
  const digest = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  const id = [...digest].map(hex => String.fromCharCode(97 + parseInt(hex, 16))).join('');
  assert.equal(id, 'gpephnjkgejlfddpjkgkeiffflnnkekg');
  assert.equal(buildInfo.bookmark, `chrome-extension://${id}/index.html`);
});

test('the connection permission and Origin rule cannot affect arbitrary sites', async () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['wss://ws.ptt.cc/*', 'https://*.imgur.com/*', 'https://www.youtube.com/*']);
  assert.deepEqual([...manifest.permissions].sort(), ['clipboardRead', 'clipboardWrite', 'declarativeNetRequestWithHostAccess']);
  const rules = JSON.parse(await read('rules.json'));
  assert.equal(rules.length, 3);
  assert.deepEqual(rules[0].condition.initiatorDomains, [buildInfo.extensionId]);
  assert.equal(rules[0].condition.urlFilter, '|wss://ws.ptt.cc/bbs|');
  assert.deepEqual(rules[0].condition.resourceTypes, ['websocket']);
  assert.deepEqual(rules[0].action.requestHeaders, [{ header: 'Origin', operation: 'set', value: 'app://ptt-classic' }]);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'self' wss:\/\/ws\.ptt\.cc\/bbs https:\/\/api\.flickr\.com https:\/\/api\.imgur\.com;/);
  assert.deepEqual(rules[1].condition.initiatorDomains, [buildInfo.extensionId]);
  assert.deepEqual(rules[1].condition.requestDomains, ['imgur.com']);
  assert.deepEqual(rules[1].condition.resourceTypes, ['image', 'media']);
  assert.match(await read('MEDIA-PREVIEW-LICENSE.txt'), /Copyright \(c\) 2021 Mingc/);
  assert.deepEqual(rules[2].condition.initiatorDomains, [buildInfo.extensionId]);
  assert.deepEqual(rules[2].condition.resourceTypes, ['sub_frame']);
  assert.equal(rules[2].condition.urlFilter, '|https://www.youtube.com/embed/');
});
