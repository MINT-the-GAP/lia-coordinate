import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Download immutable third-party test dependencies, never the coordinate bundle under test.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const runtime = process.env.LIASCRIPT_RUNTIME || join(tmpdir(), 'lia-coordinate-webexport', 'course');
const manifest = JSON.parse(readFileSync(join(root, 'tests/performance/assets.json'), 'utf8').replace(/^\uFEFF/, ''));
const extras = [
  {
    file: 'board-mode.js',
    url: 'https://raw.githubusercontent.com/MINT-the-GAP/lia-board-mode/5c473bd8c99a1bc052b39c073bb06c747bb932ee/dist/index.js',
    sha256: 'e2b5b0a94af7ef31ffd0e30b222a5da21fdf4a7d2f69ee945df419dc01a3136b'
  },
  {
    file: 'annotation.js',
    url: 'https://raw.githubusercontent.com/MINT-the-GAP/lia-annotation/d7be96c56ff84e50df4341632b448db3396d226e/dist/index.js',
    sha256: 'd2173938ece888e5b0ea51a792c5a05e04b4df9720f1b54ed8194b2a6cd85607'
  }
];
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  assert.ok(response.ok, `Download failed: ${url} (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
mkdirSync(assets, { recursive: true });
await Promise.all([...manifest.assets, ...extras].map(async asset => {
  const target = join(assets, asset.file);
  if (!existsSync(target)) {
    let bytes = await download(asset.url);
    if (asset.lineEndings === 'crlf') bytes = Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
    assert.equal(hash(bytes), asset.sha256, `Downloaded asset checksum mismatch: ${asset.file}`);
    writeFileSync(target, bytes);
  }
  assert.equal(hash(readFileSync(target)), asset.sha256, `Cached asset checksum mismatch: ${target}`);
}));

const runtimeChecks = {
  'index.e8fe43e0.js': '256631ea5886e132bdb0dedf052533ddc16a7b1305a28eb846e5eb857cb40340',
  'index.dbe3fe41.js': '63d6d68a819c1ecc5d013bb88c2989d7e016d62773f482e0a6ee5e0b48f53118',
  'index.7e0b4fd7.css': '2d5cb87560d7c7ba792ba3a6ac80375d83908621172a24822307b75a7ebc31b3'
};
if (!existsSync(join(runtime, 'index.html'))) {
  const archive = join(assets, 'exporter-2.6.32--0.16.10.tgz');
  const bytes = existsSync(archive) ? readFileSync(archive) : await download(
    'https://registry.npmjs.org/@liascript/exporter/-/exporter-2.6.32--0.16.10.tgz');
  assert.equal(hash(bytes, 'sha512', 'base64'),
    'oZqya+C+SPHl/3V2uoCaoOPBcOwIOY1Bx8317M23n3UpVPeVC0tvN00iEpWRY6XHIWzsvyKaLR+OuDX2Lpqcbg==',
    'Exporter package integrity mismatch');
  if (!existsSync(archive)) writeFileSync(archive, bytes);
  mkdirSync(runtime, { recursive: true });
  const unpacked = spawnSync('tar', ['-xzf', archive, '-C', runtime, '--strip-components=4', 'package/dist/assets/web'], {
    windowsHide: true, encoding: 'utf8'
  });
  assert.equal(unpacked.status, 0, `Cannot unpack runtime (install tar): ${unpacked.error || unpacked.stderr}`);
  const indexPath = join(runtime, 'index.html');
  const index = readFileSync(indexPath, 'utf8');
  writeFileSync(indexPath, index.replace('</head>',
    '<script>window.LIA=window.LIA||{};window.LIA.defaultCourseURL="/course.md"</script></head>'));
}
for (const [file, sha256] of Object.entries(runtimeChecks)) {
  assert.equal(hash(readFileSync(join(runtime, file))), sha256, `Unexpected LiaScript runtime: ${file}`);
}
console.log('SCHAR_ASSETS_READY', JSON.stringify({ assets, runtime, exporter: '2.6.32--0.16.10' }));
