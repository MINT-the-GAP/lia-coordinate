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
  checkCombinedQuizOnBoard,
  evaluateCombinedQuizOnBoard,
  parseCombinedQuizSpec
} = await import('../src/subsystems/combinedQuiz.ts');

function point(x, y) {
  return {
    X: () => x,
    Y: () => y
  };
}

function polygon(board, coordinates, metadata = {}) {
  const vertices = coordinates.map(([x, y]) => point(x, y));
  vertices.push(vertices[0]);
  return {
    board,
    elType: 'polygon',
    __liaDgsPolygon: true,
    vertices,
    ...metadata
  };
}

function boardWithPolygons(builders) {
  const board = {
    objectsList: [],
    objects: {}
  };
  board.objectsList = builders.map((builder, index) => {
    const object = builder(board);
    board.objects['polygon-' + index] = object;
    return object;
  });
  return board;
}

function conditionSummary(config) {
  return config.conditions.map((condition) => (
    condition.kind === 'metric'
      ? condition.kind + ':' + condition.metricKind
      : condition.kind
  ));
}

test('combined quiz parser accepts German condition names', () => {
  const config = parseCombinedQuizSpec(
    'board-de;4;Konstruktion(offen;W90,W90,W90,W90);' +
    'Flaeche(12;0.05);Umfang(14;0.1)'
  );

  assert.equal(config.valid, true);
  assert.equal(config.boardId, 'board-de');
  assert.equal('error' in config, false, 'valid legacy parser shape stays additive');
  assert.equal(config.corners, 4);
  assert.deepEqual(conditionSummary(config), [
    'construction',
    'metric:area',
    'metric:perimeter'
  ]);

  const accentedArea = parseCombinedQuizSpec('board-de;4;Fl\u00e4che(12;0,05)');
  assert.equal(accentedArea.valid, true);
  assert.deepEqual(conditionSummary(accentedArea), ['metric:area']);
});

test('combined quiz parser accepts English condition names', () => {
  const config = parseCombinedQuizSpec(
    'board-en;4;Construction(open;W90,W90,W90,W90);' +
    'Area(12;0.05);Perimeter(14;0.1)'
  );

  assert.equal(config.valid, true);
  assert.equal(config.boardId, 'board-en');
  assert.equal(config.corners, 4);
  assert.deepEqual(conditionSummary(config), [
    'construction',
    'metric:area',
    'metric:perimeter'
  ]);
});

test('combined quiz parser accepts Form with localized types and exclusions', () => {
  const german = parseCombinedQuizSpec(
    'board-de;4;Form(Parallelogramm;exklusiv=Raute|Rechteck);Flaeche(18;0.05)'
  );
  assert.equal(german.valid, true);
  assert.deepEqual(conditionSummary(german), ['form', 'metric:area']);
  assert.equal(german.conditions[0].config.form, 'parallelogram');
  assert.deepEqual(german.conditions[0].config.exclusions, ['rhombus', 'rectangle']);

  const english = parseCombinedQuizSpec('board-en;4;fOrM(Rectangle;EXKLUSIV=Square)');
  assert.equal(english.valid, true);
  assert.equal(english.conditions[0].config.form, 'rectangle');
  assert.deepEqual(english.conditions[0].config.exclusions, ['square']);
});

test('combined quiz parser rejects missing and invalid conditions', () => {
  [
    'board;4',
    'board;4;Flaeche()',
    'board;4;Konstruktion(offen;)',
    'board;4;Unbekannt(12;0.05)',
    'board;4;Form(Unbekannt)',
    'board;4;Form(Raute;exklusiv=Unbekannt)',
    'board;4;Form(Raute;exklusiv=Raute)',
    'board;4;Form(Raute;modus=exakt)',
    'board;4;Form()',
    'board;2;Form(Raute)',
    'board;3;Form(Raute)'
  ].forEach((spec) => {
    assert.equal(parseCombinedQuizSpec(spec).valid, false, spec);
  });
  assert.equal(
    parseCombinedQuizSpec('board;4;Form()').error?.formConfig.error,
    'missing-form'
  );
  assert.equal(
    parseCombinedQuizSpec('board;2;Form(Raute)').error?.formConfig.error,
    'requires-four-corners'
  );
});

test('Form and area must be satisfied by the same learner polygon', () => {
  const config = parseCombinedQuizSpec(
    'board;4;Form(Raute);Flaeche(20;0.001)'
  );
  const board = boardWithPolygons([
    // A genuine rhombus with area 15.
    (owner) => polygon(owner, [[0, 0], [5, 0], [9, 3], [4, 3]]),
    // Area 20, but side lengths 5 and 4.
    (owner) => polygon(owner, [[0, 0], [5, 0], [5, 4], [0, 4]])
  ]);

  assert.equal(config.valid, true);
  assert.equal(checkCombinedQuizOnBoard(board, config), false);
  const diagnostic = evaluateCombinedQuizOnBoard(board, config, 'en');
  assert.equal(diagnostic.code, 'area-mismatch');
  assert.equal(diagnostic.polygon, board.objectsList[0]);

  const matching = polygon(board, [[0, 0], [5, 0], [8, 4], [3, 4]]);
  board.objectsList.push(matching);
  board.objects.matching = matching;
  assert.equal(checkCombinedQuizOnBoard(board, config), true);
});

