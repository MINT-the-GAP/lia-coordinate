import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    let source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : String(loaded.source);
    if (url.endsWith('/subsystems/dgs.ts')) source += '\nexport { refreshDgsObjectLabel };';
    if (url.endsWith('/subsystems/curveSurface3d.ts')) source += '\nexport { installConicPartVisibility, parseConicSpec, parseCurveSpec, parseSurfaceSpec };';
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});
const { installConicPartVisibility, parseConicSpec, parseCurveSpec, parseSurfaceSpec } = await import('../src/subsystems/curveSurface3d.ts');
globalThis.window = {};
const { refreshDgsObjectLabel } = await import('../src/subsystems/dgs.ts');

function element() {
  return {
    visProp: { visible: true },
    setAttribute(attributes) { Object.assign(this.visProp, attributes); return this; }
  };
}

test('restored conic styles do not expose an absent branch or isolated point', () => {
  const owner = { __liaDgsShowObject: true };
  const branch = { ...element(), element2D: element(), label: element() };
  let available = false;
  installConicPartVisibility(branch, owner, () => available);
  for (const part of [branch, branch.element2D, branch.label]) {
    part.setAttribute({ visible: true, strokeColor: '#ff0000', strokeWidth: 5 });
    assert.equal(part.visProp.visible(), false);
    assert.equal(part.visProp.strokeColor, '#ff0000');
    assert.equal(part.visProp.strokeWidth, 5);
  }
  available = true;
  assert.equal(branch.visProp.visible(), true);
  assert.equal(branch.element2D.visProp.visible(), true);
  owner.__liaDgsShowName = false;
  assert.equal(branch.label.visProp.visible(), false);
  assert.equal(branch.visProp.visible(), true);
  owner.__liaDgsShowObject = false;
  assert.equal(branch.visProp.visible(), false);
  assert.equal(branch.element2D.visProp.visible(), false);
});

test('conic visibility survives 2D hiding and restoration of the saved predicate', () => {
  const owner = { ...element(), __liaDgsShowObject: true };
  installConicPartVisibility(owner, owner, () => true);
  assert.equal(owner.__liaConic3DOwner, undefined, 'the owner must not reference itself as a part');
  const saved = owner.visProp.visible;
  owner.setAttribute({ visible: false });
  assert.equal(owner.visProp.visible(), false);
  owner.setAttribute({ visible: saved });
  assert.equal(owner.visProp.visible(), true);
  owner.setAttribute({ visible: saved });
  assert.equal(owner.visProp.visible(), true);
});

test('conic opacity defaults to an opaque curve and retains explicit transparent values', () => {
  assert.equal(parseConicSpec('S;k;E;Z').opacity, 1);
  assert.equal(parseConicSpec('S;k;E;Z;opacity=0.42').opacity, 0.42);
  assert.equal(parseConicSpec('S;k;E;Z;deckkraft=0').opacity, 0);
  assert.equal(parseConicSpec('S;k=0;E;Z;opacity=0.42').showName, false);
});
test('generic import formatting preserves conic opacity across delayed retries and hidden branches', () => {
  const board = { update() {} };
  const owner = {
    ...element(), board, __liaCurve3D: true, __liaConicSection3D: true,
    __liaSceneRecord: { kind: 'conic-section3d' }, __liaDgsShowObject: true,
    __liaDgsOpacity: 0.42, element2D: element()
  };
  const branch = { ...element(), element2D: element() };
  const point = { ...element(), element2D: element() };
  owner.__liaConic3DParts = [branch, point];
  installConicPartVisibility(owner, owner, () => true);
  installConicPartVisibility(branch, owner, () => true);
  installConicPartVisibility(point, owner, () => false);
  for (let retry = 0; retry < 4; retry++) {
    window.__applyDgsObjectExportFormat('S', owner, { opacity: 0.42, visible: true });
    for (const part of [owner, owner.element2D, branch, branch.element2D, point, point.element2D]) {
      assert.equal(part.visProp.strokeOpacity, 0.42);
      assert.equal(part.visProp.highlightStrokeOpacity, 0.42);
      assert.equal(part.visProp.fillOpacity, 0.42);
    }
    assert.equal(point.visProp.visible(), false, 'an absent isolated point remains hidden');
  }
  window.__applyDgsObjectExportFormat('S', owner, { opacity: 0.42, visible: false });
  assert.equal(owner.visProp.strokeOpacity, 0);
  window.__applyDgsObjectExportFormat('S', owner, { opacity: 0.42, visible: true });
  assert.equal(owner.visProp.strokeOpacity, 0.42);
  assert.equal(branch.visProp.visible(), true);
});
for (const spatial of [true, false]) {
  test('delayed formatting keeps ' + (spatial ? '3D points hidden in 2D' : '2D points hidden in 3D') + ' and preserves next-mode visibility', () => {
    const frames = [];
    const key = spatial ? '__liaScene3DVisible' : '__liaScene2DVisible';
    let parts;
    const board = {
      __liaSceneMode: spatial ? '2d' : '3d', isSuspendedUpdate: false,
      suspendUpdate() { this.isSuspendedUpdate = true; },
      unsuspendUpdate() { this.isSuspendedUpdate = false; frames.push(parts.map(part => part.visProp.visible)); },
      update() {}
    };
    const projection = element(), label = element();
    const point = {
      ...element(), board, __liaDgsPointName: 'A', ...(spatial ? { __liaPoint3D: true } : {}),
      ...(spatial ? { element2D: projection } : {}), label
    };
    // Simulate JSXGraph forwarding parent visibility to its 2D projection.
    const original = point.setAttribute;
    point.setAttribute = function(attributes) {
      original.call(this, attributes);
      if (spatial && Object.hasOwn(attributes, 'visible')) projection.setAttribute({ visible: attributes.visible });
    };
    parts = spatial ? [point, projection, label] : [point, label];
    for (const part of parts) { part[key] = true; part.setAttribute({ visible: false }); }
    for (let retry = 0; retry < 4; retry++) {
      // This is the fallback's visibility write before the DGS format hook.
      point.setAttribute({ visible: true });
      window.__applyDgsObjectExportFormat('S', point, { visible: true, showName: false, opacity: 0.7 });
      assert.ok(parts.every(part => part.visProp.visible === false), 'inactive parts must stay hidden after every retry');
      assert.equal(point[key], true);
      if (spatial) assert.equal(projection[key], true, 'hide must not overwrite the saved projection visibility');
      assert.equal(label[key], false, 'the imported name setting must replace the previous saved state');
    }
    assert.ok(frames.every(frame => frame.every(visible => visible === false)), 'no intermediate visible redraw');
    for (const part of parts) part.setAttribute({ visible: part[key] });
    assert.equal(point.visProp.visible, true);
    if (spatial) assert.equal(projection.visProp.visible, true);
    assert.equal(label.visProp.visible, false);
    window.__applyDgsObjectExportFormat('S', point, { visible: false, showName: false });
    assert.equal(point[key], false, 'an explicitly hidden object must remain hidden after a future mode switch');
  });
}

