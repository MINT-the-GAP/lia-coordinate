import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  }
});

const { checkConstructionOnBoard, parseConstructionQuizSpec, polygonMatchesConstruction } =
  await import('../src/subsystems/constructionQuiz.ts');
const { segmentConstructionCandidates } = await import('../src/shared/constructionSegments.ts');
const { checkCombinedQuizOnBoard, parseCombinedQuizSpec } = await import('../src/subsystems/combinedQuiz.ts');

test('each construction macro definition emits one parser-stable hidden quiz', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const definitions = Array.from(
    readme.matchAll(/@ConstructionQuiz_\r?\n([\s\S]*?)\r?\n@end/g)
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
      /data-lia-coordinate-dynflex-guard[^\r\n]*\r?\n\r?\n@2\r?\n<span[^\r\n]*data-lia-coordinate-quiz-kind="construction"[^\r\n]*>[^\r\n]*_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>\[\[lia-coordinate-check\]\]<\/span>_/
    );
    assert.equal((source.match(/data-lia-coordinate-output-marker/g) || []).length, 0);
    assert.equal((source.match(/<script\b/g) || []).length, 0);
    assert.doesNotMatch(source, /window\.__checkConstructionQuiz/);
    assert.doesNotMatch(source, /@'1/);
  });
});

test('construction quiz fixture covers adjacent hint and detailed solution in HTML', () => {
  const fixture = readFileSync(
    new URL('./fixtures/constructionQuizNestedSolution.md', import.meta.url),
    'utf8'
  );

  assert.match(fixture, /<div class='flex-child'>/);
  assert.match(fixture, /@KonstruktionQuiz\(/);
  assert.match(fixture, /;3;offen;W165;winkeltoleranz=1/);
  assert.match(fixture, /data-solution-timer="180s"/);
  assert.match(fixture, /data-solution-timer-start="oncheck"/);
  assert.match(fixture, /data-hint-button="2"/);
  assert.match(fixture, /data-solution-button="3"/);
  assert.match(fixture, /\)\r?\n\[\[\?\]\]/);
  assert.equal((fixture.match(/^\*{17}$/gm) || []).length, 2);
});


function point(x, y) {
  return { x, y, X() { return this.x; }, Y() { return this.y; } };
}
function board() { return { objects: {}, objectsList: [] }; }
function segment(owner, a, b, metadata = {}) {
  const object = { board: owner, elType: 'segment', __liaDgsSegment: true, point1: a, point2: b, ...metadata };
  owner.objects['s' + owner.objectsList.length] = object;
  owner.objectsList.push(object);
  return object;
}
function chain(owner, coordinates, order, reverse = false) {
  const points = coordinates.map(([x, y]) => point(x, y));
  const indices = order || points.map((_, i) => i);
  const sides = indices.map(i => {
    const a = points[i], b = points[(i + 1) % points.length];
    return segment(owner, reverse ? b : a, reverse ? a : b);
  });
  return { points, sides };
}
function check(owner, properties, corners = 3, mode = 'offen', options = '') {
  return checkConstructionOnBoard(owner,
    parseConstructionQuizSpec(`board;${corners};${mode};${properties}${options}`));
}
const triangle = [[0, 0], [4, 0], [4, 3]];

test('AB, BC and CA satisfy triangle side and angle conditions without creating a polygon', () => {
  const owner = board();
  const { sides, points } = chain(owner, triangle);
  assert.equal(check(owner, 'S3,S4,S5,W90'), true);
  assert.equal(check(owner, 'S3,S4,S6'), false);
  assert.equal(check(owner, 'W60,W60,W60'), false);
  assert.equal(check(owner, 'S4,S4'), false, 'one side cannot satisfy two conditions');
  assert.equal(check(owner, 'S4,W90,S3', 3, 'fest'), true);
  assert.equal(check(owner, 'S3,W90,S4', 3, 'fest'), false, 'fixed order is counterclockwise');
  assert.equal(check(owner, 'S4', 4), false);
  assert.deepEqual(owner.objectsList, sides, 'checking creates no board objects');
  assert.deepEqual(points.map(p => [p.x, p.y]), triangle, 'checking does not move endpoints');
});

