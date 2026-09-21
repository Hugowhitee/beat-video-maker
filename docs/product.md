# Product and architecture

## Product boundary

Beatvideo Maker is a small local-first, preset-first browser compositor for beat-synchronised publishing videos. The proven v0.1 path is still cover image + beat; the post-v0.1 direction adds source-video assembly without turning the product into a general non-linear editor.

The intended v0.1 fast path is:

1. choose or confirm the project output format;
2. drop in an image/audio pair or add analyzed source videos;
3. enter title and optional own wordmark/watermark;
4. choose or adjust the visual treatment;
5. verify musical analysis when confidence needs correction;
6. preview in the actual output aspect;
7. export locally with the same resolved frame settings.

Source media remains on-device. The v1 browser target is current Chromium on Windows. The production PWA is hosted as a static GitHub Pages project site; a backend is not required for the core workflow.

## Product principles

- The source photo remains the hero. Never regenerate or cosmetically alter it in the editor.
- Motion belongs mainly in background, light, text or restrained effects.
- Preview and export use one compositor and one timing contract.
- Automation must be overridable and must expose confidence rather than fake certainty.
- Prefer a few strong presets and controls over a timeline, layer tree or effect catalogue.
- User branding is optional. Never inject Parental Advisory, third-party badges or a default watermark.
- Complex infrastructure is **upstream-first**: prefer maintained browser/platform APIs or mature open-source libraries for decoding, codecs, muxing, DSP/beat analysis, waveform infrastructure and comparable specialist code. Product code should wrap and validate those systems rather than recreate simplified versions.
- Reusing UI work is encouraged when licensing permits it, but reuse design primitives/components/icons rather than another app's identity. Third-party logos, names and distinctive brand assets are never Beatvideo Maker assets.
- Automatic editing should expose a compact plan the user can correct. Do not hide clip selection, beat placement or transition decisions behind an irreversible black box.
- Hard cuts are the normal transition. Effects such as film burn are sparse accents for musically important moments, never the default between every clip.

## Project output and media intake

Project output is editable project state, not a hard-coded export preset.

The canonical output settings own:
- publishing format: YouTube 16:9, Shorts 9:16, Square 1:1 or Custom;
- resolved width and height;
- 24 / 25 / 30 / 50 / 60 fps;
- photo/video background fill: restrained blur or black.

The preview canvas and export encoder consume the same resolved output settings. Changing aspect ratio must visibly change the preview geometry and changing FPS must change the encoder frame rate. Capability detection is repeated against the selected geometry instead of assuming 1080p30 support.

Media intake has one obvious local drop/browse surface that routes supported files to their canonical owners: still image, beat audio or one/more video sources. Specific source replacement controls may remain available, but they are secondary to the unified intake. The empty preview is an active add-media surface, never inert placeholder chrome.

Processing is explicit state. Decoding/analyzing/model preparation/rendering should look busy while it is busy; confidence labels are only shown as finished analysis evidence. Weak beat evidence must point into a correction workflow instead of becoming a dead-end warning.

## Post-v0.1 editing modes

Video work is organized as levels of automation that share one evidence model and one final edit plan:

1. **Still** — the existing image + beat workflow. Fastest path and always available.
2. **Loop** — create or auto-suggest one 4/8/16-bar edit motif, correct its cuts/transitions once, then repeat it. This is useful when a beat video only needs a strong repeating visual loop.
3. **Guided** — analyze the beat and source videos, expose detected beat/downbeat/section and shot evidence, then propose cut points and clip candidates. The user accepts/replaces/regenerates selected regions.
4. **Auto** — analyze the whole beat plus the source pool and build a complete section-aware edit. Repeated musical sections may reuse a motif with controlled variation instead of choosing unrelated random shots every time.

These are not separate editors. They all consume the same `MusicMap` and `ClipMap`, produce `EditMotif` / `EditPlan`, and are rendered/exported through the same compositor contract.

### Evidence maps and planner

Automatic video editing has three owners:

- `MusicMap` — beat/downbeat timing, musical sections, energy/intensity and confidence from maintained upstream analysis.
- `ClipMap` — source-video shots/usable ranges, boundary confidence and later motion/quality evidence from maintained media/vision tooling.
- `EditPlan` — deterministic product orchestration that decides which analyzed shot is used at which musical interval. This planner may be local code because it is Beatvideo Maker's product taste; it must not reimplement codec, shot-boundary or music-DSP primitives.

