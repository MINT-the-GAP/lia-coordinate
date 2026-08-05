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

test('combined quiz parser rejects missing and invalid conditions', () => {
  [
    'board;4',
    'board;4;Flaeche()',
    'board;4;Konstruktion(offen;)',
    'board;4;Unbekannt(12;0.05)'
  ].forEach((spec) => {
    assert.equal(parseCombinedQuizSpec(spec).valid, false, spec);
  });
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
    assert.match(
      source,
      /@2\r?\n_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>\[\[lia-coordinate-check\]\]<\/span>_<script>\r?\n/
    );
    assert.equal((source.match(/<script\b/g) || []).length, 1);
    assert.doesNotMatch(source, /<script\s+[^>]*>/);
    assert.doesNotMatch(source, /modify\s*=/);
    assert.match(source, /window\.__checkCombinedQuiz\('@0', ''\) === true/);
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
