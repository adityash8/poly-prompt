const ts = require('typescript');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'server-only') return path.join(__dirname, 'server-only.cjs');
  if (request.startsWith('@/')) request = path.join(__dirname, '../src', request.slice(2));
  return resolve.call(this, request, parent, ...rest);
};
require.extensions['.ts'] = function (module, file) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } });
  module._compile(result.outputText, file);
};