test('formatting an inactive conic preserves its dynamic branch predicates', () => {
  const board = { __liaSceneMode: '2d', update() {} };
  const owner = {
    ...element(), board, __liaCurve3D: true, __liaConicSection3D: true,
    __liaSceneRecord: { kind: 'conic-section3d' }, __liaDgsShowObject: true,
    element2D: element()
  };
  const branch = { ...element(), element2D: element() };
  owner.__liaConic3DParts = [branch];
  let available = true;
  installConicPartVisibility(owner, owner, () => true);
  installConicPartVisibility(branch, owner, () => available);
  const parts = [owner, owner.element2D, branch, branch.element2D];
  for (const part of parts) part.__liaScene3DVisible = part.visProp.visible;
  for (const part of parts) part.setAttribute({ visible: false });
  window.__applyDgsObjectExportFormat('S', owner, { visible: true, opacity: 0.4 });
  assert.ok(parts.every(part => !part.visProp.visible()));
  for (const part of parts) part.setAttribute({ visible: part.__liaScene3DVisible });
  assert.equal(branch.visProp.visible(), true);
  available = false;
  assert.equal(branch.visProp.visible(), false);
  assert.equal(owner.visProp.strokeOpacity, 0.4);
});

for (const spatial of [true, false]) {
  test(`late label refresh keeps ${spatial ? '3D' : '2D'} labels hidden and preserves the next-mode name setting`, () => {
    const board = { __liaSceneMode: spatial ? '2d' : '3d', update() {} };
    const label = { ...element(), setText() {}, showElement() { this.shown = true; }, hideElement() { this.shown = false; } };
    const object = { ...element(), board, label, __liaPoint3D: spatial, __liaDgsPointName: 'A', __liaDgsShowName: true };
    const key = spatial ? '__liaScene3DVisible' : '__liaScene2DVisible';
    refreshDgsObjectLabel(object);
    assert.equal(label.visProp.visible, false);
    assert.equal(label.shown, false);
    assert.equal(label[key], true);
    for (let retry = 0; retry < 4; retry++) {
      window.__applyDgsObjectExportFormat('late-label', object, { showName: true });
      assert.equal(label.visProp.visible, false);
      assert.equal(label[key], true);
    }
    board.__liaSceneMode = spatial ? '3d' : '2d';
    label.setAttribute({ visible: label[key] });
    assert.equal(label.visProp.visible, true);
    refreshDgsObjectLabel(object);
    assert.equal(label.shown, true);
  });
}

test('late conic name refresh keeps branch availability dynamic after mode restoration', () => {
  const board = { __liaSceneMode: '2d', update() {} };
  let available = false;
  const owner = { ...element(), board, __liaConicSection3D: true, __liaCurve3D: true, __liaDgsShowObject: true, __liaDgsShowName: true, label: { ...element(), board, setText() {} } };
  installConicPartVisibility(owner, owner, () => available);
  refreshDgsObjectLabel(owner);
  assert.equal(owner.label.visProp.visible(), false);
  owner.label.setAttribute({ visible: owner.label.__liaScene3DVisible });
  assert.equal(owner.label.visProp.visible(), false);
  available = true;
  assert.equal(owner.label.visProp.visible(), true);
});
test('missing numeric curve and surface options use defaults while explicit zero opacity stays zero', () => {
  const curve = 'B;c;t;t;t*t;0;-2;2';
  const defaults = parseCurveSpec(curve);
  assert.equal(defaults.opacity, 1);
  assert.equal(defaults.width, 3);
  assert.equal(defaults.quality, 96);
  assert.equal(parseCurveSpec(curve + ';opacity=').opacity, 1);
  assert.equal(parseCurveSpec(curve + ';opacity=0').opacity, 0);
  const surface = parseSurfaceSpec('B;S;u+v;-2;2;-2;2', true);
  assert.equal(surface.opacity, 0.3);
  assert.equal(surface.quality, 24);
  assert.equal(surface.qualityV, 24);
});