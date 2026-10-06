import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
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

function createWavFixture({ seconds = 4, sampleRate = 44_100, bpm = 120 } = {}) {
  const channels = 1
  const bitsPerSample = 16
  const totalSamples = Math.max(1, Math.floor(seconds * sampleRate))
  const bytesPerSample = bitsPerSample / 8
  const dataSize = totalSamples * channels * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  const beatSamples = Math.max(1, Math.round((60 / bpm) * sampleRate))
  for (let sample = 0; sample < totalSamples; sample++) {
    const phase = sample % beatSamples
    const click = phase < Math.round(sampleRate * 0.018)
      ? Math.exp(-phase / (sampleRate * 0.004)) * 0.82
      : 0
    const bed = Math.sin((2 * Math.PI * 220 * sample) / sampleRate) * 0.08
    const value = Math.max(-1, Math.min(1, click + bed))
    buffer.writeInt16LE(Math.round(value * 0x7fff), 44 + sample * 2)
  }
  return buffer
}

async function createWebmFixture(page) {
  const base64 = await page.evaluate(async () => {
    if (!globalThis.MediaRecorder) throw new Error('MediaRecorder unavailable in smoke browser')
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create fixture canvas')
    const stream = canvas.captureStream(15)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm'
    const chunks = []
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve()
      recorder.onerror = () => reject(recorder.error ?? new Error('Fixture recording failed'))
    })

    recorder.start(100)
    for (let frame = 0; frame < 24; frame++) {
      // Stable background + moving object: real frames without synthetic hard cuts.
      ctx.fillStyle = '#202a26'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#c7e85a'
      ctx.fillRect(18 + frame * 7, 58, 48, 48)
      ctx.fillStyle = '#f4f5f1'
      ctx.font = '20px sans-serif'
      ctx.fillText('Beat Video Maker', 72, 32)
      await new Promise((resolve) => setTimeout(resolve, 65))
    }
    recorder.stop()
    await stopped
    stream.getTracks().forEach((track) => track.stop())

    const blob = new Blob(chunks, { type: 'video/webm' })
    if (blob.size < 1_000) throw new Error(`Generated WebM fixture is unexpectedly small: ${blob.size}`)
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
      reader.onerror = () => reject(reader.error ?? new Error('Could not encode fixture'))
      reader.readAsDataURL(blob)
    })
  })
  return Buffer.from(base64, 'base64')
}