test('one free rhombus satisfies Form, area, and perimeter together', () => {
  const config = parseCombinedQuizSpec(
    'board;4;Form(Rhombus);Area(20;0.001);Perimeter(20;0.001)'
  );
  const board = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [5, 0], [8, 4], [3, 4]])
  ]);

  assert.equal(config.valid, true);
  assert.equal(checkCombinedQuizOnBoard(board, config), true);
});

test('combined exclusions retain inclusive geometric semantics', () => {
  const rectangle = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [4, 0], [4, 2], [0, 2]])
  ]);
  const square = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [2, 0], [2, 2], [0, 2]])
  ]);
  const general = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [6, 0], [7.5, 3], [1.5, 3]])
  ]);
  const trapezoid = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [5, 0], [4, 2], [1, 2]])
  ]);

  assert.equal(
    checkCombinedQuizOnBoard(rectangle, parseCombinedQuizSpec(
      'board;4;Form(Parallelogramm;exklusiv=Raute)'
    )),
    true
  );
  assert.equal(
    checkCombinedQuizOnBoard(square, parseCombinedQuizSpec(
      'board;4;Form(Parallelogramm;exklusiv=Raute)'
    )),
    false
  );
  assert.equal(
    checkCombinedQuizOnBoard(general, parseCombinedQuizSpec(
      'board;4;Form(Parallelogramm;exklusiv=Raute|Rechteck);Flaeche(18;0.001)'
    )),
    true
  );
  assert.equal(
    checkCombinedQuizOnBoard(trapezoid, parseCombinedQuizSpec(
      'board;4;Form(Trapez;exklusiv=Parallelogramm)'
    )),
    true
  );
  assert.equal(
    checkCombinedQuizOnBoard(general, parseCombinedQuizSpec(
      'board;4;Form(Trapez;exklusiv=Parallelogramm)'
    )),
    false
  );
});

test('combined evaluation localizes invalid, base, excluded, and metric failures', () => {
  const bowTie = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [2, 2], [0, 2], [2, 0]])
  ]);
  const invalid = evaluateCombinedQuizOnBoard(
    bowTie,
    parseCombinedQuizSpec('board;4;Form(Trapez)'),
    'de'
  );
  assert.equal(invalid.code, 'invalid-quadrilateral');
  assert.match(invalid.message, /selbstüberschneidend/);

  const rectangle = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [4, 0], [4, 2], [0, 2]])
  ]);
  const base = evaluateCombinedQuizOnBoard(
    rectangle,
    parseCombinedQuizSpec('board;4;Form(Raute)'),
    'de'
  );
  assert.equal(base.code, 'form-mismatch');
  assert.match(base.message, /keine Raute/);

  const square = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [2, 0], [2, 2], [0, 2]])
  ]);
  const excluded = evaluateCombinedQuizOnBoard(
    square,
    parseCombinedQuizSpec('board;4;Form(Rectangle;exklusiv=Square)'),
    'en'
  );
  assert.equal(excluded.code, 'excluded-form');
  assert.match(excluded.message, /excluded shape square/);

  const metric = evaluateCombinedQuizOnBoard(
    rectangle,
    parseCombinedQuizSpec('board;4;Form(Rectangle);Area(9;0.001)'),
    'en'
  );
  assert.equal(metric.code, 'area-mismatch');
  assert.match(metric.message, /area condition/);

  const mixed = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [2, 2], [0, 2], [2, 0]]),
    (owner) => polygon(owner, [[0, 0], [4, 0], [4, 2], [0, 2]])
  ]);
  const preferredValidCandidate = evaluateCombinedQuizOnBoard(
    mixed,
    parseCombinedQuizSpec('board;4;Form(Raute)'),
    'en'
  );
  assert.equal(preferredValidCandidate.code, 'form-mismatch');
  assert.equal(preferredValidCandidate.polygon, mixed.objectsList[1]);
});

