# Beatvideo Maker

A small local-first browser tool for turning a still cover image and a beat into a clean YouTube-ready MP4. It is preset-first on purpose: the common workflow should take minutes without becoming a miniature Premiere or CapCut.

## Current state

The repository is in its first vertical slice. The implemented scope is deliberately narrow:

- local JPG/PNG/WebP cover import;
- local browser-decodable audio import;
- a fixed 16:9 Clean compositor with blurred background fill and an unchanged sharp foreground;
- editable title font direction, size, tracking and placement;
- an optional producer/wordmark watermark as text or PNG/SVG, with corner and opacity controls;
- playback, seek and a lightweight decoded waveform;
- deterministic 1920×1080 / 30 fps MP4 export with the same compositor used by preview;
- H.264 is preferred for MP4; VP9-in-MP4 is a browser fallback; AAC has a Mediabunny WASM fallback;
- fixed-viewport Playwright visual QA and a real short export smoke test where the browser exposes an encoder.

Beat-grid/BPM analysis, musical motion and extra visual presets are intentionally **not** part of this milestone. Export reliability and preview/export parity come first.

## Run locally

Requirements: Node.js 22.12 or newer and a current Chromium browser.

    npm install
    npm run dev

Open the Vite URL, then choose a cover image and beat. Nothing is uploaded; media stays in the browser.

## Make a video

1. Choose a cover image and audio file.
2. Enter a title.
3. Optionally enter a producer/wordmark, or choose a transparent PNG/SVG watermark.
4. Choose one of the four curated title directions, then adjust size, tracking and placement.
5. Adjust watermark corner/opacity.
6. Play or seek to check the composition. Safe guides are preview-only.
7. Export. The app renders the same compositor at 1920×1080 and muxes the audio into an MP4 locally.

The Export button stays disabled when required media is missing or when the browser cannot provide a supported MP4 video encoder. The UI reports the capability instead of pretending an export succeeded.

## Browser support

v0.1 targets current Chrome, Edge and Brave on Windows. WebCodecs availability is checked at runtime. H.264 is preferred; VP9 is accepted as an MP4 fallback when H.264 encoding is unavailable. AAC encoding uses the browser when possible and the official Mediabunny AAC extension otherwise.

The title directions currently use local/system font stacks so the app does not fetch font assets from a CDN. Exact bundled open fonts can be added later as an explicit licensed asset decision.

## Architecture

`src/features/compositor/renderComposition.ts` owns visual composition. Both live preview and export call it; title/watermark rendering must not fork into a second export-only implementation.

`src/features/media/media.ts` owns local image/audio loading and waveform peak extraction. `src/features/export/exportMp4.ts` owns capability detection, Mediabunny/WebCodecs encoding and MP4 download. `App.tsx` stays focused on composing the user flow and state.

Stable product boundaries and the layer model live in [docs/product.md](docs/product.md). Visual review rules live in [docs/visual-qa.md](docs/visual-qa.md).

## Validation

Install Playwright's Chromium once, then run:

    npx playwright install chromium
    npm run check

`npm run check` runs repository hygiene, TypeScript, the production Vite build and Playwright tests. The visual test writes ignored screenshots to `artifacts/visual-qa/` at 1024×768, 1440×900 and 1920×1080. CI uploads those screenshots as an artifact; generating them is not considered a visual review by itself.

The media smoke test uploads generated local PNG/WAV fixtures. When a compatible WebCodecs video encoder is present, it downloads an actual MP4 and verifies the ISO-BMFF `ftyp` signature. If the runner lacks a compatible encoder, the test instead verifies that the app presents an honest capability gate.

## Privacy and scope

There is no account, media upload, API key or render server in the core workflow. Source media and generated output stay local to the browser. Do not add a generic timeline, asset library or cloud backend unless the product boundary is explicitly changed.

## Dependency choice

Mediabunny is used for browser-native media output instead of the deprecated `mp4-muxer` package. It provides maintained MP4 muxing, WebCodecs sources, codec capability checks and an official AAC fallback while keeping the compositor under this project's control.

See [AGENTS.md](AGENTS.md) before changing architecture, workflow or validation.
