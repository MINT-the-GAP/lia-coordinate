import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAsync, transformAsync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import browserslist from 'browserslist';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const productionTargets = packageJson.browserslist?.production;
assert.ok(Array.isArray(productionTargets) && productionTargets.length > 0,
  'A production Browserslist matrix is required');

const resolved = browserslist(productionTargets);
const numericVersion = value => Number.parseFloat(String(value).match(/\d+(?:\.\d+)?/)?.[0] || 'NaN');
const versionsFor = family => resolved
  .filter(entry => entry.startsWith(family + ' '))
  .map(entry => numericVersion(entry.slice(family.length + 1)))
  .filter(Number.isFinite);
const minimumFor = family => Math.min(...versionsFor(family));

const requiredMinima = {
  chrome: 96,
  edge: 96,
  firefox: 94,
  safari: 15.2,
  ios_saf: 15.2
};
for (const [family, expected] of Object.entries(requiredMinima)) {
  const actual = minimumFor(family);
  assert.ok(Number.isFinite(actual), `Missing Browserslist family: ${family}`);
  assert.ok(actual <= expected,
    `${family} starts at ${actual}, but the five-year boundary requires ${expected}`);
}
assert.ok(versionsFor('and_chr').length > 0, 'Android Chrome target is missing');
assert.ok(versionsFor('and_ff').length > 0, 'Android Firefox target is missing');

const bundle = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
assert.ok(bundle.length > 100_000, 'The production bundle is unexpectedly small');
await parseAsync(bundle, {
  babelrc: false,
  configFile: false,
  sourceType: 'unambiguous'
});

const modernSyntaxProbe = `
  class CompatibilityProbe {
    static count = 0;
    static { this.count += 1; }
    value = { nested: { ok: true } };
    read() { return this.value?.nested?.ok ?? false; }
  }
  globalThis.__compatibilityProbe = new CompatibilityProbe().read();
`;
const transformed = await transformAsync(modernSyntaxProbe, {
  babelrc: false,
  configFile: false,
  comments: false,
  compact: true,
  sourceType: 'script',
  presets: [[presetEnv, {
    targets: productionTargets,
    bugfixes: true,
    modules: false
  }]]
});
assert.ok(transformed?.code, 'Babel did not emit the compatibility probe');
assert.ok(!transformed.code.includes('static {'),
  'Babel left class static blocks untransformed for the five-year Safari boundary');

const summary = {
  query: productionTargets,
  resolvedBrowserVersions: resolved.length,
  minimums: Object.fromEntries(Object.keys(requiredMinima).map(family => [family, minimumFor(family)])),
  android: {
    chrome: resolved.find(entry => entry.startsWith('and_chr ')),
    firefox: resolved.find(entry => entry.startsWith('and_ff '))
  },
  bundleBytes: Buffer.byteLength(bundle),
  babelProbeBytes: Buffer.byteLength(transformed.code)
};
console.log('COMPATIBILITY_TARGETS_OK ' + JSON.stringify(summary));
