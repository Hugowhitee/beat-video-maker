import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const PORT = 4179
const BASE_URL = `http://127.0.0.1:${PORT}`
const OUT_DIR = path.resolve('artifacts/migration-visual-qa')

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function startDevServer() {
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--port', String(PORT), '--strictPort'],
    {
      cwd: process.cwd(),
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  )

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  return {
    child,
    getOutput: () => output,
  }
}

async function assertHidden(locator, message) {
  if ((await locator.count()) !== 0) {
    throw new Error(message)
  }
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUT_DIR, { recursive: true })

  const server = startDevServer()
  try {
    await waitForServer(`${BASE_URL}/`)

    const browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
    })

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))

      await page.goto(`${BASE_URL}/projects/new?beatvideoVisualQa=1`, {
        waitUntil: 'domcontentloaded',
      })

      const photoMode = page.getByRole('tab', { name: 'Photo' })
      const videoMode = page.getByRole('tab', { name: 'Video' })
      await photoMode.waitFor({ state: 'visible' })
      await photoMode.click()
      await page.locator('input[name="name"]').fill('Beatvideo visual QA')

      await page.screenshot({
        path: path.join(OUT_DIR, 'project-create-photo-1440.png'),
        fullPage: true,
      })

      await page.locator('form button[type="submit"]').click()
      await page.waitForURL(/\/editor\//, { timeout: 30_000 })
      await page.getByRole('application').waitFor({ state: 'visible' })
      await page.waitForTimeout(1_200)

      const photoEditorTab = page.getByRole('tab', { name: 'Photo' })
      await photoEditorTab.waitFor({ state: 'visible' })
      await page.waitForFunction(() =>
        document.querySelector('[data-beatvideo-mode="photo"]') !== null,
      )
      await assertHidden(
        page.getByRole('button', { name: /razor/i }),
        'Photo mode exposed the Razor tool.',
      )
      await assertHidden(
        page.locator('button[data-tooltip="Transitions"]'),
        'Photo mode exposed the Transitions family.',
      )

      await page.screenshot({
        path: path.join(OUT_DIR, 'photo-editor-1440.png'),
        fullPage: false,
      })

      await page.setViewportSize({ width: 1024, height: 768 })
      await page.waitForTimeout(250)
      await page.screenshot({
        path: path.join(OUT_DIR, 'photo-editor-1024.png'),
        fullPage: false,
      })

      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.waitForTimeout(250)
      await page.screenshot({
        path: path.join(OUT_DIR, 'photo-editor-1920.png'),
        fullPage: false,
      })

      const videoEditorTab = page.getByRole('tab', { name: 'Video' })
      await videoEditorTab.click()
      await page.waitForFunction(() => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]')
        return selected?.textContent?.trim() === 'Video'
      })
      await page.waitForFunction(() =>
        document.querySelector('[data-beatvideo-mode="video"]') !== null,
      )
      await page.locator('button[data-tooltip="Transitions"]').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: /razor/i }).waitFor({ state: 'visible' })
      await page.waitForTimeout(600)

      await page.setViewportSize({ width: 1440, height: 900 })
      await page.waitForTimeout(250)
      await page.screenshot({
        path: path.join(OUT_DIR, 'video-editor-1440.png'),
        fullPage: false,
      })

      await page.setViewportSize({ width: 1024, height: 768 })
      await page.waitForTimeout(250)
      await page.screenshot({
        path: path.join(OUT_DIR, 'video-editor-1024.png'),
        fullPage: false,
      })

      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.waitForTimeout(250)
      await page.screenshot({
        path: path.join(OUT_DIR, 'video-editor-1920.png'),
        fullPage: false,
      })

      // The mode switch is project state, not temporary UI state. A reload must
      // reopen the same workflow so users never land in the wrong editor.
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('application').waitFor({ state: 'visible' })
      await page.getByRole('tab', { name: 'Video' }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]')
        return selected?.textContent?.trim() === 'Video'
      })
      await page.waitForFunction(() =>
        document.querySelector('[data-beatvideo-mode="video"]') !== null,
      )

      const title = await page.title()
      if (/freecut/i.test(title)) {
        throw new Error(`Donor branding leaked into the browser title: ${title}`)
      }

      if (pageErrors.length > 0) {
        throw new Error(`Browser errors during migration QA:\n${pageErrors.join('\n')}`)
      }
    } finally {
      await browser.close()
    }
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nDev server output:\n${server.getOutput()}`,
    )
  } finally {
    server.child.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
