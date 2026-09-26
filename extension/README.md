# PTT Classic for Chrome

The classic PTT web terminal, packaged as a Manifest V3 extension with [mingc00/ptt-media-preview](https://github.com/mingc00/ptt-media-preview) 6.2.1 built in. Its interface starts from upstream commit `315fbbd4a901ac9e8ce487dddf901b84ed788fcc` (September 3, 2026), before the Canvas interface rewrite. The source is at [bhmagic/ptt-classic](https://github.com/bhmagic/ptt-classic).

**Use the prepared folder**

1. Keep the prepared `ptt-classic` folder somewhere permanent. In the source checkout, the build produces `dist/ptt-classic`. If using a ZIP, extract it first.
2. In Chrome, open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`. Select `dist/ptt-classic` for a local build, not the repository root or the `extension` source folder.
4. Open Chrome's extensions menu and click **PTT Classic**. Pin its icon if desired. It opens the terminal in a full browser tab.
5. Press **Ctrl+D** to bookmark that tab.

The bookmark address is `chrome-extension://gpephnjkgejlfddpjkgkeiffflnnkekg/index.html`. The manifest includes a fixed public key so rebuilds and folder moves retain the same extension ID. Keep the extension enabled in the Chrome profile where you use that bookmark. After moving the folder, load it from the new location again. Rebuilding in place requires clicking **Reload** on the extension card and refreshing the terminal tab; do this after logging out.

The prepared folder needs no Node.js, terminal window, local server, or cloud host at runtime. Open it through Chrome after loading the extension. Double-clicking its HTML file is not the installation method.

**Connection and permissions**

The browser connects directly to `wss://ws.ptt.cc/bbs`. Chrome applies a static rule to that exact WebSocket URL, only when the request originates in this extension. It sets the handshake's Origin header to `app://ptt-classic`. The explicit `wss://ws.ptt.cc/*` host permission is required; an HTTP/HTTPS wildcard alone does not grant access to the WebSocket request.

There is no relay. The event-driven service worker only opens a tab when the toolbar icon is clicked; it does not transport terminal data or keep a connection alive. The terminal connection lives in its browser tab.

The extension requests clipboard read/write permissions to preserve the classic copy and paste menu commands. Clipboard access occurs through those client actions. Preferences remain in this extension's local storage. Settings from the official site's different origin are not imported automatically; right-click inside the terminal and choose **設定** to configure them.

All executable code, styles, fonts, and character conversion tables are bundled. Media previews load content directly from its provider, and can query `api.imgur.com` or the inherited `api.flickr.com` resolver. These requests are separate from the PTT connection. PTT2 and custom server URLs are not included in this first package.

**Built-in media previews**

- With Picture Preview enabled and Easy Reading disabled, hover over an image link for a floating preview. This includes common image URLs, Imgur links and albums, and extensionless meee.com.tw links. The preview stays inside the viewport and disappears when navigating away.
- Enable **啟用文章好讀模式** in the classic settings to use inline images, Imgur albums and animated media, and YouTube players while reading articles. The original addon excludes mail from inline previews. Actual playback remains subject to the media provider and the video's embedding permissions.
- Twitch clips open in a new tab through **在 Twitch 開啟影片**. Twitch's current response allows HTTPS website ancestors, which excludes our `chrome-extension://` page; the integration provides a working link instead of a blocked player.
- The original native hover loader is disabled in this extension build to avoid duplicate image requests behind the enhanced preview.

Three additional, narrowly scoped host permissions support these features. For Imgur images and media, Chrome removes the Referer header only on requests originating in this extension. For YouTube embed frames, Chrome supplies this app's stable name and ID as the Referer (`https://ptt-classic.gpephnjkgejlfddpjkgkeiffflnnkekg/`), following [YouTube's client-identification guidance](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity). That string identifies the application; no site is hosted at that address. These rules do not modify requests initiated by ordinary websites.

For images hosted on `https://i.verb.tw/`, version 0.1.1 adds a rule supplying the same app Referer. The host [requires a Referer for browser image requests](https://img.verb.tw/home/developers/); extension pages omit it, causing a 403 blocking page and Chrome's `ERR_BLOCKED_BY_ORB` error. The rule applies only to image requests from this extension to that exact HTTPS host. It does not alter ordinary website requests or top-level navigation, and the image still loads directly from the provider. Chrome may ask you to accept access to `i.verb.tw` when updating.

The media addon is vendored at commit `5c2ebefc106f6c8aa3245eb2093c04cb63ebd8e4`. Its MIT license and local adaptations are recorded in `vendor/ptt-media-preview` in the source checkout and in the prepared folder's media-preview notices. No second extension is needed. Its inherited public Imgur API client IDs may be subject to upstream quota or service changes.

This is a personal unpacked extension, not an official PTT release or a Chrome Web Store listing. PTT's Origin policy can change. If a connection fails, use the classic reconnect prompt; errors can also be inspected on the extension's card at `chrome://extensions` and in the terminal tab's developer console.

**Build from the source checkout**

Use Node.js 22 or newer and pnpm 11.19.0. The extension has its own dependency lockfile and build so the legacy Webpack setup does not need to run. Its direct client dependency versions match the archived upstream lockfile.

From the repository root, run `pnpm --dir extension install --frozen-lockfile --ignore-scripts`, then `pnpm --dir extension build`. The result is `dist/ptt-classic`. The fixed public key in `extension/manifest.json` is an identity value, not a secret or a signing key.

Run `pnpm --dir extension test` to validate the package. For browser checks, first run `pnpm --dir extension exec playwright install chromium` (on Linux CI, add `--with-deps`), then `pnpm --dir extension test:browser`. The browser checks use an isolated profile and simulated terminal traffic; clipboard fixtures prevent access to your real clipboard. They verify Chinese decoding and encoding, keyboard input, settings persistence, resizing, bundled assets, and all network rules' scope. Image/album/player fixtures also exercise hover positioning, image fallback, stale-preview cleanup, inline media, and Twitch links without contacting those providers.

The optional `pnpm --dir extension test:live` connects to PTT's public login screen and verifies the actual Origin header and HTTP 101 upgrade. It does not enter credentials or log in. Chromium screenshots and JSON results are saved under `test-results` in the checkout. Neither the simulated checks nor the login-screen check verify every logged-in PTT feature or a physical Chinese input method.

The optional `pnpm --dir extension test:youtube-live` verifies that YouTube's public API-demo player loads with a video duration and no player error. It uses a fresh browser profile, simulates PTT, and does not start video playback. CI uses only the offline fixtures.

The optional `pnpm --dir extension test:verb-live -- https://i.verb.tw/IMAGE.jpg` accepts a real image URL on that host and checks both hover and Easy Reading previews. It verifies the app Referer sent by the packaged rule and a successful image response, without test header overrides. PTT is simulated, the browser profile is isolated, and screenshots and a JSON report go to `test-results`. This live check is not run in CI.

The build currently reports three inherited warnings: duplicate font-size translation keys and an unreachable duplicate ANSI parser case. Their existing runtime behavior is preserved.

The combined client retains its GNU GPL v2 license. The media-preview files keep their MIT license, and our independently written files listed in `ATTRIBUTION.md` are additionally available under MIT. These permissions do not make the complete application MIT-only. The prepared folder includes `LICENSE`, attribution, both MIT notices, bundled dependency notices, and the original cursor copyright notice. Source and build instructions are available in the linked public repository.
