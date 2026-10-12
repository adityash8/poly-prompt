const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { checkArtifacts } = require('./prebuilt-artifact-check.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-prompt-prebuilt-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'output');
  const next = path.join(directory, 'app/.next');
  function write(name, value) {
    const file = path.join(directory, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file;
  }
  write('output/config.json', { version: 3 });
  const config = write('output/functions/api/run.func/.vc-config.json', { runtime: 'nodejs22.x',
    filePathMap: { 'app/server.js': '/vercel/path0/app/server.js' } });
  write('output/functions/api/run.func/server.js', '');
  write('app/.next/server/app/api/run/route.js.nft.json', { version: 1, files: ['../../../../runtime.js'] });
  write('app/.next/required-server-files.json', { files: ['runtime.js'] });
  return { directory, output, next, config, write };
}

test('clean nested function maps, build traces and legitimate function aliases pass', t => {
  const state = fixture(t);
  fs.symlinkSync('run.func', path.join(state.output, 'functions/api/replay.func'));
  state.write('output/functions/nested/second.func/.vc-config.json', { runtime: 'edge' });
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, true); assert.equal(result.functionConfigs, 2);
  assert.equal(result.functionAliases, 1); assert.equal(result.traceManifests, 2);
  const alias = path.join(state.directory, 'artifact-alias'); fs.symlinkSync(state.output, alias);
  assert.equal(checkArtifacts(alias, state.next).ok, true);
});

for (const side of ['key', 'target']) test(`private path in a nested filePathMap ${side} fails without an ordinary environment file`, t => {
  const state = fixture(t);
  const key = side === 'key' ? 'polyprompt/.env.local' : 'app/server.js';
  const target = side === 'target' ? '/vercel/path0/polyprompt/.env.local.before-startup-delivery' : '/vercel/path0/app/server.js';
  state.write('output/functions/deep/another.func/.vc-config.json', { filePathMap: { [key]: target } });
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.functionConfigs, 2);
  assert.equal(result.violations.environmentPaths, 0);
  assert.equal(result.violations[side === 'key' ? 'mapKeys' : 'mapTargets'], 1);
});

test('all nested maps are inspected and Windows-style private paths are rejected', t => {
  const state = fixture(t);
  for (let index = 0; index < 5; index++) state.write(`output/functions/deep/${index}.func/.vc-config.json`, {
    filePathMap: { 'polyprompt\\.env.local': 'C:\\build\\polyprompt\\.env.local.before-startup-delivery' } });
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.functionConfigs, 6);
  assert.equal(result.violations.mapKeys, 5); assert.equal(result.violations.mapTargets, 5);
});

test('ordinary environment files and private directories fail without reading their contents', t => {
  const state = fixture(t);
  state.write('output/functions/api/run.func/.env.local', '');
  state.write('output/.env-backup/private/.vc-config.json', 'This is deliberately not JSON');
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.environmentPaths, 2);
});

test('environment-named symlink paths fail even when their target is ordinary code', t => {
  const state = fixture(t);
  fs.symlinkSync('server.js', path.join(state.output, 'functions/api/run.func/.env.local'));
  assert.equal(checkArtifacts(state.output, state.next).violations.environmentPaths, 1);
});

test('private symlink targets fail even when dangling and named like a function alias', t => {
  const state = fixture(t);
  fs.symlinkSync('../../.env.local.before-startup-delivery', path.join(state.output, 'functions/api/private.func'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.linkTargets, 1);
  assert.equal(result.functionAliases, 0);
});

test('internal metadata symlinks are inspected and private links cannot escape through an alias', t => {
  const state = fixture(t);
  const linked = state.write('output/metadata.json', { filePathMap: { 'app/.env.production': '/vercel/path0/app/server.js' } });
  fs.unlinkSync(state.config); fs.symlinkSync(path.relative(path.dirname(state.config), linked), state.config);
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.mapKeys, 1);
});

