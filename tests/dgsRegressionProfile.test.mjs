import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  }
});

const {
  buildImplicitRegressionDgsSpec,
  resolveRegressionDgsController
} = await import('../src/shared/dgsRegressionProfile.ts');

test('implicit Regression and Reconstruction use only the three regression tool ids', () => {
  assert.equal(
    buildImplicitRegressionDgsSpec('board-a'),
    'board-a;tools=[910;920;930]'
  );

  assert.deepEqual(
    resolveRegressionDgsController('board-a', 'regression-board-a', 'de'),
    {
      uid: 'regression-board-a',
      spec: 'board-a;tools=[910;920;930]',
      language: 'de',
      explicit: false
    }
  );
});

test('an explicit DGS keeps its complete tools and restrictions profile', () => {
  const explicit = {
    uid: 'authored-dgs',
    spec: 'board-a;tools=[200;510];restrictions=[200;300;400]',
    language: 'en'
  };

  assert.deepEqual(
    resolveRegressionDgsController('board-a', 'implicit-dgs', 'de', explicit),
    {
      ...explicit,
      explicit: true
    }
  );
});

test('an explicit DGS without a language inherits the requesting language', () => {
  assert.equal(
    resolveRegressionDgsController(
      'board-a',
      'implicit-dgs',
      'de',
      { uid: 'authored-dgs', spec: 'board-a;restrictions=[400]' }
    ).language,
    'de'
  );
});

test('unavailable flyout tools stay hidden after submenus move into the menu clip', () => {
  const source = readFileSync(
    new URL('../src/subsystems/dgs.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /flyoutSubmenus\.forEach\(\(submenu\) => menuClip\.appendChild\(submenu\)\);/
  );
  assert.match(
    source,
    /\.lia-dgs-menu-clip \[hidden\]\s*\{\s*display:\s*none !important;/
  );
  assert.match(source, /button\.hidden = !enabled;\s*button\.disabled = !enabled;/);
});
