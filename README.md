# PTT Classic — powered by ptt-term

PTT in a Chrome tab, using the current [ptt/ptt-term](https://github.com/ptt/ptt-term) terminal core with direct connection unblocking and integrated media previews. Version **0.2.4** is a test release based on upstream 3.0.3, production commit [`ba7c00d`](https://github.com/ptt/ptt-term/commit/ba7c00d5edff1654bf3cc89994b9dd2d23a072fe).

The original classic interface is preserved separately as [release 0.1.1](https://github.com/bhmagic/ptt-classic/releases/tag/v0.1.1), including its ready-to-load ZIP and complete source. The permanent `archive/classic-0.1.1` branch also preserves that version.

## Install or update

1. Download the ready-to-load `ptt-classic-0.2.4.zip` from the [0.2.4 test release](https://github.com/bhmagic/ptt-classic/releases/tag/v0.2.4) and extract it. GitHub's automatic Source code ZIP is not an installable extension.
2. Open `chrome://extensions`, enable Developer mode, and load the folder containing `manifest.json`. A local build writes to `dist/ptt-classic`.
3. For an existing installation, log out of PTT, replace its folder with the new package, click Reload on the extension card, and refresh the terminal tab. If using this checkout's existing `dist/ptt-classic` installation, the build already updates that folder.
4. Click the PTT Classic extension icon to open the terminal.

The fixed extension ID and bookmark remain `chrome-extension://gpephnjkgejlfddpjkgkeiffflnnkekg/index.html`. The upgrade preserves saved preferences, maps the old margin and preview settings, and stores a copy of the original settings before migration. No local server or additional extension is needed.

## Media sizing in 0.2.4

Preview limits only shrink oversized images. Smaller images stay at their natural size, even with both sliders at 100%. Inline images no longer inherit the terminal's legacy preview scaling. Both inline and hover previews are checked for shrinking and returning to natural size without enlargement.

YouTube has a separate display-width slider in pixels under the two image sliders: 240–2560px in 10px steps, defaulting to 800px. It is independent of the image height and width limits. Players remain centered at 16:9 and shrink to fit the article if the chosen width is larger than the available space. Adjusting the slider resizes the existing player without reloading it, and the choice is saved when settings close.

## Image size controls in 0.2.1

Expand Settings → Add-ons → Image and Media Preview → Options to adjust maximum image height and width. The two sliders range from 10% to 100% of the window dimensions, defaulting to 80% height and 90% width. They share one saved setting for inline and hover images and apply when settings close. Images keep their proportions, small images are not enlarged, and inline images also fit the article width. Original files are unchanged.

## Core upgrade in 0.2.0

- Replaced the legacy React/Bootstrap terminal with the upstream Preact core: Canvas rendering, a DOM fallback, modern Big5/Unicode support, updated input handling, themes, settings, and Easy Reading.
- Preserved the direct PTT WebSocket Origin rule and extension-scoped Imgur, YouTube, and `i.verb.tw` header fixes.
- Integrated hover images, Imgur albums, extensionless meee links, inline animated media, and YouTube through the new plugin interface. Both renderers are supported. Images have no added white background, padding, or border. Twitch clips retain a working link to open the provider.
- Removed Virtual Keyboard, PWA Installation, Login Assist, Mouse Browsing, Live Update, and the Developer Tools group from the active add-ons.
- Reserved left click for text selection. Middle click and every terminal wheel shortcut remain No action. The Mouse settings retain only right-click behavior and Trim whitespace when copying; the other mouse checkboxes are removed and disabled, including old saved choices.

Remaining add-ons: media preview, input helper, Easy Reading, automatic wrapping, and anti-idle. Right-click the terminal and choose 設定 to configure them. Enable 好讀模式 for inline article media.

## Connection and privacy

Chrome connects directly to `wss://ws.ptt.cc/bbs`. Terminal traffic does not pass through a relay. The toolbar worker only opens the app tab. Media requests go directly to their providers. All executable code is bundled locally, and preferences stay in the extension's local storage.

The four request-header rules apply only to requests initiated by this extension and their listed endpoint/resource types. Host permissions remain unchanged from 0.1.1. This package targets PTT1; PTT2 and custom terminal servers are not enabled. See the [extension guide](extension/README.md) for details.

## Build and verify

Use Node.js 22 or newer and pnpm 11.19.0. From the repository root:

- `pnpm --dir extension install --frozen-lockfile --ignore-scripts`
- `pnpm install --prod --frozen-lockfile --ignore-scripts`
- `pnpm --dir extension build`
- `pnpm --dir extension test`
- `pnpm --dir extension test:core`
- `pnpm --dir extension exec playwright install chromium`
- `pnpm --dir extension test:browser`

The extension has a separate pinned esbuild build. Upstream's website Vite files remain available for provenance; the extension does not install a website service worker. Windows source checkouts use LF for the upstream source-inspection tests.

Core validation runs upstream's terminal tests; its website deployment and PWA build tests are excluded because this project ships a Chrome extension. Browser tests exercise the generated package, including settings migration, disabled mouse commands, Canvas and DOM previews, and an ANSI/Big5 article through Easy Reading. Optional live checks are documented in the extension guide. CI uses simulated terminal/media traffic only.

## Rollback

Use the [0.1.1 archive ZIP](https://github.com/bhmagic/ptt-classic/releases/tag/v0.1.1) to restore the original classic interface. Log out, replace the installed folder, reload the extension, and refresh its tab. A copy of the original preference JSON is retained under `pttclassic.preferences.before-0.2.0` in the extension's local storage. See the extension guide if exact original settings also need restoration.

## Credits and license

This is an independent community adaptation maintained by [bhmagic](https://github.com/bhmagic), not an official PTT release. The terminal comes from ptt-term and the PttChrome contributors; the Git history and original notices are retained. Media helpers come from Mingc's [ptt-media-preview](https://github.com/mingc00/ptt-media-preview), version 6.2.1.

The combined application is distributed under **GNU GPL v2**. The vendored media helpers retain their MIT license, and independently written integration files have the additional MIT permission listed in [ATTRIBUTION.md](ATTRIBUTION.md). These permissions do not relicense the terminal or the combined application as MIT. Upstream provenance and build notices are included in the package.