test('segment order, individual direction, duplicate board registries and endpoint names do not matter', () => {
  for (const order of [[0,1,2], [2,0,1], [1,2,0], [0,2,1], [1,0,2], [2,1,0]]) {
    for (let mask = 0; mask < 8; mask++) {
      const owner = board();
      const { sides } = chain(owner, triangle, order);
      sides.forEach((side, i) => {
        if (mask & (1 << i)) [side.point1, side.point2] = [side.point2, side.point1];
      });
      assert.equal(check(owner, 'S4,W90,S3', 3, 'fest'), true);
      assert.equal([...segmentConstructionCandidates(owner, 3, 0.05)].length, 1);
    }
  }
});

test('fixed features of segment chains match polygons for every orientation and constraint prefix', () => {
  for (const coordinates of [triangle, [[0,0],[0,3],[4,3]], [[0,0],[5,0],[4,3],[0,2]]]) {
    const owner = board();
    const { points } = chain(owner, coordinates);
    const polygon = { board:owner, __liaDgsPolygon:true, vertices:points };
    const candidate = [...segmentConstructionCandidates(owner, points.length, 0)][0];
    for (const constraints of ['S4,W90,S3', 'S3,W90,S4', 'W90,S4', 'S4,S3,W53.13', 'S5,W36.87', 'W90,W90']) {
      const config = parseConstructionQuizSpec(`board;${points.length};fest;${constraints}`);
      assert.equal(polygonMatchesConstruction(candidate, config), polygonMatchesConstruction(polygon, config));
    }
  }
});

test('distinct endpoints at the same coordinates and small pen gaps close the chain', () => {
  const owner = board();
  segment(owner, point(0,0), point(4,0));
  segment(owner, point(4.03,0), point(4.03,3));
  segment(owner, point(4,3), point(0.02,0));
  assert.equal(check(owner, 'S3,S4,S5,W90'), true);
  assert.equal(check(owner, 'S3,S4,S5,W90', 3, 'offen', ';streckentoleranz=0.01'), false);
  const exact = board();
  segment(exact, point(0,0), point(4,0));
  segment(exact, point(4,0), point(4,3));
  segment(exact, point(4,3), point(0,0));
  assert.equal(check(exact, 'S3,S4,S5', 3, 'offen', ';streckentoleranz=0'), true);
});

test('joining endpoints cannot shorten an incorrect drawn side into the length tolerance', () => {
  const owner = board();
  segment(owner, point(0,0), point(4.08,0));
  segment(owner, point(4.04,0), point(4.04,3));
  segment(owner, point(4.04,3), point(-0.04,0));
  assert.equal([...segmentConstructionCandidates(owner, 3, 0.05)].length, 1);
  assert.equal(check(owner, 'S4'), false, 'measure the actual 4.08 side, not a merged 4.04 side');
});

test('open, collinear and crossed chains are rejected', () => {
  const open = board();
  segment(open, point(0,0), point(4,0));
  segment(open, point(4,0), point(4,3));
  assert.equal(check(open, 'S4'), false);
  segment(open, point(4,3), point(0.1,0));
  assert.equal(check(open, 'S4'), false, 'gap exceeds the configured tolerance');
  const flat = board(); chain(flat, [[0,0],[2,0],[4,0]]);
  assert.equal(check(flat, 'S2'), false);
  const crossed = board(); chain(crossed, [[0,0],[4,4],[0,4],[4,0]]);
  assert.equal(check(crossed, 'S4', 4), false);
});