async function main() {
  const hardTimeout = setTimeout(() => {
    console.error('Project open smoke exceeded 240 seconds')
    process.exit(124)
  }, 240_000)

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
      Object.defineProperty(window, 'showOpenFilePicker', {
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
    await desktopPage.getByRole('button', { name: 'Video', exact: true }).click()
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

    // Stateful real-media regression: generate a valid WebM inside Chrome and
    // drive the same import -> shot review -> Source trim -> timeline edit ->
    // Undo/Redo -> save/reopen flow as a user. No store seeding or mock media.
    console.log('Smoke: generating real WebM fixture for editor round-trip')
    await desktopPage.setViewportSize({ width: 1366, height: 768 })
    const fixture = await createWebmFixture(desktopPage)
    await desktopPage.getByRole('tab', { name: 'Visual' }).click()

    const chooserPromise = desktopPage.waitForEvent('filechooser', { timeout: 10_000 })
    await desktopPage.getByRole('button', { name: /Add footage/i }).click()
    const chooser = await chooserPromise
    await chooser.setFiles({
      name: 'editor-roundtrip-smoke.webm',
      mimeType: 'video/webm',
      buffer: fixture,
    })

    const shotBin = desktopPage.locator('[data-beatvideo-shot-bin]')
    await shotBin.waitFor({ state: 'visible', timeout: 60_000 })
    const firstShot = shotBin.getByRole('button', { name: /^Shot 1 from .* Open in Source\.$/ }).first()
    try {
      await firstShot.waitFor({ state: 'visible', timeout: 20_000 })
    } catch (error) {
      const shotState = await shotBin.innerText().catch(() => '(shot bin unavailable)')
      throw new Error(`First detected shot did not become actionable. Shot bin:\n${shotState}\n\n${error instanceof Error ? error.message : String(error)}`)
    }
    const firstShotRange = shotBin.locator('[data-beatvideo-shot-open]').first()
    const originalShotText = await firstShotRange.innerText()
    await firstShot.click()

    const sourceMonitor = desktopPage.getByTestId('source-monitor')
    await sourceMonitor.waitFor({ state: 'visible', timeout: 20_000 })
    await sourceMonitor.getByTestId('source-full-filmstrip').waitFor({
      state: 'visible',
      timeout: 30_000,
    })
    await sourceMonitor.getByRole('button', { name: 'Play (Space)' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    })

    // Trim one frame on each side through the precision handles. This proves
    // real Source state changes without relying on hard-coded source duration.
    const inHandle = sourceMonitor.getByRole('button', { name: 'Source In frame' })
    const outHandle = sourceMonitor.getByRole('button', { name: 'Source Out frame' })
    await inHandle.focus()
    for (let step = 0; step < 4; step++) {
      await inHandle.press('ArrowRight')
      await desktopPage.waitForTimeout(50)
    }
    await outHandle.focus()
    for (let step = 0; step < 4; step++) {
      await outHandle.press('ArrowLeft')
      await desktopPage.waitForTimeout(50)
    }
    const saveRange = desktopPage.getByRole('button', { name: 'Save In/Out' })
    await saveRange.click({ timeout: 10_000 })
    await desktopPage.waitForFunction(
      ({ selector, original }) => {
        const element = document.querySelector(selector)
        return element instanceof HTMLElement && element.innerText !== original
      },
      {
        selector: '[data-beatvideo-shot-open]',
        original: originalShotText,
      },
      { timeout: 20_000 },
    )

    const trimmedShotText = await firstShotRange.innerText()
    if (trimmedShotText === originalShotText) {
      throw new Error(`Shot review did not persist the Source trim: ${trimmedShotText}`)
    }

    const beforeInsertCount = await desktopPage.locator('[data-timeline-item]').count()
    const overwriteButton = sourceMonitor.getByRole('button', { name: 'Overwrite (.)' })
    const sourceBox = await sourceMonitor.boundingBox()
    const overwriteBox = await overwriteButton.boundingBox()
    const programBox = await desktopPage.locator('[data-program-monitor]').boundingBox()
    if (!sourceBox || !overwriteBox || !programBox ||
      overwriteBox.x < sourceBox.x - 1 ||
      overwriteBox.x + overwriteBox.width > sourceBox.x + sourceBox.width + 1 ||
      overwriteBox.x + overwriteBox.width > programBox.x + 1) {
      throw new Error(`Source controls overflow into Program: ${JSON.stringify({ sourceBox, overwriteBox, programBox })}`)
    }
    await overwriteButton.click()
    await desktopPage.waitForFunction(
      (before) => document.querySelectorAll('[data-timeline-item]').length > before,
      beforeInsertCount,
      { timeout: 20_000 },
    )
    const insertedCount = await desktopPage.locator('[data-timeline-item]').count()

    await desktopPage.keyboard.press('Control+z')
    await desktopPage.waitForFunction(
      (expected) => document.querySelectorAll('[data-timeline-item]').length === expected,
      beforeInsertCount,
      { timeout: 10_000 },
    )
    await desktopPage.keyboard.press('Control+Shift+z')
    await desktopPage.waitForFunction(
      (expected) => document.querySelectorAll('[data-timeline-item]').length === expected,
      insertedCount,
      { timeout: 10_000 },
    )

    console.log('Smoke: importing real WAV beat and building fixed BPM grid')
    await desktopPage.getByRole('tab', { name: 'Beat' }).click()
    const beatChooserPromise = desktopPage.waitForEvent('filechooser', { timeout: 10_000 })
    await desktopPage.getByRole('button', { name: 'Import beat' }).click()
    const beatChooser = await beatChooserPromise
    await beatChooser.setFiles({
      name: 'editor-roundtrip-beat.wav',
      mimeType: 'audio/wav',
      buffer: createWavFixture(),
    })

    const fixedBpmSetup = desktopPage.getByTestId('beat-fixed-bpm-setup')
    await fixedBpmSetup.waitFor({ state: 'visible', timeout: 30_000 })
    const bpmInput = fixedBpmSetup.getByRole('spinbutton', { name: 'Manual fixed BPM' })
    await bpmInput.fill('120')
    await fixedBpmSetup.getByRole('button', { name: 'Use fixed BPM' }).click()
    await desktopPage.getByText(/120 BPM/).first().waitFor({ state: 'visible', timeout: 30_000 })

    const beatGrid = desktopPage.locator('[data-beatvideo-grid-overlay="tracks"]')
    await beatGrid.waitFor({ state: 'visible', timeout: 20_000 })
    const waveform = desktopPage.locator('[data-timeline-waveform-canvas]').last()
    await waveform.waitFor({ state: 'visible', timeout: 30_000 })
    await desktopPage.waitForFunction(
      () => {
        const canvases = [...document.querySelectorAll('[data-timeline-waveform-canvas]')]
        return canvases.some((node) =>
          node instanceof HTMLCanvasElement &&
          node.width > 10 &&
          node.height > 4 &&
          node.style.display !== 'none'
        )
      },
      null,
      { timeout: 30_000 },
    )

    const waveformBeforeZoom = await waveform.boundingBox()
    const timelineViewport = desktopPage.locator('[data-timeline-scroll-container]').first()
    await timelineViewport.hover()
    await desktopPage.mouse.wheel(0, -320)
    await desktopPage.waitForTimeout(250)
    const waveformAfterZoom = await waveform.boundingBox()
    if (!waveformBeforeZoom || !waveformAfterZoom || waveformAfterZoom.width <= 0) {
      throw new Error(`Waveform geometry unavailable around timeline zoom: ${JSON.stringify({ waveformBeforeZoom, waveformAfterZoom })}`)
    }
    await beatGrid.waitFor({ state: 'visible', timeout: 10_000 })

    console.log('Smoke: applying a real GPU effect and checking shared Color compare')
    await desktopPage.getByRole('tab', { name: 'Visual', exact: true }).click()
    const videoTimelineItem = desktopPage
      .locator('[data-timeline-item]')
      .filter({ hasText: 'editor-roundtrip-smoke.webm' })
      .first()
    await videoTimelineItem.waitFor({ state: 'visible', timeout: 20_000 })
    await videoTimelineItem.click()

    const clipInspector = desktopPage.getByTestId('properties-clip-panel-host')
    await clipInspector.waitFor({ state: 'visible', timeout: 20_000 })
    await clipInspector.getByRole('tab', { name: 'Effects', exact: true }).click()
    const effectsSection = clipInspector.getByTestId('effects-section')
    await effectsSection.waitFor({ state: 'visible', timeout: 20_000 })
    await effectsSection.getByRole('button', { name: 'Add Effect', exact: true }).click()
    const effectSearch = desktopPage.getByPlaceholder('Search effects')
    await effectSearch.fill('Film Grain')
    await desktopPage.getByRole('button', { name: 'Film Grain', exact: true }).first().click()

    const activeEffectIndicator = videoTimelineItem.getByRole('button', {
      name: /Edit effects: 1 active, 0 bypassed/i,
    })
    await activeEffectIndicator.waitFor({ state: 'visible', timeout: 20_000 })
    const disableEffect = clipInspector.getByRole('button', { name: 'Disable Effect' }).first()
    await disableEffect.click()
    await videoTimelineItem.getByRole('button', {
      name: /Edit effects: 0 active, 1 bypassed/i,
    }).waitFor({ state: 'visible', timeout: 10_000 })
    await clipInspector.getByRole('button', { name: 'Enable Effect' }).first().click()
    await activeEffectIndicator.waitFor({ state: 'visible', timeout: 10_000 })

    await desktopPage.getByRole('tab', { name: 'Color', exact: true }).click()
    const compareButton = desktopPage.getByRole('button', {
      name: /Before \/ After .*Shift \+ B/i,
    }).first()
    await compareButton.waitFor({ state: 'visible', timeout: 20_000 })
    if ((await compareButton.getAttribute('aria-pressed')) !== 'false') {
      throw new Error('Color comparison should start in After mode')
    }
    await compareButton.click()
    if ((await compareButton.getAttribute('aria-pressed')) !== 'true') {
      throw new Error('Color Before/After button did not enter Before mode')
    }
    await desktopPage.keyboard.press('Shift+b')
    await desktopPage.waitForFunction(
      () => document.querySelector('button[aria-label*="Before / After"]')?.getAttribute('aria-pressed') === 'false',
      null,
      { timeout: 10_000 },
    )

    const persistedItemCount = await desktopPage.locator('[data-timeline-item]').count()
    await desktopPage.getByRole('button', { name: 'Save project' }).click()
    await desktopPage.getByText('Project saved', { exact: true }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })

    await desktopPage.goto(`${baseUrl}/projects`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    const desktopCard = desktopPage
      .locator('[data-project-card]')
      .filter({ hasText: 'Workspace geometry smoke' })
      .first()
    await desktopCard.waitFor({ state: 'visible', timeout: 20_000 })
    await desktopCard.getByRole('button', { name: 'Open', exact: true }).click()
    await desktopPage.locator('[role="application"][data-studio-v2="true"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    })
    await desktopPage.waitForFunction(
      (expected) => document.querySelectorAll('[data-timeline-item]').length === expected,
      persistedItemCount,
      { timeout: 20_000 },
    )

    await desktopPage.getByRole('tab', { name: 'Beat' }).click()
    const reopenedBeatSource = desktopPage.getByLabel('Project beat source')
    await reopenedBeatSource.waitFor({ state: 'visible', timeout: 20_000 })
    await desktopPage.waitForFunction(
      () => {
        const select = document.querySelector('select[aria-label="Project beat source"]')
        return select instanceof HTMLSelectElement &&
          select.selectedOptions[0]?.textContent?.trim() === 'editor-roundtrip-beat.wav'
      },
      null,
      { timeout: 20_000 },
    )
    await desktopPage.locator('[data-beatvideo-grid-overlay="tracks"]').waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    // Reopening hydrates waveform peaks from persisted OPFS asynchronously. On
    // shared CI runners that storage read can trail the already-restored beat
    // source/grid by more than the normal interaction timeout. Keep this as a
    // hard release assertion for the real rendered canvas, but give hydration
    // the same long-running budget as media analysis/import above.
    // The waveform is viewport-virtualized; re-center the timeline before
    // asserting that the reopened Beat lane renders the stored waveform.
    await desktopPage.locator('[data-timeline-scroll-container]').first().evaluate((element) => {
      element.scrollLeft = 0
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    try {
      await desktopPage.locator('[data-timeline-waveform-canvas]').last().waitFor({
        state: 'visible',
        timeout: 18_000,
      })
    } catch (error) {
      const diagnostic = await desktopPage.evaluate(() => ({
        width: window.innerWidth,
        tracks: [...document.querySelectorAll('[data-track-id]')].map((node) => ({
          id: node.getAttribute('data-track-id'),
          title: node.textContent?.trim().slice(0, 70),
          height: node.getBoundingClientRect().height,
        })),
        viewports: [...document.querySelectorAll('[data-timeline-scroll-container]')].map((node) => ({
          width: node.clientWidth,
          scrollLeft: node.scrollLeft,
          scrollWidth: node.scrollWidth,
        })),
        clips: [...document.querySelectorAll('[data-timeline-item]')].map((node) => ({
          media: node.textContent?.trim().slice(0, 90),
          from: node.getAttribute('data-timeline-start-frame'),
          duration: node.getAttribute('data-timeline-duration-frames'),
          visible: node.getBoundingClientRect().width > 0,
          waveform: node.querySelector('[data-timeline-waveform-canvas]') !== null,
          waveState: node.querySelector('[data-clip-waveform-state]')?.getAttribute('data-clip-waveform-state'),
          waveVisible: node.querySelector('[data-clip-waveform-visible]')?.getAttribute('data-clip-waveform-visible'),
          waveSource: node.querySelector('[data-clip-waveform-source]')?.getAttribute('data-clip-waveform-source'),
        })),
      }))
      throw new Error(`Waveform not rendered after reopen: ${JSON.stringify(diagnostic)}\n${error instanceof Error ? error.message : String(error)}`)
    }

    await desktopPage.getByRole('tab', { name: 'Visual' }).click()
    await desktopPage.getByText('editor-roundtrip-smoke.webm', { exact: true }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await desktopPage.getByRole('button', { name: 'Continue to Shots' }).click()
    await desktopPage.getByRole('button', { name: 'Detect shots' }).click()
    const reopenedShotBin = desktopPage.locator('[data-beatvideo-shot-bin]')
    await reopenedShotBin.waitFor({ state: 'visible', timeout: 30_000 })
    const reopenedFirstShot = reopenedShotBin.getByRole('button', { name: /^Shot 1 from .* Open in Source\.$/ }).first()
    await reopenedFirstShot.waitFor({ state: 'visible', timeout: 20_000 })
    const reopenedShotRange = reopenedShotBin.locator('[data-beatvideo-shot-open]').first()
    const reopenedShotText = await reopenedShotRange.innerText()
    if (reopenedShotText !== trimmedShotText) {
      throw new Error(
        `Saved shot review changed after reopen. Before: ${JSON.stringify(trimmedShotText)} After: ${JSON.stringify(reopenedShotText)}`,
      )
    }

    const reopenedVideoTimelineItem = desktopPage
      .locator('[data-timeline-item]')
      .filter({ hasText: 'editor-roundtrip-smoke.webm' })
      .first()
    await reopenedVideoTimelineItem.getByRole('button', {
      name: /Edit effects: 1 active, 0 bypassed/i,
    }).waitFor({ state: 'visible', timeout: 20_000 })

    console.log('Smoke: rendering and downloading a real video export')
    await desktopPage.getByRole('button', { name: 'Close source monitor' }).click()
    await desktopPage.getByRole('button', { name: 'Export', exact: true }).click()
    const exportDialog = desktopPage.getByRole('dialog')
    await exportDialog.getByRole('heading', { name: 'Export', exact: true }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await exportDialog.getByRole('button', { name: 'Small file', exact: true }).click()
    const exportVideoButton = exportDialog.getByRole('button', { name: 'Export Video', exact: true })
    await exportVideoButton.waitFor({ state: 'visible', timeout: 30_000 })
    await exportVideoButton.click()
    await desktopPage.getByText('Your video is ready to download.', { exact: true }).waitFor({
      state: 'visible',
      timeout: 120_000,
    })
    const downloadPromise = desktopPage.waitForEvent('download', { timeout: 30_000 })
    await desktopPage.getByRole('button', { name: 'Download', exact: true }).click()
    const download = await downloadPromise
    const suggestedName = download.suggestedFilename()
    if (!/\.(mp4|webm|mov|mkv)$/i.test(suggestedName)) {
      throw new Error(`Unexpected exported video filename: ${suggestedName}`)
    }

    if (desktopErrors.length) {
      throw new Error(`Desktop media round-trip errors:\\n${desktopErrors.join('\\n')}`)
    }
    console.log(
      'Real-media editor smoke passed: WebM trim/overwrite, Undo/Redo, WAV waveform/grid, GPU effect bypass, Color compare, save/reopen and downloaded video export are verified.',
    )
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