The planner varies cadence with the music. A calm intro/break should generally breathe; builds may tighten; drops/high-energy sections may mix 1/2/4-beat cuts with longer holds. It must not mechanically change video every four bars.

`EditMotif` is a reusable cut/source pattern over a musical loop or phrase. Loop mode repeats one motif exactly until the user changes it; Auto mode may reuse or vary motifs by section.

### Musical manual edit surface

The manual workflow borrows the directness of a video-editor timeline without copying a full Resolve/Premiere model.

The horizontal edit surface is primarily musical: beats, bars and phrases are the main ruler; seconds/timecode are secondary. Generated blocks are `EditPlan` segments.

Core operations:
- **Drop / Replace** changes the source shot underneath a fixed musical slot.
- **Cut** splits a segment at a snapped musical boundary.
- **Slip** moves the source in/out range while the timeline slot stays fixed.
- **Slide** moves the cut shared by two adjacent segments while their combined duration stays fixed.
- **Lock** protects a good manual choice from later regeneration.
- **Transition** is a small object on the cut boundary; absence means hard cut.

Loop mode edits one motif rather than a three-minute repeated timeline. Repeated segments carry a stable motif slot identity so source replacements, slips, cut slides and locks can propagate to linked copies. A later explicit detach/variation action may break one repeat away from the motif.

These manipulations are pure `EditPlan` operations and therefore work identically for Auto/Guided corrections. The UI must not maintain a parallel timeline state.

### Transition language and intro assets

Most edit points are **clean hard cuts**. In the edit-plan model, no transition object at a boundary means a normal hard cut. Effect transitions are separate cut-centered objects that reference the adjacent left/right segments, carry duration/alignment, and require enough hidden source handles on both sides. This follows the proven handle-based approach used by mature editors and avoids shortening/overlapping the visible segment timeline just to show an effect.

The first curated effect transition is **Film Burn**, used only as an optional accent at selected strong events such as a drop or deliberate section change. Do not reimplement this visual from scratch: the preferred source is Anastasia Dunbar's MIT-licensed `FilmBurn` shader from GL Transitions. Remotion's WebGL2 implementation is a useful modern reference, but Beatvideo Maker should take code/provenance from the MIT GL Transitions source and retain attribution in `THIRD_PARTY_NOTICES.md` if adapted.

A fixed intro/outro/stinger that the user drags into every video is modeled as a normal pinned media asset/segment. It should pass through the same source decode, preview and export path rather than gaining a separate renderer.

Heavy analysis models must be optional/lazy. The Still workflow must remain quick and must not download video-analysis models merely to open the app.

### Reuse map

Do not rebuild mature editor/media infrastructure merely to keep the repository small:

- **Mediabunny** stays the media container/decode/sample/export foundation, including source-video frame access.
- **Beat This!** is the preferred future beat/downbeat model; its code and published weights are MIT. The MIT musetric browser implementation is useful prior art for ONNX Runtime Web packaging and preprocessing, but numerical parity must be measured before choosing WebGPU or WASM execution.
- **TransNetV2** is the preferred shot-boundary model. Use the official MIT model contract with a thin browser adapter; do not adopt an otherwise-convenient wrapper that has no usable license.
- **FreeCut** (MIT) is prior art for a cut-centered transition model with hidden source handles and a GPU transition registry. Adapt that contract when transition rendering lands rather than inventing incompatible transition semantics.
- **Editly** (MIT) is prior art for a declarative structured edit specification. `EditPlan` should remain data, not hidden React state.
- **OpenCut** (MIT) is UI/editor prior art. Reuse selected interaction/component patterns where they fit the compact Beatvideo workflow; do not import its branding or full-NLE scope.
- GPL/AGPL tools such as Mixxx, Essentia and LosslessCut may inform research/behavior but are not default source-code dependencies under the current licensing direction.

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
- the default Clean preview renders the historical 16:9 baseline without stretching the foreground image;
- title and watermark are visibly configurable;
- playback and waveform are usable;
- browser export capability is reported honestly;
- a supported browser produces a non-empty encoded default 1920×1080 / 30 fps file with audio, while later project output settings must preserve that regression floor;
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

