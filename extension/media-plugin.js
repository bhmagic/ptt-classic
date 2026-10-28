import React, { useEffect, useRef, useState } from 'preact/compat';
import { MediaPreviewer } from '../src/plugins/media_previewer/MediaPreviewer.js';
import ImagePreviewer, { getCachedImageRequest } from '../src/plugins/media_previewer/ImagePreviewer.js';
import { getActiveLocale } from '../src/js/i18n.js';
import { readValuesWithDefault } from '../src/js/pref.js';
import {
  TRUSTED_IMAGE_DOMAINS, isTrustedImageDomain, resolveImageUrl, registerImageIntersection,
} from '../src/plugins/media_previewer/image_preview_util.js';
import { classifyMediaUrl } from './vendor/ptt-media-preview/src/shared/media.js';
import { resolveAlbum, resolveUnknown } from './vendor/ptt-media-preview/src/shared/imgur.js';
import { getYoutubeEmbedUrl } from './vendor/ptt-media-preview/src/shared/embed.js';

const h = React.createElement;
const metadataCache = new Map();
const IMAGE_SIZE_DEFAULTS = { picPreviewMaxHeight: 80, picPreviewMaxWidth: 90 };

function imageSizePercent(value, fallback) {
  const number = Number(value);
  return value !== null && value !== '' && Number.isFinite(number)
    ? Math.max(10, Math.min(100, Math.round(number))) : fallback;
}

function ImageSizeOptions({ values = {}, handleValueChange }) {
  const chinese = getActiveLocale() === 'zh_tw';
  return h('div', { className: 'ptt-image-size-options' },
    ...[
      ['picPreviewMaxHeight', chinese ? '最大顯示高度' : 'Maximum display height'],
      ['picPreviewMaxWidth', chinese ? '最大顯示寬度' : 'Maximum display width'],
    ].map(([name, label]) => {
      const value = imageSizePercent(values[name], IMAGE_SIZE_DEFAULTS[name]);
      return h('div', { key: name, className: 'ptt-image-size-control' },
        h('label', { htmlFor: name }, label),
        h('output', { htmlFor: name }, `${value}%`),
        h('input', {
          id: name, name, type: 'range', min: 10, max: 100, step: 1, value,
          'aria-valuetext': `${value}%`, 'aria-describedby': 'ptt-image-size-help',
          onInput: event => handleValueChange(name, Number(event.currentTarget.value)),
        }));
    }),
    h('p', { id: 'ptt-image-size-help' }, chinese
      ? '以視窗尺寸的百分比設定，文章內圖片、YouTube 影片與滑鼠圖片預覽共用上限。只縮小超過上限的圖片，保留比例，不放大填滿上限。關閉設定後套用。'
      : 'Percent of the window size, shared by inline images, YouTube videos and hover images. Only oversized images shrink, keeping their proportions; smaller images stay at their natural size. Applied when settings close.'));
}

function SizedHoverImage(props) {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const { value, error, limits } = props;
  if (!value || error) return h(ImagePreviewer.OnHover, props);
  const margin = 8;
  const maxWidth = Math.min(viewport.width * limits.width / 100, viewport.width - margin * 2);
  const maxHeight = Math.min(viewport.height * limits.height / 100, viewport.height - margin * 2);
  const scale = Math.min(1, maxWidth / value.width, maxHeight / value.height);
  const width = value.width * scale;
  const height = value.height * scale;
  const cursorLeft = Number.isFinite(props.left) ? props.left : 20;
  const cursorTop = Number.isFinite(props.top) ? props.top : 20;
  const preferredLeft = cursorLeft + 20 + width > viewport.width - margin
    ? cursorLeft - 20 - width : cursorLeft + 20;
  const left = Math.max(margin, Math.min(viewport.width - margin - width, preferredLeft));
  const top = Math.max(margin, Math.min(viewport.height - margin - height, cursorTop - height / 2));
  return h('div', {
    className: 'image-preview-popup image-preview-loaded ptt-sized-hover', style: { left, top },
  }, h('img', { src: value.src, referrerPolicy: 'no-referrer', style: { width, height } }));
}

function classify(href, whitelistOnly, domains) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (whitelistOnly && !isTrustedImageDomain(url.hostname, domains)) return null;
  const media = classifyMediaUrl(href);
  if (media) return media;
  const source = resolveImageUrl(href, whitelistOnly, domains);
  return source ? { kind: 'image', sources: source } : null;
}

function imageItem(source) {
  return { sources: Array.isArray(source) ? source : [source] };
}

async function resolveItems(media) {
  if (media.kind === 'image') return [imageItem(media.sources)];
  if (media.kind === 'imgur-album') return (await resolveAlbum(media.hash)).map(imageItem);
  if (media.kind === 'imgur-unknown') {
    const { type, link } = await resolveUnknown(media.hash);
    return link && /^(image|video)\//.test(type) ? [imageItem(link)] : [];
  }
  return [];
}

function getItems(media) {
  if (media.kind === 'image') return resolveItems(media);
  const key = `${media.kind}:${media.hash}`;
  if (!metadataCache.has(key)) {
    if (metadataCache.size >= 100) metadataCache.delete(metadataCache.keys().next().value);
    metadataCache.set(key, resolveItems(media).then(items => {
      if (!items.length) metadataCache.delete(key);
      return items;
    }));
  }
  return metadataCache.get(key);
}

