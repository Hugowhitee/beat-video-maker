import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const failures = [];
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);

const generated = /(^|\/)(node_modules|dist|artifacts|playwright-report|test-results|coverage)(\/|$)|\.(log|tmp|bak)$/i;
for (const path of tracked) if (generated.test(path)) failures.push('Tracked generated/local artifact: ' + path);

const historicalName = /(^|\/)[^/]*(copy|backup|old|final|v2)[^/]*(\/|$)/i;
for (const path of tracked) if (historicalName.test(path)) failures.push('History-style duplicate path: ' + path);

const required = [
  'AGENTS.md', 'README.md', 'docs/product.md', 'docs/visual-qa.md', 'package.json',
  'src/features/compositor/renderComposition.ts', 'src/features/export/exportVideo.ts',
  'src/features/export/outputTarget.ts',
  'src/features/analysis/analyzeBeatGrid.ts',
  'src/features/analysis/musicalClock.ts', 'tests/visual.spec.ts',
];
for (const path of required) if (!existsSync(path)) failures.push('Required project file missing: ' + path);

if (existsSync('README.md') && readFileSync('README.md', 'utf8').trim().length < 800) {
  failures.push('README.md is still too small to explain the project and supported workflow.');
}

if (existsSync('package.json')) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(String(pkg.version || ''))) failures.push('package.json version is not SemVer.');
  if (pkg.name !== 'beat-video-maker') failures.push('package.json name drifted from beat-video-maker.');
}

const markdown = tracked.filter((path) => path.endsWith('.md'));
const linkPattern = /!?\[[^\]]*\]\(([^)\r\n]+)\)/g;
for (const file of markdown) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    let target = match[1].trim().split(/\s+/)[0];
    if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = target.split('#')[0].split('?')[0];
    if (!target) continue;
    try { target = decodeURIComponent(target); } catch {}
    const full = resolve(dirname(resolve(file)), target);
    if (!existsSync(full)) failures.push('Broken local Markdown link in ' + file + ' -> ' + target);
  }
}

if (failures.length) {
  console.error('Repository hygiene failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(' - ' + failure);
  process.exit(1);
}
console.log('Repository hygiene passed: ' + tracked.length + ' tracked paths, ' + markdown.length + ' Markdown files.');
