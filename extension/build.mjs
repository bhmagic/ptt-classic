import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(extensionDir, '..');
const output = path.join(root, 'dist', 'ptt-classic');
const manifest = JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)]
  .map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');

// Only the generated extension folder is replaced, never the source or sibling builds.
if (path.dirname(output) !== path.join(root, 'dist') || path.basename(output) !== 'ptt-classic') {
  throw new Error('Unexpected extension output directory');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const result = await build({
  absWorkingDir: extensionDir,
  entryPoints: ['client.js'],
  outdir: output,
  bundle: true,
  format: 'iife',
  target: 'chrome101',
  minify: true,
  sourcemap: 'external',
  metafile: true,
  legalComments: 'linked',
  assetNames: 'assets/[name]-[hash]',
  nodePaths: [path.join(extensionDir, 'node_modules')],
  inject: [path.join(extensionDir, 'globals.js')],
  alias: { querystring: 'querystring-es3' },
  loader: {
    '.js': 'jsx', '.bin': 'file', '.png': 'file', '.bmp': 'file',
    '.svg': 'file', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.eot': 'file'
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.DEVELOPER_MODE': 'false',
    'process.env.ALLOW_SITE_IN_QUERY': 'false',
    'process.env.DEFAULT_SITE': '"wsstelnet://ws.ptt.cc/bbs"',
    'process.env.PTTCHROME_PAGE_TITLE': '"PTT Classic"',
    'process.env.PTTCHROME_DYNAMIC_TITLE': 'false',
    'process.env.PTTCHROME_MEDIA_PREVIEW': 'true',
    'PTTCHROME.NAME': '"PTT Classic"',
    'PTTCHROME.VERSION': JSON.stringify(`1.2.0 / extension ${manifest.version}`),
    'PTTCHROME.GITHUB_REPOSITORY_OWNER': '"bhmagic"',
    'PTTCHROME.GITHUB_REPOSITORY': '"bhmagic/ptt-classic"'
  },
  plugins: [{
    name: 'classic-icons',
    setup(builder) {
      builder.onResolve({ filter: /^Icon\// }, ({ path: name }) => {
        const relative = name.slice('Icon/'.length).replace(/\?inline$/, '');
        const themed = path.join(root, 'src', 'icon', 'ptt.cc', relative);
        return { path: existsSync(themed) ? themed : path.join(root, 'src', 'icon', relative) };
      });
    }
  }]
});

// Reuse the original HTML structure so the terminal's DOM remains unchanged.
const html = (await readFile(path.join(root, 'src', 'dev.html'), 'utf8'))
  .replace('<%= process.env.PTTCHROME_PAGE_TITLE %>', 'PTT Classic')
  .replace("<%= require('Icon/logo.png') %>", 'icon.png')
  .replace('<%= process.env.PTTCHROME_PAGE_DESCRIPTION %>', 'Your local classic PTT terminal.')
  .replace('</head>', '<link rel="stylesheet" href="client.css">\n    <script defer src="client.js"></script>\n  </head>');
if (html.includes('<%')) throw new Error('Unresolved HTML template value');

const rules = [{
  id: 1,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [{ header: 'Origin', operation: 'set', value: 'app://ptt-classic' }]
  },
  condition: {
    urlFilter: '|wss://ws.ptt.cc/bbs|',
    isUrlFilterCaseSensitive: true,
    resourceTypes: ['websocket'],
    initiatorDomains: [id]
  }
}, {
  id: 2,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [{ header: 'referer', operation: 'remove' }]
  },
  condition: {
    urlFilter: '|https://',
    requestDomains: ['imgur.com'],
    resourceTypes: ['image', 'media'],
    initiatorDomains: [id]
  }
}, {
  id: 3,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    // YouTube requires the app name and generated ID as the embed's client identity.
    requestHeaders: [{ header: 'Referer', operation: 'set', value: `https://ptt-classic.${id}/` }]
  },
  condition: {
    urlFilter: '|https://www.youtube.com/embed/',
    resourceTypes: ['sub_frame'],
    initiatorDomains: [id]
  }
}, {
  id: 4,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    // i.verb.tw requires a Referer for browser images; extension pages omit it.
    requestHeaders: [{ header: 'Referer', operation: 'set', value: `https://ptt-classic.${id}/` }]
  },
  condition: {
    urlFilter: '|https://i.verb.tw/',
    resourceTypes: ['image'],
    initiatorDomains: [id]
  }
}];
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(output, 'rules.json'), JSON.stringify(rules, null, 2) + '\n');
await copyFile(path.join(extensionDir, 'background.js'), path.join(output, 'background.js'));
await copyFile(path.join(extensionDir, 'README.md'), path.join(output, 'README.md'));
await copyFile(path.join(root, 'src', 'icon', 'ptt.cc', 'icon_128.png'), path.join(output, 'icon.png'));
await copyFile(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
await copyFile(path.join(root, 'ATTRIBUTION.md'), path.join(output, 'ATTRIBUTION.md'));
await mkdir(path.join(output, 'LICENSES'), { recursive: true });
await copyFile(path.join(root, 'LICENSES', 'MIT-PTT-Classic.txt'), path.join(output, 'LICENSES', 'MIT-PTT-Classic.txt'));
await copyFile(path.join(extensionDir, 'vendor', 'ptt-media-preview', 'LICENSE'), path.join(output, 'MEDIA-PREVIEW-LICENSE.txt'));
await copyFile(path.join(extensionDir, 'vendor', 'ptt-media-preview', 'UPSTREAM.json'), path.join(output, 'MEDIA-PREVIEW-UPSTREAM.json'));
await copyFile(path.join(root, 'src', 'cursor', 'COPYRIGHT.txt'), path.join(output, 'CURSOR-COPYRIGHT.txt'));
await writeFile(path.join(root, 'dist', 'extension-build.json'), JSON.stringify({
  extensionId: id,
  bookmark: `chrome-extension://${id}/index.html`,
  baseline: '315fbbd4a901ac9e8ce487dddf901b84ed788fcc',
  ...result
}, null, 2) + '\n');

// Include dependency license files alongside the bundled code, including transitive packages.
const notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  let dir = path.dirname(path.resolve(extensionDir, input));
  while (dir.includes(`${path.sep}node_modules${path.sep}`)) {
    if (existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
      if (!pkg.name || !pkg.version) {
        dir = path.dirname(dir);
        continue;
      }
      const label = `${pkg.name}@${pkg.version}`;
      if (!notices.has(label)) {
        const entries = await readdir(dir);
        let files = entries.filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
        if (files.length === 0) files = entries.filter(name => /^readme(\.|$)/i.test(name));
        const contents = await Promise.all(files.map(name => readFile(path.join(dir, name), 'utf8')));
        notices.set(label, `${label} (${pkg.license || 'see package'})\n${contents.join('\n')}`);
      }
      break;
    }
    dir = path.dirname(dir);
  }
}
await writeFile(path.join(output, 'THIRD-PARTY-NOTICES.txt'), [...notices.values()].sort().join('\n\n--------------------\n\n'));
console.log(`Extension built: ${output}\nBookmark: chrome-extension://${id}/index.html`);