test('a symlink chain resolving to an environment file fails without reading it', t => {
  const state = fixture(t);
  state.write('output/.env.backup', '');
  fs.symlinkSync('.env.backup', path.join(state.output, 'intermediate.js'));
  fs.symlinkSync('../../intermediate.js', path.join(state.output, 'functions/api/indirect.func'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.linkTargets, 2);
});

test('external and broken symlinks fail while function aliases stay valid', t => {
  const state = fixture(t);
  const outside = state.write('outside/runtime.js', '');
  fs.symlinkSync(outside, path.join(state.output, 'external.js'));
  fs.symlinkSync('absent.func', path.join(state.output, 'functions/api/broken.func'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.externalLinks, 1); assert.equal(result.violations.brokenLinks, 1);
});

test('an external symlink hop returning into the artifact fails', t => {
  const state = fixture(t);
  const intermediate = path.join(state.directory, 'outside-link');
  fs.symlinkSync(path.join(state.output, 'functions/api/run.func/server.js'), intermediate);
  fs.symlinkSync(intermediate, path.join(state.output, 'round-trip.js'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.externalLinks, 1);
});

test('parent segments cannot erase an external intermediate symlink hop', t => {
  const state = fixture(t);
  state.write('output/server.js', '');
  fs.mkdirSync(path.join(state.directory, 'outside/child'), { recursive: true });
  fs.symlinkSync('outside/child', path.join(state.directory, 'outside-link'));
  fs.symlinkSync('../output', path.join(state.directory, 'outside/output'));
  fs.symlinkSync('../outside-link/../output/server.js', path.join(state.output, 'round-trip.js'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.externalLinks, 1);
});

for (const kind of ['directory', 'file']) test(`a function alias to an ordinary ${kind} needs its own function config`, t => {
  const state = fixture(t);
  if (kind === 'directory') fs.mkdirSync(path.join(state.output, 'ordinary'));
  else state.write('output/ordinary', '');
  fs.symlinkSync('../../ordinary', path.join(state.output, 'functions/api/incomplete.func'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.missingConfigs, 1);
  assert.equal(result.functionAliases, 0); assert.equal(result.functionConfigs, 1);
});

test('internal parent segments and absolute links through canonical or requested root aliases pass', t => {
  const state = fixture(t);
  const rootAlias = path.join(state.directory, 'artifact-alias'); fs.symlinkSync(state.output, rootAlias);
  const server = 'functions/api/run.func/server.js';
  fs.symlinkSync('functions/api/run.func/../run.func/server.js', path.join(state.output, 'relative.js'));
  fs.symlinkSync(path.join(fs.realpathSync(state.output), server), path.join(state.output, 'canonical.js'));
  fs.symlinkSync(path.join(state.output, server), path.join(state.output, 'requested.js'));
  fs.symlinkSync(path.join(rootAlias, server), path.join(state.output, 'aliased-root.js'));
  const result = checkArtifacts(rootAlias, state.next);
  assert.equal(result.ok, true); assert.equal(result.symlinks, 4);
  assert.equal(result.functionConfigs, 1); assert.equal(result.traceManifests, 2);
});

test('parent segments cannot erase a non-directory component', t => {
  const state = fixture(t);
  fs.symlinkSync('server.js/../server.js', path.join(state.output, 'functions/api/run.func/broken.js'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.brokenLinks, 1);
});

test('cyclic internal symlinks fail within a bounded scan', t => {
  const state = fixture(t);
  fs.symlinkSync('second.js', path.join(state.output, 'first.js'));
  fs.symlinkSync('first.js', path.join(state.output, 'second.js'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.brokenLinks, 2);
});

test('configured function aliases reuse physical metadata and reference counts', t => {
  const state = fixture(t);
  state.write('output/ordinary/.vc-config.json', { filePathMap: { 'app/.env.backup': 'app/.env.backup' } });
  fs.symlinkSync('../../ordinary', path.join(state.output, 'functions/api/first.func'));
  fs.symlinkSync('first.func', path.join(state.output, 'functions/api/second.func'));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.functionAliases, 2);
  assert.equal(result.functionConfigs, 2); assert.equal(result.physicalFunctions, 1);
  assert.equal(result.violations.mapKeys, 1); assert.equal(result.violations.mapTargets, 1);
  assert.equal(result.violations.missingConfigs, 0); assert.equal(result.traceManifests, 2);
});

for (const [name, value] of [['null', null], ['array', []], ['string', 'invalid metadata'],
  ['null map', { filePathMap: null }], ['array map', { filePathMap: [] }]]) test(`malformed function metadata (${name}) fails closed with sanitized CLI diagnostics`, t => {
  const state = fixture(t);
  fs.writeFileSync(state.config, JSON.stringify(value));
  fs.symlinkSync('run.func', path.join(state.output, 'functions/api/replay.func'));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'prebuilt-artifact-check.cjs'), state.output, state.next], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { ok: false, scanComplete: false });
});

test('every physical function needs its own config even when another config exists', t => {
  const state = fixture(t);
  state.write('output/functions/nested/incomplete.func/server.js', '');
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.missingConfigs, 1);
});

test('an unrelated config cannot substitute for a physical function config', t => {
  const state = fixture(t);
  fs.unlinkSync(state.config);
  state.write('output/unrelated/.vc-config.json', { filePathMap: {} });
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.missingConfigs, 1);
});

for (const missing of ['NFT', 'server-files']) test(`the ${missing} manifest family cannot be replaced by the other`, t => {
  const state = fixture(t);
  const name = missing === 'NFT' ? 'server/app/api/run/route.js.nft.json' : 'required-server-files.json';
  fs.unlinkSync(path.join(state.next, name));
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.missingTraces, 1);
});

