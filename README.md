# PTT Classic

The classic PTT terminal interface in a Chrome tab, with media previews built in. Load the extension from a folder, bookmark its tab, and connect directly to PTT. No local web server, cloud relay, or separate desktop app is required.

This is an independent community project maintained by [bhmagic](https://github.com/bhmagic). It preserves the classic client from [ptt/ptt-term](https://github.com/ptt/ptt-term) at commit [`315fbbd`](https://github.com/ptt/ptt-term/commit/315fbbd4a901ac9e8ce487dddf901b84ed788fcc), dated September 3, 2026, before the Canvas interface rewrite. It is not an official PTT release and does not operate `term.ptt.cc`.

## Install

1. Download `ptt-classic-0.1.0.zip` from the [release page](https://github.com/bhmagic/ptt-classic/releases/latest) and extract it. You can also build from source below or download the `ptt-classic` artifact from a successful [extension build](https://github.com/bhmagic/ptt-classic/actions/workflows/extension.yml). GitHub's automatic **Source code** ZIP contains source code; it is not a ready-to-load extension.
2. Keep the extracted folder somewhere permanent. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing the generated `manifest.json`. A local build puts this folder at `dist/ptt-classic`.
4. Click **PTT Classic** in Chrome's extensions menu to open a terminal tab. Press **Ctrl+D** to bookmark it.

The bookmark is `chrome-extension://gpephnjkgejlfddpjkgkeiffflnnkekg/index.html`. The extension's fixed public key preserves that address across rebuilds. Existing installations of this project's initial build use the same ID and preferences.

Right-click inside the terminal and choose **設定** to adjust the classic interface. Enable Picture Preview for floating image previews, or **啟用文章好讀模式** for inline media. See the [installation, permissions, and troubleshooting guide](extension/README.md) for details.

## Where the code comes from

The terminal engine, ANSI rendering, Big5 support, keyboard handling, settings, and classic interface come from the PttChrome / ptt-term contributors. This project packages and adapts their work; it is not a newly written terminal engine.

As documented by upstream, [ptt/ptt-term](https://github.com/ptt/ptt-term) derives from [robertabcd/PttChrome](https://github.com/robertabcd/PttChrome), originally forked from [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome), and incorporates patches from [ccns/PttChrome](https://github.com/ccns/PttChrome). The inherited Git history and its author credits are retained. The [archived upstream README](docs/UPSTREAM-README.md) preserves the original project description.

Media previews come from [mingc00/ptt-media-preview](https://github.com/mingc00/ptt-media-preview), version 6.2.1 at commit [`5c2ebef`](https://github.com/mingc00/ptt-media-preview/commit/5c2ebefc106f6c8aa3245eb2093c04cb63ebd8e4), by Mingc. Its relevant terminal and shared modules are bundled locally, with the original MIT license and a record of local adaptations.

## What we changed

- Packaged the classic client as a Chrome Manifest V3 extension that opens in a normal browser tab, with a stable bookmark and local preferences.
- Added a separate, pinned esbuild/pnpm build that bundles executable code, styles, fonts, and character conversion tables into one installable folder.
- Kept terminal traffic on a direct WebSocket connection from Chrome to PTT. A rule scoped to this extension and PTT's exact endpoint supplies the connection's Origin header. The toolbar worker only opens the tab.
- Embedded the media-preview add-on for floating images, Imgur albums, animated media, and inline YouTube players. Disabled the original hover loader in this build to avoid duplicate requests.
- Scoped Imgur and YouTube request-header rules to this extension. Twitch clips open in another tab because Twitch's embedding policy excludes extension pages.
- Added package checks, isolated browser tests, optional live connection checks, and GitHub Actions that build a downloadable extension artifact.

The first adaptation was developed in [bhmagic/ptt-term](https://github.com/bhmagic/ptt-term/commit/97ac6f1ae54f1b33e23df548943e761608a40226) before being prepared as this standalone repository. [ATTRIBUTION.md](ATTRIBUTION.md) records the exact upstream revisions, modified files, and license boundaries.

## Connection and privacy

Chrome connects directly to `wss://ws.ptt.cc/bbs`; terminal text does not pass through a server operated by this project or GitHub. Media loads directly from the relevant image or video provider. All executable code is included in the installed folder. Clipboard permissions support the classic copy/paste commands, and preferences stay in the extension's local storage.

This package targets PTT1. PTT2 and custom server URLs are not included. PTT connection policies and media-provider APIs can change independently of this project.

## Build and test

Use Node.js 22 or newer and pnpm 11.19.0. From the repository root:

```sh
pnpm --dir extension install --frozen-lockfile --ignore-scripts
pnpm --dir extension build
pnpm --dir extension test
pnpm --dir extension exec playwright install chromium
pnpm --dir extension test:browser
```

The output is `dist/ptt-classic`. Only contributors building from source need Node.js and pnpm; running the prepared extension requires Chrome.

The browser tests simulate terminal and media traffic in an isolated profile. They cover Chinese character conversion, keyboard input, settings persistence, resizing, clipboard command paths, media previews, and request-rule scope. Optional live checks reach the PTT login screen without logging in, or load YouTube's public demo player without starting playback. See [extension/README.md](extension/README.md) for commands and limitations. CI runs the simulated checks only.

For updates, log out, rebuild or replace the installed folder, click **Reload** on the extension card, and refresh the terminal tab. The fixed extension key should stay unchanged so existing bookmarks continue to work.

## License and contributions

**The combined PTT Classic application is distributed under GNU GPL v2**, retaining the terminal's [original license](LICENSE). It cannot be offered as MIT-only under the upstream permissions we received.

The embedded media-preview files keep Mingc's [MIT license](extension/vendor/ptt-media-preview/LICENSE). Our independently written extension integration, build tools, tests, and project documentation listed in [ATTRIBUTION.md](ATTRIBUTION.md) are also available under [MIT](LICENSES/MIT-PTT-Classic.txt). That additional permission applies only to those files; it does not relicense the inherited terminal or the combined application. Other dependency and asset notices remain applicable and are included in generated builds.

Contributions should preserve existing notices and use the license assigned to the affected files. Open issues and pull requests in [bhmagic/ptt-classic](https://github.com/bhmagic/ptt-classic). When sharing a modified build, provide its corresponding source, build instructions, and required license notices.
