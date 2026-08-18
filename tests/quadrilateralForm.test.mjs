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
  FORM_RELATIVE_LENGTH_TOLERANCE,
  classifyQuadrilateral,
  evaluateQuadrilateralForm,
  formatQuadrilateralFormFeedback,
  parseQuadrilateralFormSpec
} = await import('../src/subsystems/quadrilateralForm.ts');

function point(x, y) {
  return { X: () => x, Y: () => y };
}

function polygon(coordinates, metadata = {}) {
  const vertices = coordinates.map(([x, y]) => point(x, y));
  vertices.push(vertices[0]);
  return {
    elType: 'polygon',
    __liaDgsPolygon: true,
    vertices,
    ...metadata
  };
}

function coordinates(values) {
  return values.map(([x, y]) => ({ x, y }));
}

function properties(values, tolerances) {
  return classifyQuadrilateral(coordinates(values), tolerances).properties;
}

function evaluation(values, spec, tolerances) {
  return evaluateQuadrilateralForm(
    polygon(values),
    parseQuadrilateralFormSpec(spec, 4),
    tolerances
  );
}

function rotateTranslate(values, angle, dx, dy, mirror = false, scale = 1) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return values.map(([rawX, rawY]) => {
    const x = (mirror ? -rawX : rawX) * scale;
    const y = rawY * scale;
    return [
      dx + x * cosine - y * sine,
      dy + x * sine + y * cosine
    ];
  });
}

function cyclicShift(values, amount) {
  return values.slice(amount).concat(values.slice(0, amount));
}

test('Form parser accepts every documented German and English name case-insensitively', () => {
  const aliases = [
    ['Parallelogramm', 'parallelogram'],
    ['PARALLELOGRAM', 'parallelogram'],
    ['Rechteck', 'rectangle'],
    ['rectangle', 'rectangle'],
    ['Raute', 'rhombus'],
    ['RHOMBUS', 'rhombus'],
    ['Quadrat', 'square'],
    ['square', 'square'],
    ['Trapez', 'trapezoid'],
    ['TRAPEZOID', 'trapezoid'],
    ['Drachenviereck', 'kite'],
    ['kite', 'kite']
  ];

  aliases.forEach(([name, expected]) => {
    const parsed = parseQuadrilateralFormSpec(name, 4);
    assert.equal(parsed.valid, true, name);
    assert.equal(parsed.form, expected, name);
  });
});

test('Form parser validates exklusiv, deduplicates aliases, and rejects contradictions', () => {
  const multiple = parseQuadrilateralFormSpec(
    'Parallelogramm;Exklusiv=Raute|Rhombus|Rechteck|Rectangle',
    4
  );
  assert.equal(multiple.valid, true);
  assert.deepEqual(multiple.exclusions, ['rhombus', 'rectangle']);

  const invalidCases = [
    ['Unbekannt', 'unknown-form'],
    ['Raute;exklusiv=Unbekannt', 'unknown-exclusive-form'],
    ['Raute;exklusiv=', 'empty-exclusive'],
    ['Raute;exklusiv=Quadrat|', 'empty-exclusive'],
    ['Raute;modus=exakt', 'unsupported-attribute'],
    ['Raute;inklusiv=false', 'unsupported-attribute'],
    ['Raute;exclusive=Square', 'unsupported-attribute'],
    ['Raute;exklusiv=Rhombus', 'self-exclusion']
  ];
  invalidCases.forEach(([spec, error]) => {
    const parsed = parseQuadrilateralFormSpec(spec, 4);
    assert.equal(parsed.valid, false, spec);
    assert.equal(parsed.error, error, spec);
  });

  assert.equal(parseQuadrilateralFormSpec('Raute', 3).error, 'requires-four-corners');
  assert.equal(parseQuadrilateralFormSpec('Raute', 5).error, 'requires-four-corners');
});

test('rectangle classification survives rotation, translation, reflection, orientation, and start point', () => {
  const rectangle = [[0, 0], [4, 0], [4, 2], [0, 2]];
  const variants = [
    rectangle,
    rotateTranslate(rectangle, 0.713, 8.25, -3.5),
    rotateTranslate(rectangle, -1.123, -4, 11, true),
    rectangle.slice().reverse(),
    cyclicShift(rectangle, 1),
    cyclicShift(rectangle.slice().reverse(), 2)
  ];

  variants.forEach((variant, index) => {
    const result = classifyQuadrilateral(coordinates(variant));
    assert.equal(result.valid, true, String(index));
    assert.equal(result.properties.rectangle, true, String(index));
    assert.equal(result.properties.parallelogram, true, String(index));
    assert.equal(result.properties.trapezoid, true, String(index));
    assert.equal(result.properties.rhombus, false, String(index));
  });
});

