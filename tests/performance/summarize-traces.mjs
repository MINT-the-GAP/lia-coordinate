import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const eventNames = ['FireAnimationFrame', 'FunctionCall', 'TimerFire', 'Layout', 'UpdateLayoutTree'];
const result = {
  scope: 'Complete CDP trace window including runProfile setup/700ms settling and 180 viewport steps. Main renderer thread only. Event families are inclusive and overlap; do not add their durations together.',
  unit: 'ms', scenarios: []
};
const before = JSON.parse(readFileSync(join(directory, 'before.json'), 'utf8'));
const after = JSON.parse(readFileSync(join(directory, 'after.json'), 'utf8'));
assert.equal(before.fixtureSha256, after.fixtureSha256);
result.fixtureSha256 = before.fixtureSha256;
result.beforeBundleSha256 = before.bundleSha256;
result.afterBundleSha256 = after.bundleSha256;
for (const scenario of before.scenarios) {
  const name = scenario.options.name;
  const entry = { name };
  for (const mode of ['before', 'after']) {
    const path = join(assets, mode + '-' + name + '.trace.json');
    const events = JSON.parse(readFileSync(path, 'utf8')).traceEvents;
    const main = events.find(event => event.name === 'thread_name' && event.args?.name === 'CrRendererMain');
    assert.ok(main, 'Missing renderer main thread in ' + path);
    entry[mode] = Object.fromEntries(eventNames.map(name => [name, { count: 0, totalMs: 0 }]));
    for (const event of events) {
      if (event.ph !== 'X' || event.pid !== main.pid || event.tid !== main.tid) continue;
      const metric = entry[mode][event.name];
      if (!metric || !Number.isFinite(event.dur)) continue;
      metric.count++;
      metric.totalMs += event.dur / 1000;
    }
    for (const metric of Object.values(entry[mode])) metric.totalMs = Math.round(metric.totalMs * 1000) / 1000;
  }
  result.scenarios.push(entry);
}
writeFileSync(join(directory, 'trace-summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log('Trace summary written to tests/performance/trace-summary.json');
