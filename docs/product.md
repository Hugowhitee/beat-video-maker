# Product and architecture

## Product boundary

Beatvideo Maker is a small local-first, preset-first browser compositor for publishing a still cover image with a beat. It is not a general non-linear editor.

The intended fast path is:

1. choose image;
2. choose audio;
3. enter title and optional own wordmark/watermark;
4. choose a strong visual preset;
5. verify musical analysis;
6. preview;
7. export a clean 16:9 video.

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

## Vertical slice baseline

The first baseline is considered proven when:

- cover and audio can be imported locally;
- Clean preview renders a fixed 16:9 frame without stretching the foreground image;
- title and watermark are visibly configurable;
- playback and waveform are usable;
- browser export capability is reported honestly;
- a supported browser produces a non-empty encoded 1920×1080 / 30 fps file with audio;
- preview and export share the same compositor;
- minimum/normal/wide UI screenshots are generated and visually inspected;
- README and tests describe behavior that actually exists.

These gates are now the regression floor for later milestones.

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

Primary target: MP4, 1920×1080, 30 fps, H.264/AVC + AAC, with the decoded source audio unchanged.

Capability selection is explicit:

1. prefer MP4/H.264 + AAC;
2. if that path is unavailable, use WebM/VP9 + Opus when supported and label the fallback in the UI;
3. otherwise block export with an honest capability message.

Do not put VP9 in MP4 merely because a muxer permits it; container/codec pairings should favor broad playback compatibility.

For long exports, prefer a Mediabunny `StreamTarget` backed by OPFS so encoded bytes are flushed to browser storage rather than accumulated into one giant `ArrayBuffer`. Keep `BufferTarget` only as the compatibility fallback. Export can be cancelled; cancellation must close encoder/output resources and remove any partial scratch file.

Codec support is runtime state. Never report success until a non-empty finalized file exists.

## Musical grid

The first grid implementation now has one canonical analysis path:

- a Web Worker derives onset strength, tempo candidates and beat phase from decoded audio;
- `web-audio-beat-detector` is used only as an independent tempo/offset cross-check;
- half/double-time agreement is reconciled explicitly;
- tempo, beat phase and bar-1 confidence remain separate;
- low-confidence bar-1 inference is not promoted to a verified bar position;
- BPM and bar 1 remain directly correctable by the user;
- `musicalClock.ts` owns beat/bar phase math for every future preset.

Unknown remains unknown: analysis must never use a convincing-looking default BPM or bar offset merely because an estimator failed.

## Next v1 milestone

With the vertical-slice regression floor and first musical grid in place, implement:

- the remaining strong presets built from the shared layer model and musical clock;
- offline/local-first PWA behavior;
- autosaved user settings;
- a real full-beat duration/memory smoke test.

New presets must extend the compositor rather than create parallel render or timing paths.
