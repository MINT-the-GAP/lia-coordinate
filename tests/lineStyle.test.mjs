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
  applyLineStyle,
  isLineStyleOption,
  lineStyleAttributes,
  lineStyleOptionValue,
  parseLineStyle,
  parseLineStyleOptions
} = await import('../src/shared/lineStyle.ts');

test('the four public line styles map to stable JSXGraph dash values', () => {
  assert.deepEqual(lineStyleAttributes('solid'), { dash: 0 });
  assert.deepEqual(lineStyleAttributes('dashed'), { dash: 2 });
  assert.deepEqual(lineStyleAttributes('dotted'), { dash: 7 });
  assert.deepEqual(lineStyleAttributes('dashdotted'), { dash: 6 });
});

test('line-style values are case-insensitive and normalize common separators', () => {
  assert.equal(parseLineStyle(' SOLID '), 'solid');
  assert.equal(parseLineStyle('Dashed'), 'dashed');
  assert.equal(parseLineStyle('DOTTED'), 'dotted');
  assert.equal(parseLineStyle('dash-dotted'), 'dashdotted');
  assert.equal(parseLineStyle('dash dotted'), 'dashdotted');
  assert.equal(parseLineStyle('dashdot'), 'dashdotted');
});

test('unknown and empty line-style values are rejected', () => {
  for (const value of ['', 'double', 'dots', 6, null, undefined]) {
    assert.equal(parseLineStyle(value), null);
  }
});

test('linestyle is canonical and linienstil is a case-insensitive alias', () => {
  assert.equal(isLineStyleOption('linestyle=dashed'), true);
  assert.equal(isLineStyleOption(' LINESTYLE = dotted '), true);
  assert.equal(isLineStyleOption('linienstil=dashdotted'), true);
  assert.equal(lineStyleOptionValue('linestyle=solid'), 'solid');
  assert.equal(lineStyleOptionValue('Linienstil = DASHED'), 'dashed');
  assert.equal(lineStyleOptionValue('linestyle=unknown'), null);
  assert.equal(isLineStyleOption('style=dashed'), false);
  assert.equal(isLineStyleOption('design=->'), false);
});

test('option lists preserve legacy defaults and use the last valid style', () => {
  assert.equal(parseLineStyleOptions([]), 'solid');
  assert.equal(parseLineStyleOptions(['name=s', 'length=1']), 'solid');
  assert.equal(parseLineStyleOptions(['linestyle=dotted'], 'dashed'), 'dotted');
  assert.equal(
    parseLineStyleOptions(['linestyle=dotted', 'linestyle=unknown', 'linienstil=dashed']),
    'dashed'
  );
  assert.equal(parseLineStyleOptions(['linestyle=unknown'], 'dashdotted'), 'dashdotted');
});

test('applying a line style updates JSXGraph and stores the public name', () => {
  const updates = [];
  const object = {
    setAttribute(attributes) {
      updates.push(attributes);
    }
  };

  assert.equal(applyLineStyle(object, 'DASH-DOTTED'), 'dashdotted');
  assert.equal(object.__liaLineStyle, 'dashdotted');
  assert.deepEqual(updates, [{ dash: 6, lineCap: 'butt' }]);

  assert.equal(applyLineStyle(object, 'unknown'), 'solid');
  assert.equal(object.__liaLineStyle, 'solid');
  assert.deepEqual(updates.at(-1), { dash: 0, lineCap: 'butt' });
  assert.equal(applyLineStyle(null, 'dotted'), 'dotted');
});

test('a persisted DGS line style overrides an authored style on remount', () => {
  const updates = [];
  const object = {
    __liaDgsLineStyle: 'dotted',
    setAttribute(attributes) {
      updates.push(attributes);
    }
  };

  assert.equal(applyLineStyle(object, 'dashed'), 'dotted');
  assert.equal(object.__liaLineStyle, 'dotted');
  assert.deepEqual(updates, [{ dash: 7, lineCap: 'round' }]);
});

test('dotted uses round dots and switching back restores the original line cap', () => {
  const updates = [];
  const object = {
    visProp: { linecap: 'square' },
    setAttribute(attributes) {
      updates.push(attributes);
      if (attributes.lineCap) this.visProp.linecap = attributes.lineCap;
    }
  };

  applyLineStyle(object, 'dotted');
  applyLineStyle(object, 'dashed');
  assert.deepEqual(updates, [
    { dash: 7, lineCap: 'round' },
    { dash: 2, lineCap: 'square' }
  ]);
});

