import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
