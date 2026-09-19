# Product and architecture

## Product boundary

Beatvideo Maker is a small local-first, preset-first browser compositor for publishing a still cover image with a beat. It is not a general non-linear editor.

The intended fast path is:

1. choose image;
2. choose audio;
3. enter title and optional own wordmark/watermark;
4. choose a strong visual preset;
5. verify musical analysis when that later milestone exists;
6. preview;
7. export a clean 16:9 MP4.

Source media remains on-device. The v1 browser target is current Chromium on Windows. A static secure host/PWA can come later; a backend is not required for the core workflow.

## Product principles

- The source photo remains the hero. Never regenerate or cosmetically alter it in the editor.
- Motion belongs mainly in background, light, text or restrained effects.
- Preview and export use one compositor and one timing contract.
- Automation must be overridable and must expose confidence rather than fake certainty.
- Prefer a few strong presets and controls over a timeline, layer tree or effect catalogue.
- User branding is optional. Never inject Parental Advisory, third-party badges or a default watermark.

## Composition model

Presets configure the same primitives rather than owning separate render trees:

1. Background layer — near-black/blurred media fill.
2. Foreground layer — sharp source cover.
3. Text layer — title and later optional subtitle.
4. Brand layer — optional user text or PNG/SVG wordmark.
5. Effect layer — reserved for restrained later visual effects.
6. Musical clock — reserved shared timing input; it is not a visible layer.

`renderComposition` is the canonical visual owner. Export code must call it rather than duplicate drawing logic.

## Current milestone: vertical slice

The vertical slice is complete only when these gates are true:

- cover and audio can be imported locally;
- Clean preview renders a fixed 16:9 frame without stretching the foreground image;
- title and watermark are visibly configurable;
- playback and waveform are usable;
- browser export capability is reported honestly;
- a supported browser can produce a non-empty 1920×1080 / 30 fps MP4 with audio;
- preview and export share the same compositor;
- minimum/normal/wide UI screenshots are generated and visually inspected;
- README and tests describe behavior that actually exists.

Do not expand into automatic BPM/downbeat analysis, particles or multiple motion presets while a vertical-slice gate is failing.

## Text and branding

Use a curated set of title directions rather than a huge font browser:

- Clean grotesk — Inter or an equivalent local sans;
- Condensed — Barlow Condensed or an equivalent local condensed sans;
- Editorial serif — Instrument Serif or an equivalent local serif;
- Technical mono — IBM Plex Mono or an equivalent local mono.

The vertical slice uses local/system equivalents so the browser remains offline-first without pulling fonts from a CDN. Exact bundled open font files may replace those stacks later when the repository deliberately takes ownership of their licenses and release size.

Title controls include font direction, size, position and tracking. Text must remain readable at small YouTube thumbnail size and long titles are fitted inside the composition safe width.

The Brand layer supports either producer/wordmark text or a user-supplied transparent PNG/SVG. Placement is corner-based with adjustable opacity. Safe-area guides exist only in preview and never render into export.

## Export

Target: MP4, 1920×1080, 30 fps, with the decoded source audio. H.264/AVC is preferred for broad playback compatibility. VP9-in-MP4 is an allowed runtime fallback when Chromium cannot encode AVC. AAC is the audio target; the official Mediabunny AAC encoder extension provides a local fallback.

Codec support is runtime state. Never mark export ready without an actual encoder capability check, and never report success until the output buffer is non-empty.

## MVP after the vertical slice

Once the vertical-slice gates are green, the remaining v1 scope is:

- five strong presets built from the shared layer model;
- BPM + beatgrid + bar-1 analysis with confidence;
- manual BPM/bar-1 correction;
- bar-synchronised preview;
- offline/local-first PWA behavior;
- autosaved user settings.

Beat analysis must keep tempo, beat phase/downbeat and arrangement as separate inferences rather than treating one detector as ground truth. New presets must extend the compositor rather than create parallel render paths.
