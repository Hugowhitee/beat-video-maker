# Beatvideo Maker

A small local-first browser tool for turning a still cover image and a beat into a clean YouTube-ready video. It is preset-first on purpose: the common workflow should take minutes without becoming a miniature Premiere or CapCut.

## Install the app

The normal way to use Beatvideo Maker is the hosted PWA:

**https://hugowhitee.github.io/beat-video-maker/**

**Do not clone the repository or download a ZIP for normal use. You do not need Node.js or npm.**

1. Open that link in current Chrome or Edge on Windows.
2. Click **Install app** in Beatvideo Maker's top bar.
3. If Chromium exposes its native install prompt, the button opens it directly. Otherwise the same button shows concise fallback instructions. You can also use the install icon in the browser address bar or the browser's install-app menu item; wording varies by browser.
4. Accept the browser install dialog. Beatvideo Maker then opens as a standalone app and can be pinned to Start/taskbar like a normal app.

The first successful visit needs the hosted site so the app shell can be cached. After that, the installed shell can reopen offline. Imported cover images/audio are never uploaded or stored in the app cache.

If the hosted URL is not available yet, the repository owner must do the one-time GitHub setup: **Settings → Pages → Build and deployment → Source → GitHub Actions**. Normal users do not need Node.js or npm.

## Current state

The first vertical slice is implemented and validated:

- local JPG/PNG/WebP cover import;
- local browser-decodable audio import;
- a fixed 16:9 Clean compositor with blurred background fill and an unchanged sharp foreground;
- editable title font direction, size, tracking and placement;
- an optional channel/producer watermark as text or PNG/SVG, with a normal corner layout or a subtle repeated text grid clipped to the sharp cover;
- playback, seek and a lightweight decoded waveform;
- deterministic 1920×1080 / 30 fps export with the same compositor used by preview;
- MP4/H.264 + AAC when available, with an explicit WebM/VP9 + Opus fallback instead of putting VP9 in an MP4 container;
- disk-backed OPFS streaming for long browser exports where available, with an in-memory compatibility fallback;
- cancellable export with partial-output cleanup;
- BPM + beat-phase analysis with explicit confidence, independent cross-check, half/double tempo correction and manual bar-1 correction;
- a shared musical-clock module used by all presets;
- five presets: Clean, Ambient, Reactive, Pulse and Minimal visualizer;
- versioned local style/brand preferences (media is never persisted);
- generated Workbox service worker + web app manifest, hosted through GitHub Pages for a normal install/offline app-shell flow;
- keyboard transport plus session Undo/Redo for relevant editor state;
- fixed-viewport Playwright visual QA and a real encoded-file smoke test.

Musical analysis is now implemented as a first usable pass: an in-worker onset/tempo/phase analyzer is reconciled with `web-audio-beat-detector` as an independent cross-check. BPM and bar 1 remain manually correctable, and low-confidence bar inference is shown as unverified instead of being silently accepted. All five v1 presets now share the same compositor, real amplitude envelope and musical clock. Style/brand preferences are saved locally, and production builds generate an installable offline PWA shell.

## Development only

Requirements: Node.js 22.12 or newer and a current Chromium browser.

    npm ci
    npm run dev

Open the local Vite URL. Local development is not the recommended installation route; use the hosted HTTPS PWA for the real install experience.

## Make a video

1. Choose a cover image and audio file.
2. Enter a title.
3. Optionally enter a channel/producer watermark, or choose a transparent PNG/SVG mark.
4. Choose **Corner** for a conventional mark, or **Watermark grid** to repeat the text subtly across only the sharp cover image.
5. Choose one of the four curated title directions, then adjust size, tracking and placement.
6. Adjust watermark placement/strength.
7. Play or seek to check the composition. Safe guides are preview-only.
8. Export. Current Chromium normally uses MP4/H.264 + AAC; a clearly labeled WebM fallback is used only when that MP4 path is unavailable.
9. During a long render, the Export button becomes a Cancel action.

The app checks codec support at runtime and never reports an export as successful until a real non-empty encoded file exists.

### Keyboard

- Space — play/pause.
- Left / Right — seek one second.
- Shift + Left / Right — seek one verified bar.
- Home — jump to the start.
- B — set bar 1 at the current playhead when audio is loaded.
- Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Shift+Ctrl/Cmd+Z) — undo/redo relevant title/style state when a form control is not focused.
- Enter in the BPM field — apply the manual tempo and regrid immediately.