The Brand layer supports channel/producer text or a user-supplied transparent PNG/SVG. The default **Corner** layout preserves the conventional corner mark with adjustable opacity. The optional **Watermark grid** uses text only: it repeats the supplied name in a low-opacity staggered diagonal pattern clipped to the sharp foreground cover, sits below the title, and never spills into the blurred background. Uploaded graphics remain available when the user switches back to Corner. Safe-area guides exist only in preview and never render into export.

## Export

Primary container/codec target: MP4 with H.264/AVC + AAC and the decoded source audio unchanged. The default project frame is 1920×1080 / 30 fps, but current project output settings may select supported YouTube/Shorts/Square/Custom dimensions and 24/25/30/50/60 fps.

Capability selection is explicit:

1. prefer MP4/H.264 + AAC;
2. if that path is unavailable, use WebM/VP9 + Opus when supported and label the fallback in the UI;
3. otherwise block export with an honest capability message.

Do not put VP9 in MP4 merely because a muxer permits it; container/codec pairings should favor broad playback compatibility.

For long exports, prefer a Mediabunny `StreamTarget` backed by OPFS so encoded bytes are flushed to browser storage rather than accumulated into one giant `ArrayBuffer`. Keep `BufferTarget` only as the compatibility fallback. Export can be cancelled; cancellation must close encoder/output resources and remove any partial scratch file.

Codec support is runtime state. Never report success until a non-empty finalized file exists.

Imported audio is parsed/decoded through the existing Mediabunny media stack first, with the browser's native Web Audio decoder only as a compatibility fallback. Beatvideo Maker must not maintain its own compressed-audio codec/parser implementation.

## Musical grid

Musical analysis is specialist DSP and follows the upstream-first rule. A bespoke estimator is acceptable only as temporary, clearly bounded glue while a suitable maintained upstream implementation is being evaluated; do not let a hand-built prototype quietly become the permanent analysis engine.

The grid has one upstream-owned analysis path:

- `web-audio-beat-detector` is the tempo/first-beat detector and already runs its detector work through its maintained worker/broker stack;
- Beatvideo Maker compares the detector's tempo across several track windows only to decide whether the displayed confidence may rise from low to medium; this is orchestration, not a second home-grown DSP engine;
- because those window checks use the same detector, analysis never labels itself high-confidence from that agreement alone;
- bar 1/downbeat is intentionally **not guessed**. It remains unverified until the user sets it, so phrase-synchronised motion cannot be enabled from an invented downbeat;
- BPM remains directly correctable and `musicalClock.ts` owns the small beat/bar timing math consumed by presets.

Unknown remains unknown: a detector failure produces no BPM, and no default BPM or bar offset is synthesized merely to make the UI look complete.

## Visual presets v1

All presets are configurations of the same compositor and use the shared musical clock/audio envelope:

1. **Clean** — sharp foreground, near-black/subtle blurred background and almost no motion.
2. **Ambient** — stable foreground with slow 8-bar background pan/scale; bar-synchronised motion only activates when bar 1 is verified.
3. **Reactive** — Ambient-style base plus a restrained glow driven by the real decoded amplitude envelope. The foreground never pumps on every kick.
4. **Pulse** — static foreground with a subtle 8-bar brightness/title curve that returns exactly to its start value; disabled when bar 1 is unverified.
5. **Minimal visualizer** — photo remains hero; a small lower-edge line responds to real amplitude and is visually subordinate.

Motion is Off / Low / Medium. Presets must never invent tempo/phase logic or fake spectrum data.

## Hosting, installation and offline shell

Production builds generate a web app manifest and Workbox service worker through `vite-plugin-pwa`. The canonical hosted surface is the GitHub Pages project site at `https://hugowhitee.github.io/beat-video-maker/`.

The app owns a small install affordance in its top bar:
- **Install app** is always the visible user action while the app is not installed;
- when Chromium exposes `beforeinstallprompt`, that action invokes the browser-native install flow;
- otherwise the same action opens concise fallback guidance instead of pretending installability was detected;
- when `appinstalled` fires or the app already runs in standalone display mode, the install control is hidden.