test('NFT and required-server-files references to environment backups fail', t => {
  const state = fixture(t);
  state.write('app/.next/server/nested/route.js.nft.json', { version: 1, files: ['../../.env.local.before-startup-delivery'] });
  state.write('app/.next/required-server-files.json', { files: ['.env.production', 'runtime.js'] });
  const result = checkArtifacts(state.output, state.next);
  assert.equal(result.ok, false); assert.equal(result.traceManifests, 3); assert.equal(result.violations.traceReferences, 2);
});

test('missing artifact/config/trace roots cannot report a successful check', t => {
  const state = fixture(t);
  fs.unlinkSync(state.config);
  assert.equal(checkArtifacts(state.output, state.next).violations.missingConfigs, 1);
  const result = checkArtifacts(path.join(state.directory, 'absent'), path.join(state.directory, 'also-absent'));
  assert.equal(result.ok, false); assert.equal(result.violations.missingRoots, 2);
  assert.equal(result.violations.missingTraces, 2);
});

for (const side of ['artifact', 'Next']) test(`a nonexistent component before a parent segment invalidates the supplied ${side} root`, t => {
  const state = fixture(t);
  const output = side === 'artifact' ? state.directory + '/nonexistent/../output' : state.output;
  const next = side === 'Next' ? state.directory + '/app/nonexistent/../.next' : state.next;
  const result = checkArtifacts(output, next);
  assert.equal(result.ok, false); assert.equal(result.violations.missingRoots, 1);
  if (side === 'artifact') assert.equal(result.physicalFunctions, 0);
  else { assert.equal(result.nftManifests, 0); assert.equal(result.violations.missingTraces, 2); }
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'prebuilt-artifact-check.cjs'), output, next], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.equal(cli.stderr, '');
  assert.equal(JSON.parse(cli.stdout).violations.missingRoots, 1);
  assert(!cli.stdout.includes(state.directory)); assert(!cli.stdout.includes('nonexistent'));
});

test('existing directory components before parent segments remain valid in both supplied roots', t => {
  const state = fixture(t);
  fs.mkdirSync(path.join(state.directory, 'child')); fs.mkdirSync(path.join(state.directory, 'app/child'));
  const output = state.directory + '/child/../output';
  const next = state.directory + '/app/child/../.next';
  const result = checkArtifacts(output, next);
  assert.equal(result.ok, true); assert.equal(result.functionConfigs, 1); assert.equal(result.traceManifests, 2);
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'prebuilt-artifact-check.cjs'), 'child/../output', 'app/child/../.next'], { cwd: state.directory, encoding: 'utf8' });
  assert.equal(cli.status, 0); assert.equal(JSON.parse(cli.stdout).ok, true); assert.equal(cli.stderr, '');
});

for (const side of ['artifact', 'Next']) test(`a symlink before a parent segment selects the actual ${side} root for scanning`, t => {
  const state = fixture(t);
  fs.mkdirSync(path.join(state.directory, 'actual/child'), { recursive: true });
  fs.symlinkSync('actual/child', path.join(state.directory, 'shortcut'));
  if (side === 'artifact') state.write('actual/output/functions/run.func/.vc-config.json', { filePathMap: { 'app/.env.backup': 'app/server.js' } });
  else {
    state.write('actual/app/.next/server/route.js.nft.json', { files: ['.env.backup'] });
    state.write('actual/app/.next/required-server-files.json', { files: ['runtime.js'] });
  }
  const output = side === 'artifact' ? state.directory + '/shortcut/../output' : state.output;
  const next = side === 'Next' ? state.directory + '/shortcut/../app/.next' : state.next;
  const result = checkArtifacts(output, next);
  assert.equal(result.ok, false); assert.equal(result.violations.missingRoots, 0);
  assert.equal(result.violations[side === 'artifact' ? 'mapKeys' : 'traceReferences'], 1);
});

