import { readFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
const failures = [];

if (!html.includes('/beat-video-maker/assets/')) {
  failures.push('Built HTML does not use the GitHub Pages project base.');
}
if (!html.includes('/beat-video-maker/manifest.webmanifest')) {
  failures.push('Manifest link is not scoped to the GitHub Pages project path.');
}
if (/\b(?:src|href)="\/assets\//.test(html)) {
  failures.push('Built HTML still contains root-level /assets paths.');
}
if (html.includes('registerSW.js') && !html.includes('/beat-video-maker/registerSW.js')) {
  failures.push('Service-worker registration is not scoped to the GitHub Pages project path.');
}
if (manifest.id !== './') failures.push('Manifest id must remain stable and relative.');
if (manifest.start_url !== './') failures.push('Manifest start_url must remain relative.');
if (manifest.scope !== './') failures.push('Manifest scope must remain relative.');
if (!Array.isArray(manifest.icons)) {
  failures.push('Manifest icons are missing.');
} else {
  for (const size of ['192x192', '512x512', 'any']) {
    if (!manifest.icons.some((icon) => icon.src === 'icon.svg' && icon.sizes === size)) {
      failures.push('Manifest is missing the scoped icon declaration for ' + size);
    }
  }
}

if (failures.length) {
  console.error('GitHub Pages build check failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('GitHub Pages build check passed: project base and PWA scope are coherent.');
