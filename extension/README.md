# PTT Classic 0.2.6 for Chrome

A local Manifest V3 extension powered by ptt-term 3.0.3 at production commit `ba7c00d5edff1654bf3cc89994b9dd2d23a072fe`. Source: [bhmagic/ptt-classic](https://github.com/bhmagic/ptt-classic). This is an independent community build.

## Update the existing installation

Log out of PTT. Replace the contents of the installed extension folder with this package, or rebuild `dist/ptt-classic` in the source checkout. Open `chrome://extensions`, click Reload on PTT Classic, and refresh the terminal tab. If loading for the first time, enable Developer mode and choose Load unpacked, selecting the folder containing `manifest.json`.

The fixed public key preserves ID `gpephnjkgejlfddpjkgkeiffflnnkekg` and the bookmark `chrome-extension://gpephnjkgejlfddpjkgkeiffflnnkekg/index.html`. Existing settings are retained. The old `bbsMargin` and `enablePicPreview` settings map to their new counterparts. Upstream handles the other legacy terminal preference aliases. Defaults use Canvas; Settings → Advanced can select the DOM renderer.

## Features and simplified settings

Hover over an image URL for a floating preview. In Settings → Add-ons, enable Easy Reading (好讀模式) to show inline images, Imgur albums, animated Imgur media, and YouTube videos in articles. Extensionless meee.com.tw image links try the available image formats. Image requests and API resolution start when relevant content is hovered or near the visible article area. Images have no extra white background, padding, or border. Twitch clips open in a new tab. Failed inline media offers an external link.

Imgur GIFs remain animated images in direct links, resolved links and albums. They do not require a play button and are no longer converted to MP4 players. Original URLs and query parameters are preserved. Actual MP4 items keep their playback controls.

Expand Image and Media Preview → Options under Settings → Add-ons for two size sliders: maximum display height and maximum display width. Each ranges from 10% to 100% of the rendered text area; defaults are 80% height and 90% width. The area follows columns times character width and rows times line height, excluding unused window space. Both inline and hover images use these same saved percentages, applied when settings close and updated automatically as the text layout changes. These are upper limits: oversized images shrink proportionally, and smaller images stay at their natural size instead of filling the limit. Inline images also stay within the article width; hover images stay within the window. This changes display size only.

YouTube has its own display-width slider below the image controls: 240–2560px in 10px steps, with an 800px default. It is independent of both image limits. Players stay centered at 16:9, shrink to fit the article width if needed, and resize without being recreated or reloaded. The pixel-width setting is saved when settings close.

The remaining add-ons are Media Preview, Input Helper, Easy Reading, Auto Wrap, and Anti-Idle. Virtual Keyboard, PWA Installation, Login Assist, Mouse Browsing, Live Update, and Developer Tools are removed from the active registry and settings.

Left click selects text. Middle click and all terminal wheel shortcuts are fixed to No action. Old saved mouse actions cannot re-enable them. The Mouse tab contains right-click behavior and only one checkbox: Trim whitespace when copying (複製時自動修剪行尾空白). Automatic copying on selection, terminal mouse reporting, back navigation, and special wheel modes are disabled. Scrolling the Easy Reading article itself still works normally.

## Direct connection and host rules

Chrome connects to `wss://ws.ptt.cc/bbs` directly. A static request-header rule sets Origin to `app://ptt-classic` only for this extension's request to that exact WebSocket endpoint. There is no relay. The service worker only opens the terminal when the toolbar icon is clicked.

Additional extension-scoped rules remove Referer for Imgur images/media, supply the application's stable identity for YouTube embed frames, and supply that identity for `https://i.verb.tw/` image requests. The identity is `https://ptt-classic.gpephnjkgejlfddpjkgkeiffflnnkekg/`; it names the app and does not represent a hosted website. The rules do not affect requests initiated by ordinary websites. Permissions are unchanged from 0.1.1.

All executable JavaScript, CSS, fonts, and terminal data tables are bundled locally. Clipboard permissions support copy/paste commands. Preferences remain in local storage. Public media APIs and provider embedding policies may change independently. PTT2 and custom servers are not enabled in this package.

## Build and tests

Use Node.js 22 or newer and pnpm 11.19.0. From the repository root, install extension dependencies with `pnpm --dir extension install --frozen-lockfile --ignore-scripts` and upstream runtime dependencies with `pnpm install --prod --frozen-lockfile --ignore-scripts`. Run `pnpm --dir extension build` to generate `dist/ptt-classic`.

- `pnpm --dir extension test`: package resources, licenses, stable ID, request rules, preference migration, and disabled settings.
- `pnpm --dir extension test:core`: upstream terminal regression tests. Website deployment/PWA packaging tests are excluded; this extension's actual package has separate tests.
- `pnpm --dir extension exec playwright install chromium`, then `pnpm --dir extension test:browser`: isolated browser checks with simulated PTT/media traffic. Uses a temporary profile and substitutes clipboard services.
- `pnpm --dir extension test:live`: optional direct PTT login-screen check, without signing in.
- `pnpm --dir extension test:verb-live -- https://i.verb.tw/YOUR_IMAGE.jpg`: optional live image check, covering hover, a real Easy Reading article, HTTP status, and the Referer actually sent.
- `pnpm --dir extension test:youtube-live`: optional public YouTube demo-player check without playback.

Results and screenshots are saved in `test-results`. A workspace `.cache/playwright` browser installation is reused when present. GitHub Actions runs the simulated checks and publishes an installable ZIP artifact.

## Roll back to the original classic interface

Download and extract [PTT Classic 0.1.1](https://github.com/bhmagic/ptt-classic/releases/tag/v0.1.1). Log out, replace the installed extension folder with that package, reload it in Chrome, and refresh its tab. The extension ID stays the same.

The first upgrade preserves the exact old preference JSON in local storage under `pttclassic.preferences.before-0.2.0`. To restore those original settings too, use the extension tab's DevTools → Application → Local Storage, copy that value into `pttchrome.pref.v1`, then reload the old app. Ordinary rollback can reuse compatible settings without this step. No passwords are added by the migration.

## Source and licenses

The terminal source matches the upstream commit recorded in `PTT-TERM-UPSTREAM.json`. The build adapts the early HTML script and cursor URLs to Manifest V3 and substitutes this extension's simplified Mouse settings component. The website service worker is omitted. Extension-specific preferences and the media adapter register before upstream startup.

The combined application is GPL v2. See `LICENSE`, `ATTRIBUTION.md`, `LICENSES`, `MEDIA-PREVIEW-LICENSE.txt`, `MEDIA-PREVIEW-UPSTREAM.json`, `CURSOR-COPYRIGHT.txt`, and `THIRD-PARTY-NOTICES.txt`. Matching source is maintained on GitHub. The media helper's original DOM observer is retained in source history but is not loaded by this version.
