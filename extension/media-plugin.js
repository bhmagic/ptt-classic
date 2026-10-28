import React, { useEffect, useRef, useState } from 'preact/compat';
import { MediaPreviewer } from '../src/plugins/media_previewer/MediaPreviewer.js';
import { getCachedImageRequest } from '../src/plugins/media_previewer/ImagePreviewer.js';
import {
  TRUSTED_IMAGE_DOMAINS, isTrustedImageDomain, resolveImageUrl, registerImageIntersection,
} from '../src/plugins/media_previewer/image_preview_util.js';
import { classifyMediaUrl } from './vendor/ptt-media-preview/src/shared/media.js';
import { resolveAlbum, resolveUnknown } from './vendor/ptt-media-preview/src/shared/imgur.js';
import { getYoutubeEmbedUrl } from './vendor/ptt-media-preview/src/shared/embed.js';

const h = React.createElement;
const metadataCache = new Map();

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
    src: sources[index], className: 'easyReadingImg hyperLinkPreview', loading: 'lazy',
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
    };
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
