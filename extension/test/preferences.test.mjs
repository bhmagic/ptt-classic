import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateClassicPreferences, applyExtensionPreferences, CLASSIC_BACKUP_KEY, MIGRATION_KEY, FIXED_PREFERENCES } from '../preferences.js';

function storage(values) {
  const map = new Map(Object.entries(values));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}

test('classic preferences migrate once while preserving the original rollback copy', () => {
  const original = JSON.stringify({ values: { fontFace: 'monospace', bbsMargin: 12, enablePicPreview: false, enableAntiIdle: false } });
  const local = storage({ 'pttchrome.pref.v1': original });
  migrateClassicPreferences(local);
  const values = JSON.parse(local.getItem('pttchrome.pref.v1')).values;
  assert.equal(values.termMargin, 12);
  assert.equal(values.enableMediaPreviewer, false);
  assert.equal(values.fontFace, 'monospace');
  assert.equal(local.getItem(CLASSIC_BACKUP_KEY), original);
  assert.equal(local.getItem('pttchrome.pref.anti_idle_reset.v1'), '1');
  values.termMargin = 18;
  local.setItem('pttchrome.pref.v1', JSON.stringify({ values }));
  migrateClassicPreferences(local);
  assert.equal(JSON.parse(local.getItem('pttchrome.pref.v1')).values.termMargin, 18);
  assert.equal(local.getItem(CLASSIC_BACKUP_KEY), original);
});

test('modern settings take priority and corrupt or unavailable storage never blocks startup', () => {
  const local = storage({ 'pttchrome.pref.v1': JSON.stringify({ values: { bbsMargin: 12, termMargin: 7, enablePicPreview: false, enableMediaPreviewer: true } }) });
  migrateClassicPreferences(local);
  const values = JSON.parse(local.getItem('pttchrome.pref.v1')).values;
  assert.equal(values.termMargin, 7);
  assert.equal(values.enableMediaPreviewer, true);
  const corrupt = storage({ 'pttchrome.pref.v1': 'broken' });
  migrateClassicPreferences(corrupt);
  assert.equal(corrupt.getItem('pttchrome.pref.v1'), 'broken');
  assert.equal(corrupt.getItem(MIGRATION_KEY), null);
  assert.doesNotThrow(() => migrateClassicPreferences({ getItem() { throw new Error('Unavailable'); } }));
});

test('removed mouse actions and plugins cannot survive old preferences while copy trimming stays editable', () => {
  const local = storage({ 'pttchrome.pref.v1': JSON.stringify({ values: {
    mouseLeftFunction: 'enter', mouseMiddleFunction: 'paste', mouseWheelFunction1: 1,
    mouseWheelRightAction: 'page', enableLiveUpdate: true, enableAutoLogin: true,
    trimTrailingSpaces: false, rightClickAction: 'menu',
  } }) });
  migrateClassicPreferences(local);
  applyExtensionPreferences(local);
  const values = JSON.parse(local.getItem('pttchrome.pref.v1')).values;
  for (const [key, value] of Object.entries(FIXED_PREFERENCES)) assert.equal(values[key], value, key);
  assert.equal(values.mouseWheelAction, 'none');
  assert.equal(values.mouseWheelFunction1, undefined);
  assert.equal(values.enableAutoLogin, undefined);
  assert.equal(values.trimTrailingSpaces, false);
  assert.equal(values.rightClickAction, 'menu');
});

test('the regular wheel choice survives startup while wheel-click combinations stay disabled', () => {
  const local = storage({ 'pttchrome.pref.v1': JSON.stringify({ values: {
    mouseWheelAction: 'arrow-3', mouseWheelFunction1: 0,
    mouseWheelRightAction: 'page', mouseWheelLeftAction: 'arrow-5',
    mouseWheelFunction2: 1, mouseWheelFunction3: 1,
  } }) });
  for (const action of ['arrow-3', 'page', 'none']) {
    const data = JSON.parse(local.getItem('pttchrome.pref.v1'));
    data.values.mouseWheelAction = action;
    local.setItem('pttchrome.pref.v1', JSON.stringify(data));
    applyExtensionPreferences(local);
    const values = JSON.parse(local.getItem('pttchrome.pref.v1')).values;
    assert.equal(values.mouseWheelAction, action);
    assert.equal(values.mouseWheelRightAction, 'none');
    assert.equal(values.mouseWheelLeftAction, 'none');
    for (const key of ['mouseWheelFunction1', 'mouseWheelFunction2', 'mouseWheelFunction3']) {
      assert.equal(values[key], undefined);
    }
  }
});
