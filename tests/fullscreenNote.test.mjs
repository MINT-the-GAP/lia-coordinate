import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  },
  load(url, context, next) {
    const loaded = next(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const {
  fullscreenNoteLabels,
  fullscreenNoteSourceNodes
} = await import('../src/subsystems/fullscreenNote.ts');
const { eventTargetsBoardUi } = await import('../src/shared/boardUiEvents.ts');

test('fullscreen-note labels are localized', () => {
  assert.deepEqual(fullscreenNoteLabels('de'), {
    title: 'Vollbildnotizen',
    show: 'Vollbildnotizen anzeigen',
    hide: 'Vollbildnotizen ausblenden'
  });
  assert.deepEqual(fullscreenNoteLabels('en-US'), {
    title: 'Fullscreen notes',
    show: 'Show fullscreen notes',
    hide: 'Hide fullscreen notes'
  });
});

test('fullscreen-note source collection preserves every rendered sibling in order', () => {
  const parent = {};
  const start = { parentNode: parent };
  const whitespace = { parentNode: parent };
  const paragraph = { parentNode: parent };
  const list = { parentNode: parent };
  const end = { parentNode: parent };
  start.nextSibling = whitespace;
  whitespace.nextSibling = paragraph;
  paragraph.nextSibling = list;
  list.nextSibling = end;
  end.nextSibling = null;

  assert.deepEqual(fullscreenNoteSourceNodes(start, end), [whitespace, paragraph, list]);
  assert.deepEqual(fullscreenNoteSourceNodes(start, { parentNode: {} }), []);
  list.nextSibling = null;
  assert.deepEqual(fullscreenNoteSourceNodes(start, end), []);
});

test('README exposes synchronized German and English block macros without hiding the source content', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const bodies = [...readme.matchAll(/^@FullscreenNote_\r?\n([\s\S]*?)\r?\n@end$/gm)]
    .map(match => match[1].replace(/\r\n/g, '\n'));
  const tick = String.fromCharCode(96);
  const triple = tick.repeat(3);
  const germanAlias = '@Vollbildnotiz: @FullscreenNote_(@uid,' + tick + '@0' + tick +
    ',' + triple + '@1' + triple + ',de)';
  const englishAlias = '@FullscreenNote: @FullscreenNote_(@uid,' + tick + '@0' + tick +
    ',' + triple + '@1' + triple + ',en)';

  assert.equal(readme.split(germanAlias).length - 1, 2);
  assert.equal(readme.split(englishAlias).length - 1, 2);
  assert.equal(bodies.length, 2, 'header and implementation macro must both exist');
  assert.equal(new Set(bodies).size, 1, 'both macro copies must stay synchronized');

  const body = bodies[0];
  const lines = body.split('\n');
  assert.match(lines[0], /^<div id="fullscreen-note-start-@0" class="lia-fullscreen-note-start" data-board-id="@1" data-language="@3" hidden aria-hidden="true"><\/div>$/);
  assert.equal(lines.at(-1), '<div id="fullscreen-note-end-@0" class="lia-fullscreen-note-end" hidden aria-hidden="true"></div>');
  assert.ok(body.indexOf('@2') > body.indexOf('lia-fullscreen-note-start'));
  assert.ok(body.indexOf('@2') < body.indexOf('lia-fullscreen-note-end'));
  assert.doesNotMatch(lines[0], /data-(?:content|markdown|text)=/);
  assert.match(readme, /@Vollbildnotiz\([^\n]+\$f\(x\)=2x\+1\$/);
  assert.match(readme, /@Vollbildnotiz\(`ex_fullscreen_note`,```\*\*Aufgabe:\*\*[\s\S]+Steigung\.```\)/);
});

test('fullscreen-note UI is recognized as board UI and uses the fullscreen-only height contract', () => {
  const bar = {
    closest(selector) {
      return selector.includes('.lia-dgs-fullscreen-note-bar') ? this : null;
    }
  };
  assert.equal(eventTargetsBoardUi({ target: bar, composedPath: () => [bar] }), true);

  const source = readFileSync(new URL('../src/subsystems/fullscreenNote.ts', import.meta.url), 'utf8');
  assert.match(source, /max-height:\s*35dvh/);
  assert.match(source, /translateY\(calc\(100% - 16px\)\)/);
  assert.match(source, /toggle-label/);
  assert.match(source, /toggle::before,/);
  assert.match(source, /toggle::after/);
  assert.match(source, /toggle-icon::before/);
  assert.match(source, /\[data-fullscreen="1"\]/);
  assert.match(source, /overscroll-behavior:\s*contain/);
  assert.match(source, /__refreshFullscreenNotes/);
});
