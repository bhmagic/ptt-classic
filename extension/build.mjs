import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(extensionDir, '..');
const output = path.join(root, 'dist', 'ptt-classic');
const manifest = JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
const upstream = JSON.parse(await readFile(path.join(extensionDir, 'upstream.json'), 'utf8'));
let sourceCommit = 'source-archive';
try {
  sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  // GitHub source archives can be built without a .git directory or Git installed.
}
const buildDate = new Date().toISOString().slice(0, 10);
const environment = {
  NODE_ENV: 'production',
  APP_TITLE: 'PTT Classic',
  DYNAMIC_TITLE: false,
  SITE_URL: 'wss://ws.ptt.cc/bbs',
  SITE_TYPE: 'ptt',
  ALLOW_OVERRIDE_FROM_QUERY: false,
  DEVELOPER_MODE: false,
  DEFAULT_PLUGINS: '-pwa_prompt',
  DEFAULT_PREFS: '{"enablePwaPrompt":false}',
};
const appInfo = {
  NAME: 'PTT Classic',
  VERSION: `${manifest.version} / ptt-term ${upstream.version}`,
  COMMIT_HASH: sourceCommit.slice(0, 8),
  BUILD_DATE: buildDate,
  GITHUB_REPOSITORY_OWNER: 'bhmagic',
  GITHUB_REPOSITORY: 'bhmagic/ptt-classic',
};
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
  jsx: 'automatic',
  jsxImportSource: 'preact',
  alias: {
    preact: path.join(extensionDir, 'node_modules', 'preact'),
    react: path.join(extensionDir, 'node_modules', 'preact', 'compat'),
    'react-dom': path.join(extensionDir, 'node_modules', 'preact', 'compat'),
  },
  loader: {
    '.js': 'jsx', '.bin': 'file', '.png': 'file', '.bmp': 'file', '.gif': 'file',
    '.svg': 'file', '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.eot': 'file'
  },
  define: {
    ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
    process: JSON.stringify({ env: environment }),
    APP: JSON.stringify(appInfo),
  },
  plugins: [{
    name: 'classic-icons',
    setup(builder) {
      builder.onLoad({ filter: /[\\/]Settings[\\/]PrefModal\.js$/ }, async ({ path: filename }) => {
        const source = await readFile(filename, 'utf8');
        const start = source.indexOf('{navActiveKey === "mouse" && (');
        const end = source.indexOf('{navActiveKey === "plugins" && (', start);
        if (start === -1 || end === -1) {
          throw new Error('The upstream settings layout changed; update the MouseSettings build adapter to match it.');
        }
        const contents = `import MouseSettings from ${JSON.stringify(path.join(extensionDir, 'MouseSettings.js'))};\n`
          + source.slice(0, start)
          + '{navActiveKey === "mouse" && <MouseSettings values={values} rightClickValue={normalizeMouseButtonAction(values.rightClickAction, "right")} rightClickOptions={renderMouseButtonOptions(["menu", "paste", "none"], this.props.app?.site ? Boolean(this.props.app.site.supportNavKeys) : true)} onCloseClick={this.handleCloseClick} onTextInputChange={this.handleTextInputChange} onCheckboxChange={this.handleCheckboxChange} />}\n'
          + source.slice(end);
        return { contents, loader: 'jsx' };
      });
      builder.onLoad({ filter: /MouseBrowsing\.js$/ }, async ({ path: filename }) => {
        const imports = [];
        const contents = (await readFile(filename, 'utf8')).replace(
          /new URL\("([^"\n]+)", import\.meta\.url\)\.href/g,
          (_, source) => {
            const identifier = `cursorAsset${imports.length}`;
            imports.push(`import ${identifier} from ${JSON.stringify(source)};`);
            return identifier;
          }
        );
        return { contents: imports.join('\n') + '\n' + contents, loader: 'jsx' };
      });
      builder.onResolve({ filter: /^Icon\// }, ({ path: name }) => {
        const relative = name.slice('Icon/'.length).replace(/\?inline$/, '');
        const themed = path.join(root, 'src', 'icon', 'ptt.cc', relative);
        return { path: existsSync(themed) ? themed : path.join(root, 'src', 'icon', relative) };
      });
    }
  }]
});

// Retain upstream's DOM anchors. Move its early compatibility shim to a local
// script because Manifest V3 disallows inline JavaScript. Chrome provides the
// extension lifecycle, so the website PWA manifest and worker are not bundled.
let html = await readFile(path.join(root, 'index.html'), 'utf8');
const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
await writeFile(path.join(output, 'bootstrap.js'), bootstrap);
html = html
  .replace(/<script>[\s\S]*?<\/script>/g, '')
  .replace(/<script type="module" src="\/src\/entry.js"><\/script>/, '')
  .replace(/<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '')
  .replace(/%APP_TITLE%|%APP_SHORT_NAME%/g, 'PTT Classic')
  .replace(/%APP_FAVICON%/g, 'icon.png')
  .replace(/%APP_DESCRIPTION%/g, 'PTT powered by ptt-term, with direct connection and media previews.')
  .replace('<head>', '<head>\n    <script src="bootstrap.js"></script>')
  .replace('</head>', '<link rel="stylesheet" href="client.css">\n    <script defer src="client.js"></script>\n  </head>');
if (/%APP_|<%/.test(html)) throw new Error('Unresolved HTML template value');

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
await copyFile(path.join(extensionDir, 'upstream.json'), path.join(output, 'PTT-TERM-UPSTREAM.json'));
await writeFile(path.join(output, 'version.json'), JSON.stringify({ version: manifest.version, commit: appInfo.COMMIT_HASH, buildDate }));
await writeFile(path.join(root, 'dist', 'extension-build.json'), JSON.stringify({
  extensionId: id,
  bookmark: `chrome-extension://${id}/index.html`,
  baseline: upstream.commit,
  sourceCommit,
  version: manifest.version,
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
