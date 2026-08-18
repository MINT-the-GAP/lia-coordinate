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

const { isQuizResolveButton } = await import('../src/shared/quizDom.ts');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const quizFamilies = [
  ['CreatePoint_', '__checkCreatePointQuiz'],
  ['PolygonMetricQuiz_', '__checkPolygonMetricQuiz'],
  ['ConstructionQuiz_', '__checkConstructionQuiz'],
  ['CombinedQuiz_', '__checkCombinedQuiz'],
  ['Rekonstruktion_', '__checkReconstructionQuiz'],
  ['PointOnGraph_', '__checkPointGraphFromSpec'],
  ['PointsOnGraph_', '__checkPointsOnGraphFromSpec']
];

function macroBodies(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    readme.matchAll(new RegExp(`^@${escaped}\\r?\\n([\\s\\S]*?)\\r?\\n@end$`, 'gm')),
    (match) => match[1].replace(/\r\n/g, '\n').trimEnd()
  );
}

test('all seven quiz emitters are synchronized and parser-stable', () => {
  for (const [name] of quizFamilies) {
    const bodies = macroBodies(name);
    assert.equal(bodies.length, 2, `${name}: header and implementation definitions`);
    assert.equal(bodies[0], bodies[1], `${name}: both definitions stay synchronized`);

    for (const body of bodies) {
      assert.equal((body.match(/data-lia-coordinate-dynflex-guard/g) || []).length, 1, name);
      assert.equal((body.match(/data-lia-coordinate-quiz-anchor/g) || []).length, 1, name);
      assert.equal((body.match(/\[\[lia-coordinate-check\]\]/g) || []).length, 1, name);
      assert.equal((body.match(/data-lia-coordinate-output-marker/g) || []).length, 0, name);
      assert.equal((body.match(/\[\[!\]\]/g) || []).length, 0, name);
      assert.equal((body.match(/^@2$/gm) || []).length, 1, `${name}: quiz comment slot`);
      assert.match(
        body,
        /data-lia-coordinate-dynflex-guard[^\n]*\n\n@2\n<span[^\n]*data-lia-coordinate-quiz-anchor[^\n]*>[^\n]*_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>\[\[lia-coordinate-check\]\]<\/span>_$/,
        name + ': guard, comment, anchor, and native input keep their block order'
      );
      assert.doesNotMatch(body, /window\.__check/, name + ': no inline validator script');
      assert.doesNotMatch(body, /@'1/, `${name}: validator reads its spec from the DOM`);
    }
  }
});

test('legacy one-argument quiz aliases keep working and options aliases are additive', () => {
  const aliases = [
    ['Rekonstruktion', 'RekonstruktionMitOptionen'],
    ['Reconstruction', 'ReconstructionWithOptions'],
    ['PointOnGraph', 'PointOnGraphWithOptions'],
    ['PunktGraph', 'PunktGraphMitOptionen'],
    ['PointsOnGraph', 'PointsOnGraphWithOptions'],
    ['PunkteAufGraph', 'PunkteAufGraphMitOptionen']
  ];

  for (const [legacy, options] of aliases) {
    assert.equal(
      (readme.match(new RegExp(`^@${legacy}: .*\`<!-- -->\`\\)$`, 'gm')) || []).length,
      2,
      `${legacy}: one-argument wrapper injects a no-op comment`
    );
    assert.equal(
      (readme.match(new RegExp(`^@${options}: .*\`@1\`\\)$`, 'gm')) || []).length,
      2,
      `${options}: options wrapper forwards its second argument`
    );
  }
});

test('DynFlex blockification cannot bisect any expanded quiz macro', () => {
  for (const [name] of quizFamilies) {
    const expanded = macroBodies(name)[0]
      .replaceAll('@0', `dynflex-${name}`)
      .replaceAll('@1', 'board;spec')
      .replaceAll('@2', '<!-- data-hint-button="1" data-solution-button="2" -->')
      .replaceAll('@3', 'perimeter')
      .replaceAll('@4', 'de');
    const flexChild = `${expanded}\n[[?]] Hinweis\n*****************\nMusterloesung\n*****************`;
    const containsRenderedControl = /<(?:input|button)\b/i.test(flexChild);
    const parts = containsRenderedControl
      ? [flexChild]
      : flexChild
          .split(/\n[ \t]*\n+/)
          .filter((part) => part.replace(/\s+/g, '').length > 0);

    assert.equal(containsRenderedControl, true, `${name}: hidden guard triggers DynFlex's early exit`);
    assert.equal(parts.length, 1, `${name}: guarded flex child is not split`);
    assert.match(parts[0], /\[\[\?\]\] Hinweis/);
    assert.equal((parts[0].match(/^\*{17}$/gm) || []).length, 2);
    assert.equal((parts[0].match(/<div\b/g) || []).length, (parts[0].match(/<\/div>/g) || []).length);
    assert.equal((parts[0].match(/<script\b/g) || []).length, (parts[0].match(/<\/script>/g) || []).length);
  }
});

test('only LiaScript resolve controls trigger geometric finalization', () => {
  const root = {
    contains(node) { return node?.owner === this; }
  };
  const resolveControl = { owner: root };
  const resolveButton = {
    owner: root,
    closest(selector) { return selector === '.lia-quiz__resolve' ? resolveControl : null; }
  };
  const hintButton = {
    owner: root,
    closest() { return null; }
  };
  const outsideResolve = {
    owner: {},
    closest() { return { owner: {} }; }
  };

  assert.equal(isQuizResolveButton(root, resolveButton), true);
  assert.equal(isQuizResolveButton(root, hintButton), false);
  assert.equal(isQuizResolveButton(root, outsideResolve), false);

  for (const file of ['createPoint.ts', 'pointOnGraph.ts', 'pointsOnGraph.ts']) {
    const source = readFileSync(new URL(`../src/subsystems/${file}`, import.meta.url), 'utf8');
    assert.match(source, /isQuizResolveButton\(checkRoot, targetBtn\)/, file);
    assert.doesNotMatch(source, /idx\s*>=\s*1/, `${file}: hint buttons are never inferred by index`);
    assert.doesNotMatch(source, /solution\|show\|loesung/, `${file}: translated labels are not guessed`);
  }
});

test('native quiz capture writes the hidden LiaScript input before checking', () => {
  const source = readFileSync(new URL('../src/shared/quizDom.ts', import.meta.url), 'utf8');

  assert.match(source, /target\?\.closest\('\.lia-quiz__check'\)/);
  assert.match(source, /quiz\.addEventListener\('click',[\s\S]*?, true\)/);
  assert.match(source, /anchor\.closest\('\.lia-paragraph'\)/);
  assert.match(source, /\[data-lia-coordinate-quiz-input\] input\.lia-quiz__input/);
  assert.match(source, /input\.value = solved \? QUIZ_TOKEN : ''/);
  assert.match(source, /new Event\('input', \{ bubbles: true \}\)/);
  assert.match(source, /updateCoordinateQuizFeedback\(anchor, quiz, solved\)/);
  assert.match(source, /combined-quiz-spec-/);
  assert.match(source, /data-lia-coordinate-quiz-feedback/);
  assert.match(source, /feedback\.setAttribute\('role', 'status'\)/);
  assert.match(source, /feedback\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /liaCoordinateCheckBound[\s\S]*updateCoordinateQuizFeedback\(anchor, quiz, false\)/);
  assert.match(source, /MutationObserver/);
  assert.doesNotMatch(source, /output-marker|validator-output|querySelector[^\n]*output/);

  for (const [, checker] of quizFamilies) {
    assert.match(source, new RegExp(checker), checker);
  }
});

test('the full DynFlex fixture covers every quiz, hint, solution, and timer layer', () => {
  const fixture = readFileSync(
    new URL('./fixtures/dynFlexQuizFamilies.md', import.meta.url),
    'utf8'
  );

  assert.match(fixture, /lia-timer\/924ec0108780ea43e39519cabcaf4f3de8b7dee6\/README\.md/);
  assert.match(fixture, /lia-DynFlex\/9ef8f05c0eae8b51e183efbfe34c5b38e41488c8\/README\.md/);
  assert.match(fixture, /LiaTemplates\/JSXGraph@main\/README\.md/);
  assert.equal((fixture.match(/<section class="dynFlex">/g) || []).length, 1);
  assert.equal((fixture.match(/<div class="flex-child">/g) || []).length, 7);
  assert.equal((fixture.match(/data-solution-timer="1s"/g) || []).length, 7);
  assert.equal((fixture.match(/data-hint-button="1"/g) || []).length, 7);
  assert.equal((fixture.match(/data-solution-button="2"/g) || []).length, 7);
  assert.equal((fixture.match(/^\[\[\?\]\]/gm) || []).length, 7);
  assert.equal((fixture.match(/^\*{17}$/gm) || []).length, 14);
  assert.equal((fixture.match(/\)\r?\n\[\[\?\]\]/g) || []).length, 7);
});