async function hoverImage(media) {
  const [item] = await getItems(media);
  if (!item) throw new Error('No image available');
  for (const src of item.sources) {
    try { return await getCachedImageRequest(src); } catch { /* Try the next host format. */ }
  }
  throw new Error('Image preview unavailable');
}

function OpenMedia({ href, children = 'Open media in a new tab' }) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', className: 'ptt-media-fallback' }, children);
}

function InlineImage({ sources, href }) {
  const [index, setIndex] = useState(0);
  if (index >= sources.length) return h(OpenMedia, { href });
  return h('img', {
    // Inline images use their intrinsic size and CSS limits, without terminal scaling.
    src: sources[index], className: 'easyReadingImg', loading: 'lazy',
    referrerPolicy: sources[index].startsWith('https://i.verb.tw/') ? undefined : 'no-referrer',
    onError: () => setIndex(value => value + 1),
  });
}

function InlineVideo({ src, href }) {
  const [failed, setFailed] = useState(false);
  if (failed) return h(OpenMedia, { href });
  return h('video', {
    src, controls: true, loop: true, preload: 'none', className: 'ptt-inline-video',
    onError: () => setFailed(true),
  });
}

function ResolvedInlineMedia({ media, href }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let active = true;
    if (['youtube', 'twitch'].includes(media.kind)) return;
    getItems(media).then(value => { if (active) setItems(value); }, () => { if (active) setItems([]); });
    return () => { active = false; };
  }, [media]);
  if (media.kind === 'youtube') {
    return h('iframe', {
      src: getYoutubeEmbedUrl(media), title: 'YouTube video', loading: 'lazy',
      allowFullScreen: true, className: 'ptt-inline-youtube',
    });
  }
  if (media.kind === 'twitch') return h(OpenMedia, { href }, '在 Twitch 開啟影片');
  if (!items) return h('span', { className: 'ptt-media-loading' }, 'Loading media…');
  if (!items.length) return h(OpenMedia, { href });
  return items.map((item, index) => {
    const first = item.sources[0];
    const video = /^https:\/\/i\.imgur\.com\/.*\.(gif|mp4)(?:[?#]|$)/i.test(first);
    return video
      ? h(InlineVideo, { key: index, src: first.replace(/\.gif(?=[?#]|$)/i, '.mp4'), href: first })
      : h(InlineImage, { key: index, sources: item.sources, href });
  });
}

function InlineMedia({ media, href }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => registerImageIntersection(ref.current, () => setVisible(true)), []);
  return h('div', { ref, className: 'easyReadingImgContainer ptt-inline-media', 'data-media-href': href },
    visible ? h(ResolvedInlineMedia, { media, href }) : null);
}

export class ExtensionMediaPreviewer extends MediaPreviewer {
  static get defaultPrefs() {
    return {
      enableMediaPreviewer: true,
      picPreviewWhitelistOnly: true,
      picPreviewTrustedDomains: [...TRUSTED_IMAGE_DOMAINS],
      picPreviewKnownDefaults: [...TRUSTED_IMAGE_DOMAINS],
      ...IMAGE_SIZE_DEFAULTS,
    };
  }

  static renderOptions(props) {
    return h(React.Fragment, null, h(ImageSizeOptions, props), super.renderOptions(props));
  }

  _applyImageLimits(prefs) {
    this.imageLimits = {
      width: imageSizePercent(prefs.picPreviewMaxWidth, IMAGE_SIZE_DEFAULTS.picPreviewMaxWidth),
      height: imageSizePercent(prefs.picPreviewMaxHeight, IMAGE_SIZE_DEFAULTS.picPreviewMaxHeight),
    };
    // CSS updates already mounted inline images without rebuilding the article.
    document.documentElement.style.setProperty('--ptt-image-max-width', `${this.imageLimits.width}vw`);
    document.documentElement.style.setProperty('--ptt-image-max-height', `${this.imageLimits.height}vh`);
  }

  syncFromPrefs() {
    super.syncFromPrefs();
    this._applyImageLimits(this.app?.prefValues ?? readValuesWithDefault());
  }

  onInit() {
    super.onInit();
    this.listenApp('term:pref-change', event => {
      const key = event?.key ?? event?.detail?.key;
      if (!Object.hasOwn(IMAGE_SIZE_DEFAULTS, key)) return;
      const value = event?.value ?? event?.detail?.value;
      this._applyImageLimits({ ...this.app.prefValues, [key]: value });
      if (this.enabled) this.view?.redraw?.(true);
    });
  }

  _updateViewHooks(enabled) {
    super._updateViewHooks(enabled);
    if (enabled && this.view) {
      this.view.renderHyperlinkPreview = props => props.request
        ? h(ImagePreviewer, { ...props, limits: this.imageLimits, component: SizedHoverImage }) : null;
    }
  }

  resolveImageUrl(href, whitelistOnly = this.whitelistOnly, domains = this.trustedDomains) {
    if (!this.enabled) return null;
    const media = classify(href, whitelistOnly, domains);
    if (!media || ['youtube', 'twitch'].includes(media.kind)) return null;
    return hoverImage(media);
  }

  _createInlinePreview(href, key) {
    if (!this.enabled) return null;
    const media = classify(href, this.whitelistOnly, this.trustedDomains);
    return media ? h(InlineMedia, { key: key ?? href, href, media }) : null;
  }
}
