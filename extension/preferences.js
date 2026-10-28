const PREF_KEY = 'pttchrome.pref.v1';
export const CLASSIC_BACKUP_KEY = 'pttclassic.preferences.before-0.2.0';
export const MIGRATION_KEY = 'pttclassic.preferences.migrated-0.2.0';
export const FIXED_PREFERENCES = {
  mouseLeftFunction: 'none',
  mouseMiddleFunction: 'none',
  mouseWheelAction: 'none',
  mouseWheelRightAction: 'none',
  mouseWheelLeftAction: 'none',
  mouseWheelTrackpadMode: false,
  mouseWheelChangePost: false,
  enableBackNavigation: false,
  copyOnSelect: false,
  supportMouseReporting: false,
  enableVirtualKeyboard: false,
  enablePwaPrompt: false,
  enableLoginAssist: false,
  enableMouseBrowsing: false,
  enableLiveUpdate: false,
  enableFpsMeter: false,
  enablePacketDump: false,
  enableTouchDebugHUD: false,
};

export function applyExtensionPreferences(storage) {
  try {
    const raw = storage.getItem(PREF_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const values = { ...data.values, ...FIXED_PREFERENCES };
    // Remove old wheel aliases so upstream cannot remigrate them over "none".
    for (const key of ['mouseWheelFunction1', 'mouseWheelFunction2', 'mouseWheelFunction3', 'useMouseBrowsing', 'enableAutoLogin']) delete values[key];
    storage.setItem(PREF_KEY, JSON.stringify({ ...data, values }));
  } catch {
    // Upstream falls back to the fixed defaults if storage is unavailable.
  }
}

export function migrateClassicPreferences(storage) {
  try {
    if (storage.getItem(MIGRATION_KEY)) return;
    const raw = storage.getItem(PREF_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.values && typeof data.values === 'object' && !Array.isArray(data.values)) {
        // Preserve the exact original settings for a manual rollback.
        if (!storage.getItem(CLASSIC_BACKUP_KEY)) storage.setItem(CLASSIC_BACKUP_KEY, raw);
        const values = { ...data.values };
        if (values.termMargin === undefined && values.bbsMargin !== undefined) {
          values.termMargin = values.bbsMargin;
        }
        if (values.enableMediaPreviewer === undefined && values.enablePicPreview !== undefined) {
          values.enableMediaPreviewer = Boolean(values.enablePicPreview);
        }
        // Upstream otherwise resets a previously explicit anti-idle choice.
        if (typeof values.enableAntiIdle === 'boolean') {
          storage.setItem('pttchrome.pref.anti_idle_reset.v1', '1');
        }
        storage.setItem(PREF_KEY, JSON.stringify({ ...data, values }));
      }
    }
    storage.setItem(MIGRATION_KEY, '1');
  } catch {
    // Invalid or unavailable storage must not prevent connecting to PTT.
  }
}
