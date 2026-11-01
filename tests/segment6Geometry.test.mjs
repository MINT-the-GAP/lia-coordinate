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
    const source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : String(loaded.source);
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const analytic = await import('../src/shared/analytic3d.ts');
const curves = await import('../src/shared/curve3d.ts');
const surfaces = await import('../src/shared/surface3d.ts');
const conics = await import('../src/shared/conic3d.ts');
const loci = await import('../src/shared/locus3d.ts');
const { planeFromPointNormal } = await import('../src/shared/plane3d.ts');
const { cylinderFromAxisRadius3D, coneFromBaseApexRadius3D } = await import('../src/shared/solid3d.ts');
const { translationTransform3D } = await import('../src/shared/transform3d.ts');
const { compileParameterizedExpression } = await import('../src/shared/functionExpression.ts');

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const closeVector = (actual, expected, tolerance = 1e-6) => expected.forEach((value, index) => close(actual[index], value, tolerance));

test('safe parameter expressions support t, u/v, sliders and reject unknown identifiers', () => {
  const slider = { value: 2 };
  const one = compileParameterizedExpression('2t+a*sin(t)', ['t'], {}, { a: () => slider.value });
  assert.ok(one.fn);
  close(one.fn(Math.PI / 2), Math.PI + 2);
  slider.value = 3;
  close(one.fn(Math.PI / 2), Math.PI + 3);
  const two = compileParameterizedExpression('u^2+v^2', ['u', 'v']);
  assert.equal(two.fn(3, 4), 25);
  assert.equal(compileParameterizedExpression('window.alert(1)', ['t']).fn, null);
});