test('all line-like macro subsystems consume the shared line-style parser', () => {
  const expectedConsumers = [
    'distance.ts',
    'linearObjects.ts',
    'arc.ts',
    'relationObjects.ts',
    'area.ts',
    'angle.ts',
    'circle.ts',
    'tangentSector.ts',
    'plotFunction.ts',
    'plotInput.ts',
    'pointOnGraph.ts',
    'pointsOnGraph.ts',
    'schar.ts'
  ];

  for (const file of expectedConsumers) {
    const source = readFileSync(
      new URL('../src/subsystems/' + file, import.meta.url),
      'utf8'
    );
    assert.match(source, /from ['"]\.\.\/shared\/lineStyle['"]/i, file);
    assert.match(source, /parseLineStyleOptions|lineStyleOptionValue/i, file);
    assert.match(source, /applyLineStyle|lineStyleAttributes/i, file);
  }
});

test('named line-style options cannot be mistaken for legacy names, colors, or design', () => {
  const ambiguityGuards = [
    'distance.ts',
    'linearObjects.ts',
    'arc.ts',
    'relationObjects.ts',
    'tangentSector.ts',
    'plotInput.ts'
  ];

  for (const file of ambiguityGuards) {
    const source = readFileSync(
      new URL('../src/subsystems/' + file, import.meta.url),
      'utf8'
    );
    assert.match(source, /isLineStyleOption\(/, file);
  }
});

test('the DGS menu exposes and persists line style independently of design and width', () => {
  const source = readFileSync(
    new URL('../src/subsystems/dgs.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /lineStyleSelect:\s*HTMLSelectElement/);
  assert.match(source, /lineStyleSelect\.className\s*=\s*['"]lia-dgs-line-style-select['"]/);
  assert.match(source, /lineStyle:\s*['"]Linienart['"]/);
  assert.match(source, /lineStyle:\s*['"]Line style['"]/);
  assert.match(source, /['"]solid['"],\s*['"]dashed['"],\s*['"]dotted['"],\s*['"]dashdotted['"]/);
  assert.match(source, /__liaDgsLineStyle/);
  assert.match(source, /record\.lineStyle\s*=\s*getDgsLineStyle\(object\)/);
  assert.match(source, /record\.lineStyle\s*\|\|\s*['"]solid['"]/);
  assert.match(source, /persistDgsConstruction\(state,\s*recordHistory\)/);
  assert.match(source, /lineStyleSelect\.addEventListener\(['"]change['"]/);
  assert.match(source, /function addDgsExportLineStyleOption/);
  assert.match(source, /lineStyle\s*!==\s*['"]solid['"]/);
  assert.match(source, /options\.push\(['"]linestyle=['"]\s*\+\s*lineStyle\)/);
  assert.match(source, /strokeDesignField\.hidden\s*=\s*!strokeStyleObject/);
  assert.match(source, /strokeWidthField\.hidden\s*=\s*!strokeStyleObject/);

  const targetFunction = source.match(
    /function isDgsLineStyleTarget[\s\S]*?\n\}/
  )?.[0] || '';
  for (const predicate of [
    'isDgsLinearObject',
    'isDgsArc',
    'isDgsCompassArc',
    'isDgsPolygon',
    'isDgsCircle',
    'isDgsSector',
    'isDgsAngle',
    'isDgsFunction'
  ]) {
    assert.match(targetFunction, new RegExp(predicate), predicate);
  }
});

test('README documents the canonical option, alias, examples, and broad DGS scope', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /linestyle=solid\|dashed\|dotted\|dashdotted/);
  assert.match(readme, /German alias[\s\S]*?linienstil=/);
  assert.match(readme, /linestyle=dashed/);
  assert.match(readme, /linienstil=dotted/);
  assert.match(readme, /linestyle=dashdotted/);
  assert.match(readme, /segments \(including polygon sides\), rays, vectors, straight/);
  assert.match(readme, /custom and compass arcs/);
  assert.match(readme, /angle contours, circles, circular sectors, and DGS-created or/);
  assert.match(readme, /dashdotted[\s\S]*?closest portable approximation/);
  assert.match(readme, /per-side override[\s\S]*?not part of macro export/);
  assert.match(readme, /default[\s\S]*?solid[\s\S]*?is omitted/);
  assert.ok((readme.match(/linestyle=<style>/g) || []).length >= 13);
});
