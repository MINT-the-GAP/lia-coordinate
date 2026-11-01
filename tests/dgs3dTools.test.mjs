import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(/^\.\.?\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const {
  DGS_3D_ADVANCED_TOOLS, DGS_3D_ADVANCED_GROUPS,
  isDgs3DAdvancedToolAvailable, dgs3DAdvancedToolLabel, dgs3DAdvancedToolIcon,
  showDgs3DAdvancedToolsLocally
} = await import('../src/shared/dgs3dTools.ts');

test('advanced 3D authoring UI is visible only on local runtimes', () => {
  for (const location of [
    { protocol: 'http:', hostname: 'localhost' },
    { protocol: 'https:', hostname: 'preview.localhost' },
    { protocol: 'http:', hostname: '127.0.0.1' },
    { protocol: 'http:', hostname: '[::1]' },
    { protocol: 'file:', hostname: '' }
  ]) assert.equal(showDgs3DAdvancedToolsLocally(location), true, JSON.stringify(location));

  for (const location of [
    { protocol: 'https:', hostname: 'example.org' },
    { protocol: 'https:', hostname: 'liascript.github.io' },
    { protocol: 'https:', hostname: 'localhost.example.org' },
    null,
    undefined
  ]) assert.equal(showDgs3DAdvancedToolsLocally(location), false, JSON.stringify(location));
});

test('advanced 3D export identifiers preserve the serialized tool contract', () => {
  const keys = [
    'vector-add', 'vector-subtract', 'vector-scale', 'vector-negate', 'vector-unit',
    'vector-connect', 'vector-project', 'vector-project-plane', 'vector-cross', 'plane-normal',
    'magnitude', 'dot', 'triple', 'distance-points', 'distance-point-line', 'distance-point-plane',
    'distance-lines', 'distance-planes', 'angle-vectors', 'angle-lines', 'angle-line-plane',
    'angle-planes', 'relation-lines', 'relation-line-plane', 'relation-planes', 'relation-point-object',
    'project-point-line', 'project-point-plane', 'perpendicular-line-plane', 'common-perpendicular',
    'curve', 'surface', 'function-surface', 'conic', 'curve-tangent-vector', 'curve-velocity',
    'curve-tangent', 'curve-normal-plane', 'curve-arc-length', 'surface-tangent-plane',
    'surface-tangent-u', 'surface-tangent-v', 'surface-normal', 'locus-curve', 'locus-surface'
  ];
  assert.deepEqual(DGS_3D_ADVANCED_TOOLS.map(tool => [tool.id, tool.key]),
    keys.map((key, index) => [1200 + index, key]));
});

test('explicit export allowlists enable individual capabilities only', () => {
  const available = new Set([200, 1030, 1200, 1232, 1244]);
  for (const tool of DGS_3D_ADVANCED_TOOLS) {
    assert.equal(isDgs3DAdvancedToolAvailable(available, tool.key),
      [1200, 1232, 1244].includes(tool.id), tool.key);
    assert.equal(isDgs3DAdvancedToolAvailable(new Set(), tool.key), false, tool.key);
    assert.equal(isDgs3DAdvancedToolAvailable(null, tool.key), true, tool.key);
    assert.equal(isDgs3DAdvancedToolAvailable(undefined, tool.key), true, tool.key);
  }
  assert.equal(isDgs3DAdvancedToolAvailable(null, 'unknown-operation'), false);
});

test('every exported capability has a localized label and an existing menu group', () => {
  const groups = new Set(DGS_3D_ADVANCED_GROUPS.map(group => group.key));
  assert.equal(groups.size, 6);
  for (const tool of DGS_3D_ADVANCED_TOOLS) {
    assert.ok(groups.has(tool.group), tool.key);
    assert.ok(dgs3DAdvancedToolLabel(tool, 'de').trim(), tool.key);
    assert.ok(dgs3DAdvancedToolLabel(tool, 'en').trim(), tool.key);
    assert.match(dgs3DAdvancedToolIcon(tool), /^<svg .*<path .*<\/svg>$/);
  }
});
