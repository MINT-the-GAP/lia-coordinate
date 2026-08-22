import assert from 'node:assert/strict';
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
  clipLineToBounds,
  clipRayToBounds,
  createDirectedCircularArcGeometry,
  normalizeAngleDegrees,
  sampleStaticFunction,
  sampleStaticFunctionExpression
} = await import('../src/static/staticGeometry.ts');

const bounds = { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('clips infinite lines and directed rays without extending the ray backwards', () => {
  const line = clipLineToBounds({ x: -5, y: 5 }, { x: 5, y: 5 }, bounds);
  assert.deepEqual(line?.start, { x: 0, y: 5 });
  assert.deepEqual(line?.end, { x: 10, y: 5 });
  close(line?.tStart, 0.5);
  close(line?.tEnd, 1.5);

  const ray = clipRayToBounds({ x: 5, y: 5 }, { x: 4, y: 5 }, bounds);
  assert.deepEqual(ray?.start, { x: 5, y: 5 });
  assert.deepEqual(ray?.end, { x: 0, y: 5 });
  assert.equal(clipRayToBounds({ x: 11, y: 5 }, { x: 12, y: 5 }, bounds), null);
  assert.equal(clipLineToBounds({ x: 0, y: 11 }, { x: 1, y: 11 }, bounds), null);
});

test('normalizes angles and emits SVG flags for a projected mathematical arc', () => {
  assert.equal(normalizeAngleDegrees(-90), 270);
  const ccw = createDirectedCircularArcGeometry(
    { x: 0, y: 0 }, 2, 0, Math.PI / 2, { direction: 'ccw' }
  );
  close(ccw?.sweepRadians, Math.PI / 2);
  close(ccw?.end.x, 0);
  close(ccw?.end.y, 2);
  assert.equal(ccw?.segments[0].svgLargeArcFlag, 0);
  assert.equal(ccw?.segments[0].svgSweepFlag, 0);

  const clockwise = createDirectedCircularArcGeometry(
    { x: 0, y: 0 }, 2, 0, Math.PI / 2, { direction: 'cw' }
  );
  close(clockwise?.sweepRadians, -3 * Math.PI / 2);
  assert.equal(clockwise?.segments[0].svgLargeArcFlag, 1);
  assert.equal(clockwise?.segments[0].svgSweepFlag, 1);

  const full = createDirectedCircularArcGeometry(
    { x: 1, y: 2 }, 3, 0, 0, { fullCircle: true }
  );
  assert.equal(full?.segments.length, 2);
  assert.deepEqual(full?.end, full?.start);

  const ordinary = createDirectedCircularArcGeometry(
    { x: 0, y: 0 }, 1, 0, Math.PI / 2, { fullCircle: true }
  );
  close(ordinary?.end.x, 0);
  close(ordinary?.end.y, 1);
});

test('samples fixed functions deterministically and separates detected discontinuities', () => {
  const plotBounds = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
  const linear = sampleStaticFunction(x => x, plotBounds, { sampleCount: 32 });
  assert.equal(linear?.sampleCount, 32);
  assert.equal(linear?.evaluationCount, 129);
  assert.equal(linear?.segments.length, 1);
  assert.deepEqual(linear?.segments[0][0], { x: -2, y: -2 });
  assert.deepEqual(linear?.segments[0].at(-1), { x: 2, y: 2 });

  const reciprocal = sampleStaticFunction(x => 1 / x, plotBounds, { sampleCount: 128 });
  assert.ok(reciprocal && reciprocal.segments.length >= 2);
  for (const segment of reciprocal.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < 0 && Math.max(...xs) > 0));
    for (const point of segment) {
      assert.ok(point.x >= plotBounds.xmin && point.x <= plotBounds.xmax);
      assert.ok(point.y >= plotBounds.ymin && point.y <= plotBounds.ymax);
    }
  }

  const tinyBounds = { xmin: 0, xmax: 1e-10, ymin: -1, ymax: 1 };
  const tiny = sampleStaticFunction(() => 0, tinyBounds, { sampleCount: 800 });
  assert.equal(tiny?.segments.length, 1);
  assert.deepEqual(tiny?.segments[0][0], { x: 0, y: 0 });
  assert.deepEqual(tiny?.segments[0].at(-1), { x: 1e-10, y: 0 });

  const shiftedPole = 0.00007;
  const singularBounds = { xmin: -5, xmax: 5, ymin: -10, ymax: 10 };
  const logarithm = sampleStaticFunction(
    x => Math.log(Math.abs(x - shiftedPole)),
    singularBounds,
    { sampleCount: 800 }
  );
  assert.ok(logarithm && logarithm.segments.length >= 2);
  for (const segment of logarithm.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
  }

  for (const evaluate of [
    x => 1 / (x - shiftedPole),
    x => 1 / ((x - shiftedPole) ** 2),
    x => -Math.log(Math.abs(x - shiftedPole)),
    x => 1 / Math.sqrt(Math.abs(x - shiftedPole)),
    x => Math.abs(x - shiftedPole) ** -0.1,
    x => Math.tan(x - shiftedPole + Math.PI / 2)
  ]) {
    const sampled = sampleStaticFunction(evaluate, singularBounds, { sampleCount: 800 });
    assert.ok(sampled && sampled.segments.length >= 2);
    for (const segment of sampled.segments) {
      const xs = segment.map(point => point.x);
      assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
    }
  }

  const step = sampleStaticFunction(
    x => Math.floor(x - shiftedPole),
    { xmin: -1, xmax: 1, ymin: -2, ymax: 2 },
    { sampleCount: 800 }
  );
  assert.ok(step && step.segments.length >= 2);
  for (const segment of step.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
  }
  const finiteJump = sampleStaticFunction(
    x => x < shiftedPole ? -0.25 : 0.25,
    { xmin: -1, xmax: 1, ymin: -2, ymax: 2 },
    { sampleCount: 800 }
  );
  assert.ok(finiteJump && finiteJump.segments.length >= 2);
  for (const segment of finiteJump.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
  }

  const continuousCusp = sampleStaticFunction(
    x => Math.abs(x - shiftedPole),
    singularBounds,
    { sampleCount: 800 }
  );
  assert.equal(continuousCusp?.segments.length, 1);

  const smoothBounds = { xmin: -5, xmax: 5, ymin: -2, ymax: 2 };
  for (const evaluate of [
    x => Math.sin(25 * x),
    x => Math.sin(50 * x),
    x => Math.tanh(50 * x),
    x => Math.tanh(500 * x),
    x => Math.atan(1000 * x),
    x => Math.sqrt(Math.abs(x - shiftedPole)),
    x => Math.abs(x - shiftedPole) ** 0.25,
    x => Math.abs(x - shiftedPole) ** 0.1,
    x => Math.abs(x - shiftedPole) ** 0.05,
    x => Math.cbrt(x - shiftedPole)
  ]) {
    assert.equal(
      sampleStaticFunction(evaluate, smoothBounds, { sampleCount: 800 })?.segments.length,
      1
    );
  }

  const slowBounds = { xmin: -0.5, xmax: 0.5, ymin: -5, ymax: 5 };
  for (const evaluate of [
    x => Math.log(-Math.log(Math.abs(x - shiftedPole))),
    x => Math.sqrt(-Math.log(Math.abs(x - shiftedPole))),
    x => Math.cbrt(-Math.log(Math.abs(x - shiftedPole))),
    x => Math.log(Math.log(-Math.log(Math.abs(x - shiftedPole))))
  ]) {
    const sampled = sampleStaticFunction(evaluate, slowBounds, { sampleCount: 800 });
    assert.ok(sampled && sampled.segments.length >= 2);
    for (const segment of sampled.segments) {
      const xs = segment.map(point => point.x);
      assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
    }
  }
  const slowGatePole = 0.069 / 800;
  const slowGateSample = sampleStaticFunction(
    x => Math.log(-Math.log(Math.abs(x - slowGatePole))),
    slowBounds,
    { sampleCount: 800 }
  );
  assert.ok(slowGateSample && slowGateSample.segments.length >= 2);
  for (const segment of slowGateSample.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < slowGatePole && Math.max(...xs) > slowGatePole));
  }
  assert.equal(
    sampleStaticFunction(
      x => 1 / -Math.log(Math.abs(x - shiftedPole)),
      slowBounds,
      { sampleCount: 800 }
    )?.segments.length,
    1
  );

  const tinyScale = 1e-15;
  const tinyScaledPole = sampleStaticFunction(
    x => tinyScale * Math.log(Math.abs(x - shiftedPole)),
    {
      xmin: slowBounds.xmin,
      xmax: slowBounds.xmax,
      ymin: slowBounds.ymin * tinyScale,
      ymax: slowBounds.ymax * tinyScale
    },
    { sampleCount: 800 }
  );
  assert.ok(tinyScaledPole && tinyScaledPole.segments.length >= 2);
  for (const segment of tinyScaledPole.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
  }

  const irrationalPole = Math.sqrt(2);
  for (const evaluate of [
    x => Math.log(Math.abs(x * x - 2)),
    x => -Math.log(Math.abs(x * x - 2))
  ]) {
    const sampled = sampleStaticFunction(
      evaluate,
      { xmin: 1, xmax: 2, ymin: -10, ymax: 10 },
      { sampleCount: 800 }
    );
    assert.ok(sampled && sampled.segments.length >= 2);
    for (const segment of sampled.segments) {
      const xs = segment.map(point => point.x);
      assert.ok(!(Math.min(...xs) < irrationalPole && Math.max(...xs) > irrationalPole));
    }
  }

  const translatedY = 1e13;
  const translatedPole = sampleStaticFunction(
    x => translatedY + Math.log(Math.abs(x - shiftedPole)),
    {
      xmin: slowBounds.xmin,
      xmax: slowBounds.xmax,
      ymin: translatedY - 10,
      ymax: translatedY + 10
    },
    { sampleCount: 800 }
  );
  assert.ok(translatedPole && translatedPole.segments.length >= 2);
  for (const segment of translatedPole.segments) {
    const xs = segment.map(point => point.x);
    assert.ok(!(Math.min(...xs) < shiftedPole && Math.max(...xs) > shiftedPole));
  }
});

test('expression sampling rejects dependencies and separates domain gaps', () => {
  const plotBounds = { xmin: -2, xmax: 2, ymin: -1, ymax: 2 };
  assert.equal(sampleStaticFunctionExpression('a*x', plotBounds), null);
  const root = sampleStaticFunctionExpression('sqrt(x)', plotBounds, { sampleCount: 64 });
  assert.ok(root && root.segments.length === 1);
  assert.ok(root.segments[0].every(point => point.x >= 0));
});