test('different polygons cannot satisfy construction and area separately', () => {
  const config = parseCombinedQuizSpec(
    'board;4;Konstruktion(offen;S4,W90);Flaeche(12;0.001)'
  );
  const board = boardWithPolygons([
    // S4 and W90 match, but the area is only 8.
    (owner) => polygon(owner, [[0, 0], [4, 0], [4, 2], [0, 2]]),
    // The area is 12, but no side has length 4.
    (owner) => {
      const side = Math.sqrt(12);
      return polygon(owner, [[0, 0], [side, 0], [side, side], [0, side]]);
    }
  ]);

  assert.equal(config.valid, true);
  assert.equal(checkCombinedQuizOnBoard(board, config), false);

  // This one polygon satisfies both predicates, so the same board now passes.
  const matching = polygon(board, [[0, 0], [4, 0], [4, 3], [0, 3]]);
  board.objectsList.push(matching);
  board.objects.matching = matching;

  assert.equal(checkCombinedQuizOnBoard(board, config), true);
});

test('one polygon can satisfy construction, area, and perimeter together', () => {
  const config = parseCombinedQuizSpec(
    'board;4;Konstruktion(offen;S4,W90);' +
    'Flaeche(12;0.001);Umfang(14;0.001)'
  );
  const board = boardWithPolygons([
    (owner) => polygon(owner, [[0, 0], [4, 0], [4, 3], [0, 3]])
  ]);

  assert.equal(config.valid, true);
  assert.equal(checkCombinedQuizOnBoard(board, config), true);
});

test('macro-managed polygons are ignored by the combined quiz', () => {
  const config = parseCombinedQuizSpec(
    'board;4;Konstruktion(offen;S4,W90);Flaeche(12;0.001)'
  );
  const board = boardWithPolygons([
    (owner) => polygon(
      owner,
      [[0, 0], [4, 0], [4, 3], [0, 3]],
      { __liaDgsMacroManaged: true }
    ),
    (owner) => polygon(
      owner,
      [[0, 0], [4, 0], [4, 3], [0, 3]],
      { __liaDgsMacroKey: 'macro:area:test' }
    )
  ]);

  assert.equal(config.valid, true);
  assert.equal(checkCombinedQuizOnBoard(board, config), false);
});

test('each combined macro definition emits one parser-stable hidden quiz', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const definitions = Array.from(
    readme.matchAll(/@CombinedQuiz_\r?\n([\s\S]*?)\r?\n@end/g)
  );

  assert.equal(definitions.length, 2);
  definitions.forEach((definition) => {
    const source = definition[1];

    assert.equal((source.match(/\[\[lia-coordinate-check\]\]/g) || []).length, 1);
    assert.equal((source.match(/\[\[!\]\]/g) || []).length, 0);
    assert.equal((source.match(/data-lia-coordinate-dynflex-guard/g) || []).length, 1);
    assert.equal((source.match(/data-lia-coordinate-quiz-anchor/g) || []).length, 1);
    assert.match(
      source,
      /data-lia-coordinate-dynflex-guard[^\r\n]*\r?\n\r?\n@2\r?\n<span[^\r\n]*data-lia-coordinate-quiz-kind="combined"[^\r\n]*>[^\r\n]*_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>\[\[lia-coordinate-check\]\]<\/span>_/
    );
    assert.equal((source.match(/data-lia-coordinate-output-marker/g) || []).length, 0);
    assert.equal((source.match(/<script\b/g) || []).length, 0);
    assert.doesNotMatch(source, /window\.__checkCombinedQuiz/);
    assert.doesNotMatch(source, /@'1/);
  });
});

test('combined quiz fixture covers a native hint and detailed solution in HTML', () => {
  const fixture = readFileSync(
    new URL('./fixtures/combinedQuizNestedSolution.md', import.meta.url),
    'utf8'
  );

  assert.match(fixture, /<div class='flex-child'>/);
  assert.match(fixture, /@GeometrieQuiz\(/);
  assert.match(fixture, /\[\[\?\]\]/);
  assert.equal((fixture.match(/^\*{16}$/gm) || []).length, 2);
});

test('README documents the complete Form API and executable rhombus example', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  [
    'Parallelogramm', 'Parallelogram',
    'Rechteck', 'Rectangle',
    'Raute', 'Rhombus',
    'Quadrat', 'Square',
    'Trapez', 'Trapezoid',
    'Drachenviereck', 'Kite'
  ].forEach((name) => assert.match(readme, new RegExp('`' + name + '`')));

  assert.match(readme, /Form\(<quadrilateralType>;exklusiv=<type>\[\|<type>\.\.\.\]\)/);
  assert.match(readme, /The only public `Form` attribute is `exklusiv`/);
  assert.match(readme, /one and the same polygon/);
  assert.match(readme, /\\min\(0\.05,\\;0\.01L_\{max\}\)/);
  assert.equal((readme.match(/id=rhombus_area/g) || []).length, 4);
  assert.equal(
    (readme.match(/Form\(Raute\);Flaeche\(20;0\.05\)/g) || []).length,
    3,
    'one compact example plus fenced and live executable examples'
  );
});
