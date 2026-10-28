import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Website deployment and PWA packaging have their own upstream harness. This
// repository tests the actual Chrome package with package.test and Playwright.
const websiteOnly = new Set(['e2e_build.test.mjs', 'sites_workflow.test.mjs']);
const tests = readdirSync(path.join(root, 'test'))
  .filter(name => name.endsWith('.test.mjs') && !websiteOnly.has(name))
  .map(name => path.join('test', name));
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