The Pages build uses the project base `/beat-video-maker/`; local dev/test stays rooted at `/`. A deploy-path check must fail if the production HTML falls back to root-level `/assets` paths. The manifest keeps a stable relative `id: './'` so the installed PWA identity is not coupled to a future `start_url` change. The existing scalable app icon is explicitly declared for 192×192, 512×512 and scalable `any` install sizes.

The cached app shell can reopen offline after first use. Imported audio/images are runtime user media and are never persisted or added to the application cache.

Versioned local settings persist only low-risk editor preferences: title styling, channel/producer text, brand layout/placement/opacity, preset and motion amount. Invalid/old values fall back to conservative defaults and the user can reset the settings.

## Keyboard and editor history

v0.1 keyboard behavior is intentionally small and focus-safe:

- Space toggles play/pause;
- Left/Right seeks one second;
- Shift+Left/Right seeks one verified bar;
- Home jumps to the beginning;
- B sets bar 1 at the current playhead when audio is loaded;
- Enter in the BPM field applies the manual tempo immediately;
- Ctrl/Cmd+Z/Y (and Shift+Z for redo) restores relevant title/style editor state when a form control is not focused.

Undo/Redo is session state, not a second project-storage system. Focused form fields keep their native editing shortcuts.

## v0.1 release validation

Normal CI uses the committed npm lockfile and `npm ci`. It gates repository hygiene, typecheck, production/PWA build, synthetic analysis regressions, real short media encoding/cancellation and fixed-viewport visual evidence.

A separate manual **Full export smoke** workflow owns sustained-duration validation so every small commit does not encode an entire beat. It intentionally uses the default 1920×1080 / 30 fps production path as the sustained regression case, defaults to 120 seconds, verifies a real finalized container and requires the OPFS/disk-backed output target. Run it on current `main` before a tagged release.

Real-user beat analysis quality still benefits from a ground-truth FL Studio corpus; do not invent such evidence from synthetic fixtures. Confidence gating and manual BPM/bar-1 correction remain the safety net until that corpus exists.

New work must preserve the single compositor, analysis and export owners.


## Title layout and templates

Title layout uses one canonical free-position model:

- normalized X/Y coordinates;
- left / center / right text alignment;
- title size/font/tracking;
- 3×3 quick-position buttons that simply write sensible X/Y/alignment values;
- a one-shot **Place on canvas** interaction for direct positioning;
- optional safe-area + rule-of-thirds/center guides while authoring.

Guide overlays are preview-only. Video export must explicitly render with guides/grid disabled.

Editable authoring presets are real local files: `.beatvideo-template.json`.

Template v2 contains:
- title text and title layout/style;
- producer/watermark text settings;
- visual preset and motion amount;
- the ordered visual effect stack plus analytic modulation records.

Version 1 templates remain importable and migrate to an empty effect stack. Templates intentionally do **not** contain source image/audio/video data or binary watermark graphics. Template import validates the full versioned schema before applying anything; invalid or future-version files fail without partially changing the project. Once opened, every template value remains normal editable state.


## Effect stack and modulation

The post-v0.1 visual system is migrating the existing preset branches onto one ordered, inspectable effect stack. This first tranche adds the canonical stack and keeps the legacy preset render behavior for compatibility while later pixel-effect work converges on the shared pipeline.

Canonical data:
- `VisualEffectInstance[]` — ordered, stable-id effect instances;
- target = background / foreground / composite;
- enabled + strength + typed params per instance;
- `EffectModulation[]` — separate analytic drivers attached to effect properties/strength;
- deterministic immutable stack operations for reorder, enable/disable, strength and removal.

The first curated registry is deliberately small:
- Zoom punch — foreground transform accent;
- Shake — foreground deterministic transform noise;
- Background drift — slow background transform;
- Glow — composite light accent;
- Blur — background/composite blur.

This foundation adapts the effect-instance/registry and analytic modulation ideas from MIT FreeCut rather than inventing a second generic effects architecture. The full NLE is not imported.

Beat/downbeat/amplitude/phrase modulation is evaluated at render time from the shared musical grid/audio envelope. Beat pulses use a short analytic attack/decay envelope rather than thousands of generated keyframes. Phrase modulation is signed so drift can travel naturally in both directions.

The data contract is intentionally independent of the rendering backend. Transform effects may be resolved as small compositor math; pixel effects should converge on one shared GPU pipeline. Presets become authored stack recipes instead of separate compositor implementations.
