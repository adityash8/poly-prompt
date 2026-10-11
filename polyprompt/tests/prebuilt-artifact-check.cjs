const fs = require('node:fs');
const path = require('node:path');

function environmentPath(value) {
  return value.replace(/\\/g, '/').split('/').some(part => part.startsWith('.env'));
}

function checkArtifacts(artifactDirectory, nextDirectory) {
  if (artifactDirectory === '' || nextDirectory === '') throw new Error('Invalid root');
  const summary = { mode: artifactDirectory ? 'prebuilt' : 'next-traces',
    files: 0, symlinks: 0, functionAliases: 0, physicalFunctions: 0, functionConfigs: 0, traceManifests: 0, nftManifests: 0,
    violations: { environmentPaths: 0, mapKeys: 0, mapTargets: 0, linkTargets: 0, traceReferences: 0,
      externalLinks: 0, brokenLinks: 0, missingRoots: 0, missingConfigs: 0, missingTraces: 0 } };

  function references(file) {
    const name = path.basename(file);
    if (name !== '.vc-config.json' && !name.endsWith('.nft.json') && name !== 'required-server-files.json') return;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid metadata');
    if (name === '.vc-config.json') {
      summary.functionConfigs++;
      const mappings = data.filePathMap === undefined ? {} : data.filePathMap;
      if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error('Invalid function map');
      for (const [source, target] of Object.entries(mappings)) {
        if (typeof target !== 'string') throw new Error('Invalid function map target');
        if (environmentPath(source)) summary.violations.mapKeys++;
        if (environmentPath(target)) summary.violations.mapTargets++;
      }
    } else {
      summary.traceManifests++;
      if (name.endsWith('.nft.json')) summary.nftManifests++;
      if (!Array.isArray(data.files) || data.files.some(file => typeof file !== 'string')) throw new Error('Invalid trace manifest');
      summary.violations.traceReferences += data.files.filter(environmentPath).length;
    }
  }

  function inspect(directory) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) { summary.violations.missingRoots++; return; }
    const root = fs.realpathSync.native(directory);
    const requested = path.resolve(directory);
    const anchors = [root, path.join(fs.realpathSync.native(path.dirname(directory)), path.basename(directory))];
    if (fs.existsSync(requested) && fs.realpathSync.native(requested) === root) anchors.push(requested);
    function outside(relative) {
      return path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep);
    }
    function resolveLink(file) {
      let current = path.dirname(file), components = [path.basename(file)], anchoring = false, links = 0;
      while (components.length) {
        const component = components.shift();
        if (!component || component === '.') continue;
        // Evaluate each parent segment only after resolving the preceding filesystem component.
        const candidate = component === '..' ? path.dirname(current) : path.join(current, component);
        const relative = path.relative(root, candidate);
        // Absolute targets may traverse only ancestors of the canonical or caller's root until entering it.
        if (anchoring ? anchors.every(anchor => outside(path.relative(candidate, anchor))) : outside(relative)) {
          summary.violations.externalLinks++; return;
        }
        if (environmentPath(relative)) { summary.violations.linkTargets++; return; }
        let stat;
        try {
          stat = fs.lstatSync(candidate);
          if (stat.isSymbolicLink()) {
            if (++links > 40) { summary.violations.brokenLinks++; return; }
            const target = fs.readlinkSync(candidate);
            if (environmentPath(target)) { summary.violations.linkTargets++; return; }
            if (path.isAbsolute(target)) {
              current = path.parse(target).root; anchoring = true;
            } else current = path.dirname(candidate);
            components = target.split(path.sep).concat(components);
            continue;
          }
        } catch { summary.violations.brokenLinks++; return; }
        current = candidate;
        if (current === root) anchoring = false;
        if (components.length && !stat.isDirectory()) { summary.violations.brokenLinks++; return; }
      }
      if (anchoring) { summary.violations.externalLinks++; return; }
      return current;
    }
    function visit(file) {
      const relative = path.relative(root, file);
      const stat = fs.lstatSync(file);
      if (environmentPath(relative)) { summary.violations.environmentPaths++; return; }
      if (stat.isSymbolicLink()) {
        summary.symlinks++;
        const resolved = resolveLink(file);
        if (!resolved) return;
        if (file.endsWith('.func')) {
          const config = path.join(resolved, '.vc-config.json');
          if (!fs.statSync(resolved).isDirectory() || !fs.existsSync(config) || !fs.statSync(config).isFile()) summary.violations.missingConfigs++;
          else summary.functionAliases++;
        }
        // Every internal link is checked at its physical location, avoiding alias duplication/cycles.
        if (fs.statSync(resolved).isFile()) references(file);
      } else if (stat.isDirectory()) {
        if (file.endsWith('.func')) {
          summary.physicalFunctions++;
          const config = path.join(file, '.vc-config.json');
          if (!fs.existsSync(config) || !fs.statSync(config).isFile()) summary.violations.missingConfigs++;
        }
        for (const name of fs.readdirSync(file)) visit(path.join(file, name));
      } else if (stat.isFile()) {
        summary.files++;
        references(file);
      }
    }
    visit(root);
    return root;
  }

  if (artifactDirectory) {
    inspect(artifactDirectory);
    if (!summary.physicalFunctions) summary.violations.missingConfigs++;
  }
  if (nextDirectory) {
    const before = summary.nftManifests;
    const root = inspect(nextDirectory);
    if (summary.nftManifests === before) summary.violations.missingTraces++;
    const serverFiles = root && path.join(root, 'required-server-files.json');
    if (!serverFiles || !fs.existsSync(serverFiles) || !fs.statSync(serverFiles).isFile()) summary.violations.missingTraces++;
  }
  summary.ok = Object.values(summary.violations).every(count => count === 0);
  return summary;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const result = args[0] === '--next-only'
      ? checkArtifacts(null, args[1] ?? path.resolve(__dirname, '../.next'))
      : checkArtifacts(args[0] ?? path.resolve(__dirname, '../../.vercel/output'), args[1] ?? path.resolve(__dirname, '../.next'));
    // Print aggregate diagnostics only. Never print paths, metadata contents or raw filesystem/parse errors.
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ok: false, scanComplete: false }));
    process.exitCode = 1;
  }
}

module.exports = { checkArtifacts };