test('required-server-files must exist in the actual Next root after symlink and parent traversal', t => {
  const state = fixture(t);
  fs.mkdirSync(path.join(state.directory, 'actual/child'), { recursive: true });
  fs.symlinkSync('actual/child', path.join(state.directory, 'shortcut'));
  state.write('actual/app/.next/server/route.js.nft.json', { files: ['runtime.js'] });
  const result = checkArtifacts(state.output, state.directory + '/shortcut/../app/.next');
  assert.equal(result.ok, false); assert.equal(result.nftManifests, 1);
  assert.equal(result.violations.missingRoots, 0); assert.equal(result.violations.missingTraces, 1);
});

test('the lexical counterpart of a supplied root cannot authorize an external absolute link hop', t => {
  const state = fixture(t);
  fs.mkdirSync(path.join(state.directory, 'actual/child'), { recursive: true });
  fs.symlinkSync('actual/child', path.join(state.directory, 'shortcut'));
  state.write('actual/output/functions/run.func/.vc-config.json', { filePathMap: {} });
  state.write('actual/output/functions/run.func/server.js', '');
  fs.symlinkSync(state.output + '/../actual/output/functions/run.func/server.js', path.join(state.directory, 'actual/output/round-trip.js'));
  const result = checkArtifacts(state.directory + '/shortcut/../output', state.next);
  assert.equal(result.ok, false); assert.equal(result.violations.externalLinks, 1);
});

for (const side of ['artifact', 'Next']) test(`a valid supplied ${side} root can traverse a symlink and parent segment without a lexical counterpart`, t => {
  const state = fixture(t);
  fs.mkdirSync(path.join(state.directory, 'actual/child'), { recursive: true });
  fs.symlinkSync('actual/child', path.join(state.directory, 'shortcut'));
  if (side === 'artifact') state.write('actual/only-actual/output/functions/run.func/.vc-config.json', { filePathMap: {} });
  else {
    state.write('actual/only-actual/.next/server/route.js.nft.json', { files: ['runtime.js'] });
    state.write('actual/only-actual/.next/required-server-files.json', { files: ['runtime.js'] });
  }
  const output = side === 'artifact' ? state.directory + '/shortcut/../only-actual/output' : state.output;
  const next = side === 'Next' ? state.directory + '/shortcut/../only-actual/.next' : state.next;
  const result = checkArtifacts(output, next);
  assert.equal(result.ok, true); assert.equal(result.functionConfigs, 1); assert.equal(result.traceManifests, 2);
});

test('CLI works from a project or app directory and emits aggregate failure diagnostics only', t => {
  const state = fixture(t);
  const checker = path.join(__dirname, 'prebuilt-artifact-check.cjs');
  for (const cwd of [state.directory, path.join(state.directory, 'app')]) {
    const result = spawnSync(process.execPath, [checker, path.relative(cwd, state.output), path.relative(cwd, state.next)], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).ok, true);
  }
  state.write('output/functions/api/run.func/.vc-config.json', { filePathMap: { 'polyprompt/.env.local': '/vercel/path0/polyprompt/.env.local.before-startup-delivery' } });
  const result = spawnSync(process.execPath, [checker, state.output, state.next], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).ok, false);
  assert(!result.stdout.includes('.env')); assert(!result.stdout.includes('/vercel')); assert.equal(result.stderr, '');
  fs.writeFileSync(state.config, 'Not JSON; do not echo this metadata');
  const incomplete = spawnSync(process.execPath, [checker, state.output, state.next], { encoding: 'utf8' });
  assert.equal(incomplete.status, 1); assert.deepEqual(JSON.parse(incomplete.stderr), { ok: false, scanComplete: false });
});

for (const side of ['next-only', 'artifact', 'Next']) test(`an explicit empty ${side} root fails with sanitized CLI diagnostics`, t => {
  const state = fixture(t);
  if (side === 'artifact') state.write('output/functions/api/run.func/.vc-config.json', {
    filePathMap: { 'app/.env.fixture': '/vercel/path0/app/.env.fixture' } });
  if (side === 'Next') state.write('app/.next/server/app/api/run/route.js.nft.json', { files: ['../../../../.env.fixture'] });
  const args = side === 'next-only' ? ['--next-only', ''] : side === 'artifact' ? ['', state.next] : [state.output, ''];
  const result = spawnSync(process.execPath, [path.join(__dirname, 'prebuilt-artifact-check.cjs'), ...args], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { ok: false, scanComplete: false });
});