Focused form controls keep their normal browser keyboard behavior.

## Browser support

v0.1 targets current Chrome, Edge and Brave on Windows. WebCodecs availability is checked at runtime.

The title directions currently use local/system font stacks so the app does not fetch font assets from a CDN. Exact bundled open fonts can be added later as an explicit licensed asset decision.

Long exports prefer an Origin Private File System (OPFS) backed Mediabunny `StreamTarget`, which avoids growing one giant renderer-process `ArrayBuffer`. Browsers without OPFS fall back to `BufferTarget`.

## Architecture

`src/features/compositor/renderComposition.ts` owns visual composition. Both live preview and export call it; title/watermark rendering must not fork into a second export-only implementation.

`src/features/media/media.ts` owns local image/audio loading and waveform peak extraction. `src/features/analysis/` owns tempo/phase inference and the shared musical clock; bar inference is confidence-gated and can remain unverified. `src/features/export/exportVideo.ts` owns capability selection, Mediabunny/WebCodecs encoding and download. `src/features/export/outputTarget.ts` owns disk-backed versus in-memory output. `App.tsx` stays focused on the user flow and state.

Stable product boundaries and the layer model live in [docs/product.md](docs/product.md). Visual review rules live in [docs/visual-qa.md](docs/visual-qa.md).

## Validation

Install Playwright's Chromium once, then run:

    npx playwright install chromium
    npm run check

`npm run check` runs repository hygiene, TypeScript, the production Vite build, a PWA-output gate and Playwright tests. The visual test writes ignored screenshots to `artifacts/visual-qa/` at 1024×768, 1440×900 and 1920×1080. CI uploads those screenshots as an artifact; generating them is not considered a visual review by itself.

The media smoke test runs once at the normal desktop project because encoding is viewport-independent. It uploads generated local PNG/WAV fixtures, downloads an actual encoded file, validates the MP4/WebM container signature and separately verifies cancellation behavior.

A separate **Full export smoke** GitHub Actions workflow is intentionally release-only rather than part of every commit. It runs the same 1080p production export path for a configurable sustained duration (120 seconds by default) and fails unless the browser reports the OPFS/disk-backed target. Locally, set `FULL_EXPORT_SECONDS` and run `npm run test:full-export`.

## Privacy and scope

There is no account, media upload, API key or render server in the core workflow. Source media and generated output stay local to the browser. Do not add a generic timeline, asset library or cloud backend unless the product boundary is explicitly changed.

## Dependency choice

Mediabunny is used for browser-native media output instead of the deprecated `mp4-muxer` package. It provides maintained container muxing, WebCodecs sources, codec capability checks, streaming targets and an official AAC fallback while keeping the compositor under this project's control.

See [AGENTS.md](AGENTS.md) before changing architecture, workflow or validation.


## Presets

- **Clean** — sharp foreground, restrained background and almost no motion.
- **Ambient** — slow 8-bar background pan/scale; it stays static until bar 1 is verified.
- **Reactive** — Ambient-style base with a small glow driven by the real decoded audio amplitude envelope.
- **Pulse** — subtle 8-bar brightness/title accent curve; it stays static until bar 1 is verified.
- **Minimal visualizer** — a small real amplitude line at the lower safe edge, never a fake spectrum.

Motion has Off / Low / Medium levels. No preset owns its own timing detector; they all consume the shared grid.


## Offline and saved preferences

Production builds use `vite-plugin-pwa`/Workbox to generate the manifest and service worker. After the app shell has been visited and cached, the editor can reopen without a network connection. Imported media is never cached by the app.

Style choices such as preset, motion amount, title styling and producer/wordmark defaults are stored in versioned `localStorage`. The Style panel can reset those preferences to defaults.


## Deployment

Production deploys use GitHub Pages from `main`. The Pages build sets the Vite project base to `/beat-video-maker/`, validates that compiled asset URLs stay inside that project path, uploads only `dist/`, and deploys through the `github-pages` environment.

The repository must have **Settings → Pages → Source: GitHub Actions** enabled once. After that, every successful `main` deployment updates the hosted app automatically.