test('inclusive definitions classify squares, rhombi, parallelograms, and trapezoids', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const rhombusArea20 = [[0, 0], [5, 0], [8, 4], [3, 4]];
  const parallelogramArea18 = [[0, 0], [6, 0], [7.5, 3], [1.5, 3]];
  const trapezoid = [[0, 0], [5, 0], [4, 2], [1, 2]];

  assert.deepEqual(properties(square), {
    parallelogram: true,
    rectangle: true,
    rhombus: true,
    square: true,
    trapezoid: true,
    kite: true
  });

  const rhombus = classifyQuadrilateral(coordinates(rhombusArea20));
  assert.equal(rhombus.valid, true);
  assert.equal(rhombus.analysis.area, 20);
  assert.equal(rhombus.properties.rhombus, true);
  assert.equal(rhombus.properties.parallelogram, true);
  assert.equal(rhombus.properties.kite, true);
  assert.equal(rhombus.properties.rectangle, false);

  const general = properties(parallelogramArea18);
  assert.equal(general.parallelogram, true);
  assert.equal(general.trapezoid, true);
  assert.equal(general.rectangle, false);
  assert.equal(general.rhombus, false);

  const inclusiveTrapezoid = properties(trapezoid);
  assert.equal(inclusiveTrapezoid.trapezoid, true);
  assert.equal(inclusiveTrapezoid.parallelogram, false);
});

test('inclusive hierarchy stays closed when raw predicates meet different tolerance edges', () => {
  const tolerantRhombus = [
    [0, 0], [0.13, 1], [0.263, 0], [0.109, -1]
  ];
  const rhombus = properties(tolerantRhombus);
  assert.equal(rhombus.rhombus, true);
  assert.equal(rhombus.parallelogram, true);
  assert.equal(rhombus.trapezoid, true);
  assert.equal(rhombus.kite, true);
  assert.equal(
    evaluation(tolerantRhombus, 'Raute;exklusiv=Trapez').status,
    'excluded'
  );

  const tolerantRectangle = [
    [0, 0], [1, 0], [0.984, 1.031], [-0.016, 1]
  ];
  const rectangle = properties(tolerantRectangle);
  assert.equal(rectangle.rectangle, true);
  assert.equal(rectangle.parallelogram, true);
  assert.equal(rectangle.trapezoid, true);
  assert.equal(
    evaluation(tolerantRectangle, 'Rechteck;exklusiv=Parallelogramm').status,
    'excluded'
  );
});

test('convex and concave kites are accepted while invalid quadrilaterals are rejected', () => {
  const convexKite = [[0, 0], [2, 3], [0, 5], [-2, 3]];
  const concaveKite = [[0, 0], [2, 2], [0, 1], [-2, 2]];
  assert.equal(properties(convexKite).kite, true);
  assert.equal(properties(concaveKite).kite, true);

  const bowTie = classifyQuadrilateral(coordinates([[0, 0], [2, 2], [0, 2], [2, 0]]));
  assert.equal(bowTie.valid, false);
  assert.equal(bowTie.issue, 'self-intersection');

  const duplicate = classifyQuadrilateral(coordinates([[0, 0], [2, 0], [2, 0], [0, 2]]));
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.issue, 'duplicate-corner');

  const collinear = classifyQuadrilateral(coordinates([[0, 0], [1, 0], [2, 0], [0, 2]]));
  assert.equal(collinear.valid, false);
  assert.equal(collinear.issue, 'collinear-corner');

  const triangle = classifyQuadrilateral(coordinates([[0, 0], [1, 0], [0, 1]]));
  assert.equal(triangle.valid, false);
  assert.equal(triangle.issue, 'wrong-corner-count');

  const nonFinite = classifyQuadrilateral([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: Number.NaN, y: 1 }, { x: 0, y: 1 }
  ]);
  assert.equal(nonFinite.valid, false);
  assert.equal(nonFinite.issue, 'invalid-coordinate');
});

test('template-managed preset polygons never satisfy Form', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const config = parseQuadrilateralFormSpec('Quadrat', 4);
  const managed = evaluateQuadrilateralForm(
    polygon(square, { __liaDgsMacroManaged: true }),
    config
  );
  const keyed = evaluateQuadrilateralForm(
    polygon(square, { __liaDgsMacroKey: 'macro:area:test' }),
    config
  );
  assert.equal(managed.matches, false);
  assert.equal(managed.issue, 'not-learner-polygon');
  assert.equal(keyed.matches, false);
  assert.equal(keyed.issue, 'not-learner-polygon');
});

