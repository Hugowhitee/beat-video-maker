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

function signalProcessTree(child, signal) {
  if (child.exitCode !== null) return
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Fall through to the direct child when the process group already exited.
    }
  }
  child.kill(signal)
}

async function stopPreview(preview) {
  if (preview.exitCode === null) {
    signalProcessTree(preview, 'SIGTERM')
    const exited = await Promise.race([
      new Promise((resolve) => preview.once('exit', () => resolve(true))),
      sleep(3_000).then(() => false),
    ])
    if (!exited && preview.exitCode === null) {
      signalProcessTree(preview, 'SIGKILL')
      await Promise.race([
        new Promise((resolve) => preview.once('exit', resolve)),
        sleep(2_000),
      ])
    }
  }
  preview.stdout?.destroy()
  preview.stderr?.destroy()
  preview.unref()
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
  const hardTimeout = setTimeout(() => {
    console.error('Project open smoke exceeded 150 seconds')
    process.exit(124)
  }, 150_000)

  const port = 4179
  const baseUrl = `http://127.0.0.1:${port}`
  const preview = spawn(
    vpBin,
    ['preview', '--host', '127.0.0.1', '--strictPort', '--port', String(port)],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: process.platform !== 'win32',
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
    console.log('Smoke: waiting for production preview')
    await waitForPreview(baseUrl, preview)
    console.log('Smoke: preview ready; launching Chrome')

    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--no-sandbox'],
    })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      screen: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
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

    console.log('Smoke: opening New Project through OPFS fallback')
    await page.goto(`${baseUrl}/projects/new`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.locator('#name').waitFor({ state: 'visible', timeout: 20_000 })
    console.log('Smoke: New Project loaded')
    await page.locator('#name').fill('Project open smoke')
    await page.locator('button[type="submit"]').click()
    console.log('Smoke: project created; waiting for editor route')

    const editor = page.locator('[role="application"][data-studio-v2="true"]')
    const loadingError = page.getByText('Something went wrong', { exact: true })

    const result = await Promise.race([
      editor.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'editor'),
      loadingError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'error'),
    ])

    console.log(`Smoke: create -> editor result: ${result}`)
    if (result === 'editor') {
      await page.locator('[data-compact-toolbar="true"]').waitFor({ state: 'visible', timeout: 10_000 })
      await page.getByRole('button', { name: 'Project settings' }).waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await page.getByRole('button', { name: 'Rename project' }).waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      const overflow = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      if (overflow.scrollWidth > overflow.innerWidth + 2) {
        throw new Error(
          `Phone editor has horizontal overflow: viewport ${overflow.innerWidth}px, document ${overflow.scrollWidth}px`,
        )
      }
    }
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
    console.log('Smoke: editor opened; returning to Projects')
    await page.goto(`${baseUrl}/projects`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    const card = page.locator('[data-project-card]').filter({ hasText: 'Project open smoke' }).first()
    await card.waitFor({ state: 'visible', timeout: 20_000 })
    console.log('Smoke: project tile visible')

    const box = await card.boundingBox()
    if (!box) throw new Error('Project tile has no layout box')
    const ratio = box.width / box.height
    if (ratio < 0.9 || ratio > 1.1) {
      throw new Error(
        `Project tile is not square/almost-square: ${box.width.toFixed(1)}×${box.height.toFixed(1)} (ratio ${ratio.toFixed(2)})`,
      )
    }
    if (box.width < 175) {
      throw new Error(
        `Project tile is still too small on a 390px phone viewport: ${box.width.toFixed(1)}px`,
      )
    }

    await card.getByRole('button', { name: 'Open', exact: true }).click()
    console.log('Smoke: clicked Open; waiting for reopened editor')

    const reopenResult = await Promise.race([
      editor.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'editor'),
      loadingError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'error'),
    ])

    console.log(`Smoke: reopen result: ${reopenResult}; page errors: ${pageErrors.length}`)
    if (reopenResult === 'editor') {
      await page.locator('[data-compact-toolbar="true"]').waitFor({ state: 'visible', timeout: 10_000 })

      // Reproduce a phone browser requesting a desktop-sized layout viewport.
      // screen.width stays 390 CSS px while the layout viewport becomes 980.
      await page.setViewportSize({ width: 980, height: 844 })
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
      await editor.waitFor({ state: 'visible', timeout: 30_000 })
      await page.locator('[data-compact-toolbar="true"]').waitFor({ state: 'visible', timeout: 10_000 })

      const desktopSiteState = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        screenWidth: window.screen.width,
        compactToolbar: Boolean(document.querySelector('[data-compact-toolbar="true"]')),
        projectRail: Boolean(document.querySelector('.studio-project-rail')),
      }))
      if (!desktopSiteState.compactToolbar || desktopSiteState.projectRail) {
        throw new Error(
          `Desktop-site phone regression: ${JSON.stringify(desktopSiteState)}`,
        )
      }
    }
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
      `Project UI smoke passed: compact phone editor, desktop-site fallback, project settings, and ${box.width.toFixed(0)}px square tiles are all verified.`,
    )

    // Desktop regression: the fixed-height Master and Color panels historically
    // clipped on common laptop viewports, while source Program/timeline remained
    // usable. Check actual rendered geometry, not just component existence.
    const desktopContext = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      screen: { width: 1366, height: 768 },
    })
    await desktopContext.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: undefined,
        configurable: true,
      })
    })
    const desktopPage = await desktopContext.newPage()
    const desktopErrors = []
    desktopPage.on('pageerror', (error) => desktopErrors.push(error.stack || error.message))

    await desktopPage.goto(`${baseUrl}/projects/new`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await desktopPage.locator('#name').waitFor({ state: 'visible', timeout: 20_000 })
    await desktopPage.locator('#name').fill('Workspace geometry smoke')
    await desktopPage.locator('button[type="submit"]').click()
    await desktopPage.locator('[role="application"][data-studio-v2="true"]').waitFor({
      state: 'visible', timeout: 30_000,
    })

    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
    ]) {
      await desktopPage.setViewportSize(viewport)
      await desktopPage.getByRole('tab', { name: 'Master' }).click()
      const output = desktopPage.getByTestId('master-output-controls')
      const program = desktopPage.locator('[data-program-monitor]')
      await output.waitFor({ state: 'visible' })
      const outputBox = await output.boundingBox()
      const programBox = await program.boundingBox()
      if (!outputBox || !programBox ||
        outputBox.y < 0 || outputBox.y + outputBox.height > viewport.height + 2 ||
        programBox.height < 135 || programBox.width < 240) {
        throw new Error(`Master clipped or Program collapsed at ${viewport.width}×${viewport.height}: ${JSON.stringify({ outputBox, programBox })}`)
      }
      // Actual Chrome geometry: the plugin editor and Input/Auto section
      // must be reachable without pushing the post-master Output off screen.
      const inputSection = desktopPage.getByTestId('master-auto-level-section')
      await inputSection.scrollIntoViewIfNeeded()
      const trim = inputSection.getByRole('slider', { name: 'Input trim' })
      const autoLevelButton = inputSection.getByRole('button', { name: 'Auto level' })
      const trimBox = await trim.boundingBox()
      const autoLevelBox = await autoLevelButton.boundingBox()
      const stillFixedOutputBox = await output.boundingBox()
      if (!trimBox || !autoLevelBox || !stillFixedOutputBox ||
        trimBox.width < 80 || trimBox.x < 0 || trimBox.x + trimBox.width > viewport.width + 2 ||
        autoLevelBox.x < 0 || autoLevelBox.x + autoLevelBox.width > viewport.width + 2 ||
        autoLevelBox.y + autoLevelBox.height > stillFixedOutputBox.y + 2 ||
        stillFixedOutputBox.y + stillFixedOutputBox.height > viewport.height + 2) {
        throw new Error(`Master plugin/Auto level layout clipped at ${viewport.width}×${viewport.height}: ${JSON.stringify({ trimBox, autoLevelBox, stillFixedOutputBox })}`)
      }
      await desktopPage.getByRole('tab', { name: 'Color' }).click()
      const grade = desktopPage.getByTestId('color-grading-dock')
      await grade.waitFor({ state: 'attached' })
      await grade.scrollIntoViewIfNeeded()
      const gradeBox = await grade.boundingBox()
      if (!gradeBox || gradeBox.width < 280 || gradeBox.height < 200 ||
        gradeBox.y + gradeBox.height > viewport.height + 2) {
        throw new Error(`Color grading controls inaccessible at ${viewport.width}×${viewport.height}: ${JSON.stringify(gradeBox)}`)
      }
    }
    if (desktopErrors.length) {
      throw new Error(`Desktop workspace errors:\\n${desktopErrors.join('\\n')}`)
    }
    console.log('Workspace UI smoke passed: Master Program/Output and Color controls reachable on laptop viewports')
    await desktopContext.close()
  } finally {
    clearTimeout(hardTimeout)
    if (browser) await browser.close().catch(() => {})
    await stopPreview(preview)
    if (preview.exitCode && preview.exitCode !== 0 && preview.exitCode !== 143) {
      process.stderr.write(previewOutput)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
