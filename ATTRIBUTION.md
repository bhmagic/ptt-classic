# Source origins, changes, and licenses

PTT Classic preserves the work and attribution of its upstream contributors. This document describes the sources used for the initial extension and the changes made on September 14, 2026.

## Terminal lineage

The baseline is [ptt/ptt-term at `315fbbd4a901ac9e8ce487dddf901b84ed788fcc`](https://github.com/ptt/ptt-term/tree/315fbbd4a901ac9e8ce487dddf901b84ed788fcc), committed September 3, 2026. Its [LICENSE](https://github.com/ptt/ptt-term/blob/315fbbd4a901ac9e8ce487dddf901b84ed788fcc/LICENSE) is GNU GPL v2; a copy is retained unchanged at the repository root.

Upstream credits [robertabcd/PttChrome](https://github.com/robertabcd/PttChrome), [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome), and patches from [ccns/PttChrome](https://github.com/ccns/PttChrome). See [the archived upstream README](docs/UPSTREAM-README.md). The repository retains the inherited Git history rather than replacing the authorship record with a new initial commit. Existing copyright notices remain in their files.

The classic terminal implementation and its assets are inherited, including ANSI processing, Big5 conversion, terminal rendering, keyboard handling, selection, settings, translations, and the original media support. No authorship of that implementation is claimed by this adaptation.

The initial extension implementation is recorded in [`97ac6f1ae54f1b33e23df548943e761608a40226`](https://github.com/bhmagic/ptt-term/commit/97ac6f1ae54f1b33e23df548943e761608a40226), first developed in the earlier GitHub fork.

## Changes to inherited files

These files remain under the upstream GPL terms:

| File | Local change |
| --- | --- |
| `src/components/Screen.js` | Suppress the native hover image loader when the integrated media-preview build flag is enabled. |
| `src/css/main.css` | Convert an invalid JavaScript-style CSS comment into valid CSS comment syntax. |
| `webpack.config.js` | Set the media-preview flag to false for the inherited web build. |
| `.gitignore` | Exclude local test results and dependency/browser caches. |

The root README now introduces PTT Classic. The original upstream README is preserved separately in `docs/UPSTREAM-README.md`; it describes upstream's website and contribution process, not this extension's deployment. The legacy web build files remain for historical context. Upstream website deployment workflows have been removed from the active workflow directory because this project distributes an extension.

## Media previews

The included source is from [mingc00/ptt-media-preview at `5c2ebefc106f6c8aa3245eb2093c04cb63ebd8e4`](https://github.com/mingc00/ptt-media-preview/tree/5c2ebefc106f6c8aa3245eb2093c04cb63ebd8e4), version 6.2.1. Its license is MIT, copyright (c) 2021 Mingc.

The vendored files are `extension/vendor/ptt-media-preview/src/term.js` and the shared modules `elements.js`, `embed.js`, `imgur.js`, `media.js`, and `previewer.js`. The author's complete [MIT notice](extension/vendor/ptt-media-preview/LICENSE) and [provenance record](extension/vendor/ptt-media-preview/UPSTREAM.json) are retained.

The local change to `term.js` opens Twitch clips in a new tab when running on a `chrome-extension:` page, because Twitch's frame policy excludes that origin scheme. The original website embedding path is retained. The add-on's hover and inline rendering code, Imgur resolution logic, and public Imgur API client IDs come from upstream. The integration bundles these modules into the terminal tab and recreates the needed header rules with this extension's initiator scope; it does not include a second extension.

## Independently written additions

The following files were written for PTT Classic and are additionally available under [MIT](LICENSES/MIT-PTT-Classic.txt):

- `extension/background.js`, `extension/build.mjs`, `extension/client.js`, and `extension/globals.js`.
- `extension/manifest.json` and `extension/package.json` (the package's license field describes the combined application).
- `extension/test/browser.mjs`, `extension/test/media.mjs`, `extension/test/package.test.mjs`, and `extension/test/youtube-live.mjs`.
- `.github/workflows/extension.yml`.
- The PTT Classic project documentation: `README.md`, `ATTRIBUTION.md`, and `extension/README.md`.

This permission does not extend to `src/`, inherited build files or assets, `docs/UPSTREAM-README.md`, vendored third-party source, dependency code, or the generated combined application. The MIT grant for the media-preview source comes from its own author and license file.

## Distribution

The complete application contains GPL-covered terminal code and is distributed as a whole under GNU GPL v2. Combining MIT components with GPL code does not make the GPL portions MIT-licensed; see the [GNU license compatibility FAQ](https://www.gnu.org/licenses/gpl-faq.html.en#WhatDoesCompatMean). An MIT-only release of the inherited terminal would require an appropriate grant from its copyright holders, which this project has not obtained.

The extension build includes the GPL text, this attribution document, the MIT notice for our listed additions, the media-preview license and provenance, the inherited cursor copyright notice, and notices collected from bundled dependencies. Existing notices for individual assets and libraries continue to apply. The full source and build scripts are maintained in [bhmagic/ptt-classic](https://github.com/bhmagic/ptt-classic); distributors of modified packages should make the matching source available as well.
