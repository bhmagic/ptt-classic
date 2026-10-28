# Source origins, changes, and licenses

PTT Classic preserves upstream authorship, notices, and Git history. The combined application is distributed under GNU GPL v2. The additional MIT permissions described below apply only to the listed independent integration files and the separately licensed media helpers.

## Current terminal core

Version 0.2.0 uses [ptt/ptt-term 3.0.3 at ba7c00d5edff1654bf3cc89994b9dd2d23a072fe](https://github.com/ptt/ptt-term/tree/ba7c00d5edff1654bf3cc89994b9dd2d23a072fe), the production branch fetched on October 28, 2026. The source under `src/` matches that revision. The upstream GPL v2 `LICENSE` is retained unchanged. The [current upstream README](docs/PTT-TERM-UPSTREAM-README.md) records its features, contributors, and project history.

Upstream credits the PttChrome work by Chuck Yang (iamchucky), Robert Wang (robertabcd), Wei-Cheng Yeh (IepIweidieng), Li-Shin Ho (holishing), Hung-Te Lin (hungte), and the other contributors recorded in its Git history. This adaptation claims no authorship of their terminal engine, renderers, Big5/Unicode handling, input system, settings, themes, or plugin framework.

The production history is merged into this repository so its commit ancestry and author credits remain intact. The extension build supplies the PTT site profile and local app identity. Build-time adaptations externalize the upstream inline compatibility script, bundle cursor assets, and replace only the Mouse settings panel with `extension/MouseSettings.js`. The website's PWA manifest/service worker and deployment jobs are not used by this extension. The terminal source itself is not patched for these adaptations.

## Preserved classic version

The original 0.1.1 app is preserved at [release v0.1.1](https://github.com/bhmagic/ptt-classic/releases/tag/v0.1.1), commit `65083e5`, and branch `archive/classic-0.1.1`, with a ready-to-load rollback ZIP. Its core was based on [315fbbd4a901ac9e8ce487dddf901b84ed788fcc](https://github.com/ptt/ptt-term/tree/315fbbd4a901ac9e8ce487dddf901b84ed788fcc), September 3, 2026, before the Canvas rewrite. The [older upstream README](docs/UPSTREAM-README.md) remains available.

The initial extension was developed in [bhmagic/ptt-term at 97ac6f1ae54f1b33e23df548943e761608a40226](https://github.com/bhmagic/ptt-term/commit/97ac6f1ae54f1b33e23df548943e761608a40226). The archive's attribution records its old Screen.js preview suppression, CSS correction, and Webpack flag. Those legacy patches are superseded by the current upstream source.

## Media helpers

The vendored source is [mingc00/ptt-media-preview 6.2.1 at 5c2ebefc106f6c8aa3245eb2093c04cb63ebd8e4](https://github.com/mingc00/ptt-media-preview/tree/5c2ebefc106f6c8aa3245eb2093c04cb63ebd8e4), MIT, copyright (c) 2021 Mingc. Its [license](extension/vendor/ptt-media-preview/LICENSE) and [provenance record](extension/vendor/ptt-media-preview/UPSTREAM.json) are retained.

Version 0.2.0 bundles its shared `media.js`, `imgur.js`, and `embed.js` helpers through `extension/media-plugin.js`, a native ptt-term media plugin adapter. The URL classifier, API resolvers, and public Imgur client IDs originate from Mingc's project. Its older DOM observer and element/previewer helpers remain in the vendored source but are not bundled into this version. The historical Twitch external-link adaptation is recorded in the provenance file; the new adapter preserves that behavior.

The adapter handles hover and lazy inline rendering for both upstream renderers, uses the new plugin lifecycle, preserves album and meee fallback behavior, and provides external links for failed inline media. Version 0.2.1 adds shared maximum-height and maximum-width sliders for inline and hover images. Version 0.2.2 removes inherited terminal scaling from inline images so natural image dimensions remain the upper bound, and centers YouTube players within the same size limits. Version 0.2.3 removes the fixed YouTube width cap. Version 0.2.4 gives YouTube an independent pixel-width slider while retaining centering and 16:9 proportions. Version 0.2.5 bases image percentages on rendered text dimensions and positions hover previews outside terminal transforms. Extension CSS removes the default white image padding/background and popup border. Extension-scoped request rules preserve the PTT connection, Imgur, YouTube, and i.verb.tw fixes from 0.1.1.

## Independently written additions

Version 0.2.6 corrects the extension adapter's Imgur GIF handling: GIF URLs remain images instead of being rewritten to MP4 players. The vendored upstream helpers are unchanged.

The following integration files are additionally available under [MIT](LICENSES/MIT-PTT-Classic.txt):

- `extension/background.js`, `extension/build.mjs`, `extension/client.js`, `extension/configure.js`, `extension/preferences.js`, `extension/media-plugin.js`, `extension/media.css`, and `extension/MouseSettings.js`.
- `extension/manifest.json`, `extension/package.json`, and `extension/upstream.json`.
- The scripts and tests under `extension/test/`.
- `.github/workflows/extension.yml` and `.gitattributes`.
- Project documentation `README.md`, `ATTRIBUTION.md`, and `extension/README.md`.

This additional permission does not cover `src/`, the upstream build files and tests, inherited assets, archived upstream README files, third-party source, or the generated combined application. The upstream GPL terms continue to apply to inherited code and any derived bundled code. The media source's MIT permission comes from its author.

## Distribution

The complete application is distributed as GNU GPL v2. Combining the terminal with MIT components does not make the terminal or combined application MIT-only.

Builds include the GPL text, this attribution, the MIT grant for listed integration files, the media license and provenance, the cursor copyright notice, dependency notices, and the pinned terminal revision. Corresponding source and build instructions are maintained in [bhmagic/ptt-classic](https://github.com/bhmagic/ptt-classic). Distributors should retain these notices and make the matching source available.
