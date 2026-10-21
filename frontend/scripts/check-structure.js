import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// 1. Assert no unauthorized package.json in gas-backend or root
const forbiddenPaths = [
  path.join(projectRoot, 'gas-backend', 'package.json'),
  path.join(projectRoot, 'package.json')
];

for (const p of forbiddenPaths) {
  if (fs.existsSync(p)) {
    console.error(`[Guardrail] Unauthorized package file found at: ${p}\nSPEC §2 requires all dependencies and npm scripts to reside in /frontend.`);
    process.exit(1);
  }
}

// 2. Assert gas-backend contains only Code.gs, appsscript.json, tests/
const gasBackendDir = path.join(projectRoot, 'gas-backend');
if (fs.existsSync(gasBackendDir)) {
  const allowedEntries = new Set(['Code.gs', 'appsscript.json', 'tests', '.git', '.gitignore']);
  const actualEntries = fs.readdirSync(gasBackendDir);
  for (const entry of actualEntries) {
    if (!allowedEntries.has(entry)) {
      console.error(`[Guardrail] Unauthorized file/folder in gas-backend: ${entry}\nSPEC §2 strictly specifies gas-backend contents.`);
      process.exit(1);
    }
  }
}

console.log('[Guardrail] Repository structure check passed.');
