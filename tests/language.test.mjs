import assert from 'node:assert/strict';
import test from 'node:test';
import { onCourseLanguageChange, resolveUiLanguage } from '../src/shared/language.ts';

function fixture(run) {
  const saved = Object.fromEntries(['window', 'document'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const root = { lang: '' };
  const parent = { document: { documentElement: { lang: '' } } };
  globalThis.document = { documentElement: root };
  globalThis.window = { parent };
  const ancestor = { getAttribute: () => ancestor.language, language: '' };
  const marker = { dataset: {}, closest: () => ancestor };
  try { run({ root, parent, ancestor, marker }); }
  finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('course metadata wins over the host document and supports regional codes', () => fixture(({ root, marker }) => {
  root.lang = 'de';
  marker.dataset.language = ' EN-gb ';
  assert.equal(resolveUiLanguage(marker), 'en');
  assert.equal(resolveUiLanguage(marker, 'de-AT'), 'de');
  marker.dataset.language = 'de-CH';
  assert.equal(resolveUiLanguage(marker, 'en-US'), 'en');
}));

test('legacy markers inherit the nearest language, then document and parent', () => fixture(({ root, parent, ancestor, marker }) => {
  ancestor.language = 'de'; root.lang = 'en';
  assert.equal(resolveUiLanguage(marker), 'de');
  ancestor.language = '';
  assert.equal(resolveUiLanguage(marker), 'en');
  root.lang = ''; parent.document.documentElement.lang = 'de-DE';
  assert.equal(resolveUiLanguage(marker), 'de');
}));

test('unexpanded and unsupported language values fall through to supported context', () => fixture(({ root, marker }) => {
  root.lang = 'de'; marker.dataset.language = '@language';
  assert.equal(resolveUiLanguage(marker), 'de');
  marker.dataset.language = 'fr';
  assert.equal(resolveUiLanguage(marker, 'invalid'), 'de');
}));

test('missing language or an inaccessible parent safely falls back to English', () => fixture(() => {
  assert.equal(resolveUiLanguage(null), 'en');
  Object.defineProperty(window, 'parent', { get() { throw new Error('cross-origin'); } });
  assert.equal(resolveUiLanguage(null), 'en');
  assert.equal(resolveUiLanguage(null, 'de'), 'de');
}));


test('course language changes share one document observer and notify each subsystem once', () => fixture(({ root }) => {
  const original = globalThis.MutationObserver;
  const observers = [];
  try {
    globalThis.MutationObserver = class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
    };
    let points = 0, plots = 0;
    const pointListener = () => { points++; };
    onCourseLanguageChange(pointListener);
    onCourseLanguageChange(pointListener);
    onCourseLanguageChange(() => { plots++; });
    assert.equal(observers.length, 1);
    assert.equal(observers[0].target, root);
    assert.deepEqual(observers[0].options, { attributes: true, attributeFilter: ['lang'] });
    observers[0].callback([{ type: 'attributes', attributeName: 'lang' }]);
    assert.equal(points, 1);
    assert.equal(plots, 1);
  } finally {
    if (original === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = original;
  }
}));