test('additional construction lines and multiple figures do not prevent matching one closed chain', () => {
  const owner = board();
  const { points } = chain(owner, triangle);
  segment(owner, points[0], point(-5,7));
  chain(owner, [[10,0],[12,0],[11,1]]);
  segment(owner, points[0], points[1]);
  assert.equal(check(owner, 'S3,S4,S5,W90'), true);
  assert.equal(check(owner, 'S3,S4,S2'), false, 'lengths cannot be collected from different cycles');
});

test('a rectangle boundary is still found when diagonals are present', () => {
  const owner = board();
  const { points } = chain(owner, [[0,0],[4,0],[4,3],[0,3]]);
  segment(owner, points[0], points[2]);
  segment(owner, points[1], points[3]);
  assert.equal(check(owner, 'S4,W90,S3,W90,S4,W90,S3,W90', 4, 'fest'), true);
});

test('preset segments, polygon borders, non-segments, foreign and invalid objects cannot complete a chain', () => {
  for (const metadata of [
    { __liaDgsMacroManaged:true }, { __liaDgsMacroKey:'macro:distance' },
    { __liaDgsPolygonBorder:true }, { elType:'line' }, { __liaDgsSegment:false },
    { board:{} }, { point1:point(NaN,0) }, { point1:point(0,0), point2:point(0,0) },
  ]) {
    const owner = board();
    const { sides } = chain(owner, triangle);
    Object.assign(sides[2], metadata);
    assert.equal(check(owner, 'S3,S4,S5'), false, JSON.stringify(metadata));
  }
});

test('moving points and removing or restoring a segment are evaluated live', () => {
  const owner = board();
  const { points, sides } = chain(owner, triangle);
  assert.equal(check(owner, 'S3,S4,S5,W90'), true);
  points[2].y = 4;
  assert.equal(check(owner, 'S3,S4,S5,W90'), false);
  points[2].y = 3;
  assert.equal(check(owner, 'S3,S4,S5,W90'), true);
  owner.objectsList.pop(); delete owner.objects.s2;
  assert.equal(check(owner, 'S3,S4,S5,W90'), false);
  owner.objectsList.push(sides[2]);
  assert.equal(check(owner, 'S3,S4,S5,W90'), true);
});

test('combined construction, form, area and perimeter all refer to the same segment cycle', () => {
  const owner = board();
  chain(owner, [[0,0],[4,0],[4,3],[0,3]]);
  const config = parseCombinedQuizSpec('board;4;Konstruktion(offen;S3,S4,W90);Form(Rechteck);Flaeche(12;0.001);Umfang(14;0.001)');
  assert.equal(checkCombinedQuizOnBoard(owner, config), true);
  const mixed = board();
  chain(mixed, [[0,0],[4,0],[4,2],[0,2]]);
  const side = Math.sqrt(12);
  chain(mixed, [[10,0],[10+side,0],[10+side,side],[10,side]]);
  assert.equal(checkCombinedQuizOnBoard(mixed, config), false);
});

test('multiple combined construction conditions use the stricter closure tolerance', () => {
  const owner = board();
  segment(owner, point(0,0), point(4,0));
  segment(owner, point(4.03,0), point(4.03,3));
  segment(owner, point(4,3), point(0,0));
  const config = parseCombinedQuizSpec('board;3;Konstruktion(offen;S4);Konstruktion(offen;W90;streckentoleranz=0)');
  assert.equal(checkCombinedQuizOnBoard(owner, config), false);
});


test('endpoint tolerance cannot turn collinear drawn sides into a corner', () => {
  const owner = board();
  segment(owner, point(0,0), point(2,0));
  segment(owner, point(2,0.04), point(4,0.04));
  segment(owner, point(4,0), point(0,0));
  assert.equal(check(owner, 'S2'), false);
});

test('concave segment chains retain reflex interior angles', () => {
  const owner = board();
  chain(owner, [[0,0],[4,0],[4,4],[2,2],[0,4]], [3,1,4,0,2], true);
  assert.equal(check(owner, 'W270,S4', 5), true);
  assert.equal(check(owner, 'W90,W90,W90,W90,W90', 5), false);
});
