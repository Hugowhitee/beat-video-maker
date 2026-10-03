import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const vpBin =
  process.platform === 'win32'
    ? path.join(repoRoot, 'node_modules', '.bin', 'vp.cmd')
    : path.join(repoRoot, 'node_modules', '.bin', 'vp')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPreview(url, child) {
  let lastError
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`preview exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`preview responded ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw lastError ?? new Error('preview did not become ready')
}

async function main() {
  const port = 4179
  const baseUrl = `http://127.0.0.1:${port}`
  const preview = spawn(
    vpBin,
    ['preview', '--host', '127.0.0.1', '--strictPort', '--port', String(port)],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )

  let previewOutput = ''
  preview.stdout.on('data', (chunk) => {
    previewOutput += chunk.toString()
  })
  preview.stderr.on('data', (chunk) => {
    previewOutput += chunk.toString()
  })

  let browser
  try {
    await waitForPreview(baseUrl, preview)

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--no-sandbox'],
    })
    const context = await browser.newContext({
      viewport: { width: 980, height: 900 },
      hasTouch: true,
    })

    // Reproduce the Brave/mobile fallback used by the deployed app: Brave does
    // not expose the user-facing directory picker, so WorkspaceGate uses OPFS.
    await context.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: undefined,
        configurable: true,
      })
    })

    const page = await context.newPage()
    const pageErrors = []
    const consoleErrors = []

    page.on('pageerror', (error) => {
      pageErrors.push(error.stack || error.message)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto(`${baseUrl}/projects/new`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.locator('#name').waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('#name').fill('Project open smoke')
    await page.locator('button[type="submit"]').click()

    const editor = page.locator('[role="application"][data-studio-v2="true"]')
    const loadingError = page.getByText('Something went wrong', { exact: true })

    const result = await Promise.race([
      editor.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'editor'),
      loadingError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'error'),
    ])

    if (result !== 'editor') {
      const details = await page.locator('body').innerText().catch(() => '')
      throw new Error(
        [
          'Opening a freshly-created OPFS project rendered the route error screen.',
          `URL: ${page.url()}`,
          `Page errors:\n${pageErrors.join('\n---\n') || '(none)'}`,
          `Console errors:\n${consoleErrors.join('\n---\n') || '(none)'}`,
          `Visible page:\n${details}`,
        ].join('\n\n'),
      )
    }

    // Reopen through the real Projects screen instead of only testing the
    // create->editor transition.
    await page.goto(`${baseUrl}/projects`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    const card = page.locator('[data-project-card]').filter({ hasText: 'Project open smoke' }).first()
    await card.waitFor({ state: 'visible', timeout: 20_000 })

    const box = await card.boundingBox()
    if (!box) throw new Error('Project tile has no layout box')
    const ratio = box.width / box.height
    if (ratio < 0.9 || ratio > 1.1) {
      throw new Error(
        `Project tile is not square/almost-square: ${box.width.toFixed(1)}×${box.height.toFixed(1)} (ratio ${ratio.toFixed(2)})`,
      )
    }

    await card.getByRole('button', { name: 'Open', exact: true }).click()

    const reopenResult = await Promise.race([
      editor.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'editor'),
      loadingError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'error'),
    ])

    if (reopenResult !== 'editor' || pageErrors.length > 0) {
      const details = await page.locator('body').innerText().catch(() => '')
      throw new Error(
        [
          'Reopening an OPFS project failed.',
          `URL: ${page.url()}`,
          `Page errors:\n${pageErrors.join('\n---\n') || '(none)'}`,
          `Console errors:\n${consoleErrors.join('\n---\n') || '(none)'}`,
          `Visible page:\n${details}`,
        ].join('\n\n'),
      )
    }

    console.log(
      `Project UI smoke passed: create/open/reopen works and tile ratio is ${ratio.toFixed(2)}.`,
    )
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (preview.exitCode === null) {
      preview.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => preview.once('exit', resolve)),
        sleep(5_000),
      ])
    }
    if (preview.exitCode && preview.exitCode !== 0) {
      process.stderr.write(previewOutput)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
