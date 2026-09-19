import { existsSync, readFileSync } from 'node:fs';

const required = ['dist/manifest.webmanifest', 'dist/sw.js', 'dist/icon.svg'];
const missing = required.filter((path) => !existsSync(path));

if (missing.length) {
  console.error('PWA build check failed. Missing: ' + missing.join(', '));
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));

const failures = [];
if (manifest.name !== 'Beatvideo Maker') failures.push('Unexpected manifest name');
if (manifest.display !== 'standalone') failures.push('Manifest is not standalone');
if (manifest.id !== './') failures.push('Manifest id must stay stable and relative');
if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) failures.push('Manifest has no icon');
if (manifest.start_url !== './') failures.push('Manifest start_url must stay relative');
if (manifest.scope !== './') failures.push('Manifest scope must stay relative');
for (const size of ['192x192', '512x512', 'any']) {
  if (!manifest.icons.some((icon) => icon.src === 'icon.svg' && icon.sizes === size)) {
    failures.push('Manifest is missing the icon declaration for ' + size);
  }
}

if (failures.length) {
  console.error('PWA build check failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('PWA build check passed: manifest, service worker and icon are present.');