test('exklusiv rejects every quadrilateral having the excluded property', () => {
  const rectangle = [[0, 0], [4, 0], [4, 2], [0, 2]];
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const general = [[0, 0], [6, 0], [7.5, 3], [1.5, 3]];
  const trapezoid = [[0, 0], [5, 0], [4, 2], [1, 2]];

  assert.equal(evaluation(square, 'Rechteck').matches, true);
  assert.equal(evaluation(rectangle, 'Rechteck;exklusiv=Quadrat').matches, true);
  assert.equal(evaluation(square, 'Rechteck;exklusiv=Quadrat').status, 'excluded');
  assert.equal(evaluation(rectangle, 'Parallelogramm;exklusiv=Raute').matches, true);
  assert.equal(evaluation(square, 'Parallelogramm;exklusiv=Raute').status, 'excluded');
  assert.equal(
    evaluation(general, 'Parallelogramm;exklusiv=Raute|Rechteck').matches,
    true
  );
  assert.equal(evaluation(trapezoid, 'Trapez;exklusiv=Parallelogramm').matches, true);
  assert.equal(evaluation(general, 'Trapez;exklusiv=Parallelogramm').status, 'excluded');
  assert.equal(evaluation(square, 'Drachenviereck;exklusiv=Raute').status, 'excluded');
});

test('scaled length equality and angular tolerance have deterministic inside/outside boundaries', () => {
  function nearRhombus(delta) {
    const slanted = 1 + delta;
    const height = Math.sqrt(slanted * slanted - 0.25);
    return [[0, 0], [1, 0], [1.5, height], [0.5, height]];
  }
  const insideLength = classifyQuadrilateral(coordinates(nearRhombus(0.009)));
  const outsideLength = classifyQuadrilateral(coordinates(nearRhombus(0.011)));
  assert.equal(insideLength.properties.rhombus, true);
  assert.equal(outsideLength.properties.rhombus, false);
  assert.ok(insideLength.lengthEqualityTolerance <= 0.05 + 1e-12);
  assert.equal(FORM_RELATIVE_LENGTH_TOLERANCE, 0.01);

  function skewedRectangle(degrees) {
    const shift = 2 * Math.tan(degrees * Math.PI / 180);
    return [[0, 0], [4, 0], [4 + shift, 2], [shift, 2]];
  }
  assert.equal(properties(skewedRectangle(0.999)).rectangle, true);
  assert.equal(properties(skewedRectangle(1.001)).rectangle, false);

  function nearParallelTrapezoid(degrees) {
    const radians = degrees * Math.PI / 180;
    return [
      [0, 0],
      [4, 0],
      [3, 2],
      [3 - 3 * Math.cos(radians), 2 - 3 * Math.sin(radians)]
    ];
  }
  assert.equal(properties(nearParallelTrapezoid(0.999)).trapezoid, true);
  assert.equal(properties(nearParallelTrapezoid(1.001)).trapezoid, false);
});

test('exact forms remain stable across sensible small and large scales', () => {
  const base = [[0, 0], [4, 0], [4, 2], [0, 2]];
  [1e-3, 1, 1e3].forEach((scale) => {
    const transformed = rotateTranslate(base, 0.431, 1e6, -2e6, true, scale);
    const result = classifyQuadrilateral(coordinates(transformed));
    assert.equal(result.valid, true, String(scale));
    assert.equal(result.properties.rectangle, true, String(scale));
  });

  const microscopic = classifyQuadrilateral(coordinates([
    [0, 0], [4e-6, 0], [4e-6, 2e-6], [0, 2e-6]
  ]));
  assert.equal(microscopic.valid, true);
  assert.equal(microscopic.properties.rectangle, true);
});

test('localized feedback distinguishes base mismatch, exclusion, and invalid geometry', () => {
  const nonRhombus = evaluation(
    [[0, 0], [4, 0], [4, 2], [0, 2]],
    'Raute'
  );
  assert.match(formatQuadrilateralFormFeedback(nonRhombus, 'de'), /keine Raute/);
  assert.match(formatQuadrilateralFormFeedback(nonRhombus, 'de'), /gleich lang/);
  assert.match(formatQuadrilateralFormFeedback(nonRhombus, 'en'), /not yet a rhombus/i);

  const excluded = evaluation(
    [[0, 0], [2, 0], [2, 2], [0, 2]],
    'Rechteck;exklusiv=Quadrat'
  );
  assert.match(formatQuadrilateralFormFeedback(excluded, 'de'), /ausgeschlossene Form Quadrat/);
  assert.match(formatQuadrilateralFormFeedback(excluded, 'en'), /excluded shape square/);

  const crossing = evaluation(
    [[0, 0], [2, 2], [0, 2], [2, 0]],
    'Trapez'
  );
  assert.match(formatQuadrilateralFormFeedback(crossing, 'de'), /selbstüberschneidend/);
  assert.match(formatQuadrilateralFormFeedback(crossing, 'en'), /self-intersecting/);
});
