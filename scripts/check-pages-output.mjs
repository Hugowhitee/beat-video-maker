import { existsSync, readFileSync } from 'node:fs'

const html = readFileSync('dist/index.html', 'utf8')
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
const sw = readFileSync('dist/sw.js', 'utf8')

if (!html.includes('/beat-video-maker/assets/')) {
  throw new Error('Pages build is missing the /beat-video-maker/ asset base.')
}
if (!html.includes('/beat-video-maker/manifest.webmanifest')) {
  throw new Error('Pages build is missing the scoped web manifest URL.')
}
if (manifest.start_url !== './' || manifest.scope !== './' || manifest.id !== './') {
  throw new Error('PWA manifest is not relative to the GitHub Pages project site.')
}
if (!sw.includes("scopedPath('index.html')")) {
  throw new Error('Service worker fallback is not scoped to the project site.')
}
if (!existsSync('dist/404.html')) {
  throw new Error('GitHub Pages SPA fallback dist/404.html is missing.')
}

console.log('GitHub Pages output is scoped to /beat-video-maker/ and has an SPA fallback.')
