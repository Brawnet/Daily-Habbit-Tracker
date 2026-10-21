import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '../package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const allDeps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

const nonExact = [];

for (const [name, version] of Object.entries(allDeps)) {
  if (/^[\^~><*]/.test(version) || version.includes('||') || version === 'latest') {
    nonExact.push({ name, version });
  }
}

if (nonExact.length > 0) {
  console.error('Error: Non-exact dependency versions detected (SPEC §3 requires exact versions):');
  for (const { name, version } of nonExact) {
    console.error(`  - ${name}: "${version}" (expected exact version without ^, ~, or ranges)`);
  }
  process.exit(1);
}

console.log('✓ All dependency versions are strictly exact.');