test('analytic vector operations, distances, angles, projections and relations are stable', () => {
  closeVector(analytic.addVector3([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
  closeVector(analytic.subtractVector3([4, 5, 6], [1, 2, 3]), [3, 3, 3]);
  closeVector(analytic.projectVectorOntoVector3([2, 2, 0], [1, 0, 0]), [2, 0, 0]);
  closeVector(analytic.crossVector3([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.equal(analytic.dotVector3([1, 2, 3], [4, -5, 6]), 12);
  assert.equal(analytic.scalarTripleProduct3([1, 0, 0], [0, 1, 0], [0, 0, 1]), 1);
  close(analytic.angleBetweenVectors3([1, 0, 0], [0, 2, 0]), Math.PI / 2);
  const xAxis = { anchor: [0, 0, 0], direction: [1, 0, 0] };
  close(analytic.distancePointLine3([3, 4, 0], xAxis), 4);
  closeVector(analytic.projectPointToLine3([3, 4, 0], xAxis), [3, 0, 0]);
  const skew = { anchor: [0, 1, 1], direction: [0, 1, 0] };
  close(analytic.distanceLines3(xAxis, skew), 1);
  const common = analytic.commonPerpendicularLines3(xAxis, skew);
  close(common.distance, 1);
  assert.equal(analytic.relationLines3(xAxis, skew), 'skew');
  assert.equal(analytic.relationLines3(xAxis, { anchor: [0, 1, 0], direction: [1, 0, 0] }), 'strictly-parallel');
});

test('curve evaluation, adaptive gaps, frame, arc length, binding, intersections and transformation work', () => {
  const helix = curves.createParametricCurve3D(['cos(t)', 'sin(t)', 't'], [0, 2 * Math.PI]);
  assert.ok(helix);
  closeVector(curves.evaluateCurve3D(helix, 0), [1, 0, 0]);
  const frame = curves.curveFrame3D(helix, Math.PI);
  assert.ok(frame && Math.abs(frame.tangent[1] + 1 / Math.sqrt(2)) < 1e-4);
  close(curves.curveArcLength3D(helix), 2 * Math.PI * Math.sqrt(2), 2e-4);
  const parameter = curves.nearestCurveParameter3D(helix, [0, 1, Math.PI / 2]);
  close(parameter, Math.PI / 2, 2e-3);
  const plane = planeFromPointNormal([0, 0, Math.PI], [0, 0, 1]);
  const hits = curves.intersectCurvePlane3D(helix, plane);
  assert.equal(hits.length, 1);
  close(hits[0].parameter, Math.PI, 1e-5);
  assert.equal(curves.curveContainedInPlane3D(
    curves.createParametricCurve3D(['t', 't^2', '0'], [-2, 2]),
    planeFromPointNormal([0, 0, 0], [0, 0, 1])
  ), true);
  const circle = curves.createParametricCurve3D(['cos(t)', 'sin(t)', '0'], [0, 2 * Math.PI]);
  const lineHits = curves.intersectCurveLine3D(circle, [-2, 0, 0], [4, 0, 0], 'segment');
  assert.equal(lineHits.length, 2);
  const linePoints = lineHits.map(hit => hit.point).sort((a, b) => a[0] - b[0]);
  closeVector(linePoints[0], [-1, 0, 0], 2e-5);
  closeVector(linePoints[1], [1, 0, 0], 2e-5);
  const gap = curves.createParametricCurve3D(['1/t', 't', '0'], [-1, 1]);
  const pieces = curves.sampleCurve3D(gap);
  assert.ok(pieces.length >= 2);
  assert.ok(pieces.every(piece => piece.every(sample => sample.point.every(Number.isFinite))));
  const translated = curves.transformCurve3D(translationTransform3D([2, 3, 4]), helix);
  closeVector(translated.evaluate(0), [3, 3, 4]);
});

test('surface mesh preserves holes and surface frames, binding and transformations remain intrinsic', () => {
  const graph = surfaces.createFunctionSurface3D('u^2+v^2', [-2, 2], [-2, 2]);
  assert.ok(graph);
  closeVector(surfaces.evaluateSurface3D(graph, 1, 2), [1, 2, 5]);
  const frame = surfaces.surfaceFrame3D(graph, 1, 2);
  assert.ok(frame);
  close(analytic.dotVector3(frame.normal, frame.tangentU), 0, 1e-6);
  close(analytic.dotVector3(frame.normal, frame.tangentV), 0, 1e-6);
  const nearest = surfaces.nearestSurfaceParameters3D(graph, [1, 2, 5]);
  close(nearest.u, 1, 2e-3);
  close(nearest.v, 2, 2e-3);
  const withHole = surfaces.createParametricSurface3D(['u', 'v', '1/(u^2+v^2)'], [-1, 1], [-1, 1], { quality: 10 });
  assert.ok(surfaces.sampleSurface3D(withHole).cells.length < 100);
  const translated = surfaces.transformSurface3D(translationTransform3D([1, -1, 2]), graph);
  closeVector(translated.evaluate(1, 2), [2, 1, 7]);
});

test('plane-cylinder conics classify circle, ellipse, two lines, tangent line and empty cases', () => {
  const cylinder = cylinderFromAxisRadius3D([0, 0, -1], [0, 0, 1], 1);
  assert.ok(cylinder);
  assert.equal(conics.intersectPlaneCylinderConic3D(planeFromPointNormal([0, 0, 0], [0, 0, 1]), cylinder).conicKind, 'circle');
  assert.equal(conics.intersectPlaneCylinderConic3D(planeFromPointNormal([0, 0, 0], [1, 0, 1]), cylinder).conicKind, 'ellipse');
  assert.equal(conics.intersectPlaneCylinderConic3D(planeFromPointNormal([0, 0, 0], [1, 0, 0]), cylinder).conicKind, 'two-lines');
  assert.equal(conics.intersectPlaneCylinderConic3D(planeFromPointNormal([1, 0, 0], [1, 0, 0]), cylinder).conicKind, 'line');
  assert.equal(conics.intersectPlaneCylinderConic3D(planeFromPointNormal([2, 0, 0], [1, 0, 0]), cylinder).conicKind, 'empty');
});

test('plane-cone conics classify circle, point, line, two lines, parabola and hyperbola', () => {
  const cone = coneFromBaseApexRadius3D([0, 0, 2], [0, 0, 0], 2);
  assert.ok(cone);
  assert.equal(conics.intersectPlaneConeConic3D(planeFromPointNormal([0, 0, 1], [0, 0, 1]), cone).conicKind, 'circle');
  assert.equal(conics.intersectPlaneConeConic3D(planeFromPointNormal([0, 0, 0], [0, 0, 1]), cone).conicKind, 'point');
  assert.equal(conics.intersectPlaneConeConic3D(planeFromPointNormal([0, 0, 0], [1, 0, -1]), cone).conicKind, 'line');
  assert.equal(conics.intersectPlaneConeConic3D(planeFromPointNormal([0, 0, 0], [1, 0, 0]), cone).conicKind, 'two-lines');
  assert.equal(conics.intersectPlaneConeConic3D(planeFromPointNormal([0, 0, 1], [1, 0, -1]), cone).conicKind, 'parabola');
  const hyperbola = conics.intersectPlaneConeConic3D(planeFromPointNormal([1, 0, 0], [1, 0, 0]), cone);
  assert.equal(hyperbola.conicKind, 'hyperbola');
  assert.equal(hyperbola.branches.length, 2);
});

test('locus curve and surface restore drivers after every evaluation including failures', () => {
  const state = { a: 3, b: -2 };
  const a = { id: 'a', range: [0, 2], get: () => state.a, set: value => { state.a = value; } };
  const b = { id: 'b', range: [-1, 1], get: () => state.b, set: value => { state.b = value; } };
  const curve = loci.createLocusCurve3D(a, 'P', () => [state.a, state.a ** 2, 0]);
  closeVector(curve.curve.evaluate(1.5), [1.5, 2.25, 0]);
  assert.equal(state.a, 3);
  const surface = loci.createLocusSurface3D(a, b, 'Q', () => [state.a, state.b, state.a * state.b]);
  closeVector(surface.surface.evaluate(1.5, 0.5), [1.5, 0.5, 0.75]);
  assert.deepEqual(state, { a: 3, b: -2 });
  assert.throws(() => loci.withRestoredDrivers3D([a, b], () => { a.set(0); b.set(0); throw new Error('x'); }));
  assert.deepEqual(state, { a: 3, b: -2 });
});