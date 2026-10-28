import { BUILTIN_PLUGINS } from '../src/plugins/index.js';
import { DEFAULT_PREFS, registerPluginPrefs } from '../src/js/pref.js';
import { TRUSTED_IMAGE_DOMAINS } from '../src/plugins/media_previewer/image_preview_util.js';
import { ExtensionMediaPreviewer } from './media-plugin.js';
import { migrateClassicPreferences, applyExtensionPreferences, FIXED_PREFERENCES } from './preferences.js';

// Keep the upstream terminal untouched; replace only its media plugin adapter.
for (const domain of ['i.verb.tw', 'youtube.com', 'youtu.be', 'clips.twitch.tv']) {
  if (!TRUSTED_IMAGE_DOMAINS.includes(domain)) TRUSTED_IMAGE_DOMAINS.push(domain);
}
const mediaIndex = BUILTIN_PLUGINS.findIndex(plugin => plugin.id === 'media_previewer');
BUILTIN_PLUGINS.splice(mediaIndex, 1, ExtensionMediaPreviewer);
const removedPlugins = new Set([
  'virtual_keyboard', 'pwa_prompt', 'login_assist', 'mouse_browsing',
  'live_update', 'fps_meter', 'touch_debug_hud', 'packet_dump',
]);
for (let index = BUILTIN_PLUGINS.length - 1; index >= 0; index--) {
  if (removedPlugins.has(BUILTIN_PLUGINS[index].id)) BUILTIN_PLUGINS.splice(index, 1);
}
registerPluginPrefs([ExtensionMediaPreviewer]);
Object.assign(DEFAULT_PREFS, { mouseWheelAction: 'none' }, FIXED_PREFERENCES);
try {
  migrateClassicPreferences(window.localStorage);
  applyExtensionPreferences(window.localStorage);
} catch {
  // The terminal still starts with defaults when local storage is disabled.
}
