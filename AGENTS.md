# Beatvideo Maker downstream instructions

## Source of truth

This repository is a downstream product based on FreeCut.

- Upstream: `walterlow/freecut`
- Initial pinned snapshot: `4d62e8082c5eb387a96275bcbd323d28f6e41a62`
- Upstream license: MIT
- Downstream provenance: `UPSTREAM_FREECUT.md`
- Pre-migration custom Beatvideo Maker history remains in Git; do not copy its old editor shell back into the FreeCut architecture.

Read the current repository state before changing anything. Old chats and pre-migration code are supporting context only.

## Architecture rule

Prefer FreeCut's existing systems for:

- project/storage state;
- media import/library;
- timeline/edit operations;
- preview/playback;
- effects and GPU compositing;
- transitions;
- text/shapes/Lottie;
- keyframes and procedural motion;
- export/render queue/codecs;
- dialogs, popovers, tooltips and editor controls.

Do not add a parallel Beatvideo implementation when FreeCut already owns the responsibility.

Beatvideo-specific code should stay a small, recognizable product overlay. Port legacy Beatvideo code only when it is genuinely unique, especially:

- beat/downbeat/MusicMap analysis;
- precision musical-grid correction as fallback;
- beat/amplitude/phrase-reactive modulation;
- Beatvideo photo recipes/presets;
- Guided/Auto music-video edit planning.

## Product modes

`Photo` and `Video` are project-level workflows over one FreeCut project/runtime.

- **Cover layouts:** create normal independent text layers atomically. Never flatten title/subtitle/branding into one rendered asset or add a second cover-only canvas. Reuse the canonical text Inspector, text-motion engine, effects and project persistence.
- **Photo:** hero still + beat. The normal product route is Beat → Visual → Color → Master. Visual owns source placement plus visible Text/Graphics creation and selected-object effects/motion; Color owns focused grading. Do not hide primary producer tools behind a generic icon-rail collapse state. Hide video-only editing tools unless deliberately exposed as Advanced.
- **Reactive graphics:** Beat flash/frame/bars quick starts must materialize normal visual timeline layers and use the canonical mapped Beatvideo grid/transients through `audioReactive`. Do not create a separate visualizer time axis or audio-analysis engine. Do not call transient-driven 3-band pulse graphics a continuous FFT spectrum.
- **Video:** footage + beat. Visual owns footage import, scene preparation, configurable Auto Arrange/repeating motifs/manual placement plus text/effects/motion. Auto Arrange may use section energy to choose cadence, but every internal generated cut must land on the same corrected mapped beat grid used by the timeline/snap system. Keep generated slots editable/rebuildable and use canonical compound clips when repeated motifs are grouped. Keep cuts, transitions, shot/scene analysis and manual editing available; Beatvideo Guided/Auto planning is added on top.
- **Studio shell:** Program fullscreen targets only the Program monitor; monitor mute/volume are listening controls and never alter render gain. Master should expose the existing canonical mixer as a floating/resizable utility window instead of adding another audio workspace.
- **Compact editor:** phone-width layouts must expose the same project/editor state one surface at a time (Tools/Preview/Inspector/Timeline; Master also has docked Mixer). Do not solve mobile by shrinking the desktop three-column shell. Desktop remains the precision-first layout.
- **Producer timeline:** Beat/Visual/Master use one vertically scrolling FL-style track stack across video, images and project audio. Do not split the normal Beatvideo timeline into independently scrolling video/audio panes. Rich split-pane track plumbing may remain in Advanced/Motion when it serves specialist editing.
- **Beat IA:** beat import/source, analysis and grid correction are one primary flow. Producer tags/watermarks are optional project audio after that flow, not a peer `Grid / Tags` mode.
- **Video patterns:** Repeat motif materializes as one reusable Loop A sequence with multiple CompositionItem references to the same compositionId. Editing the shared sequence updates repeats. Reliable intro/outro edge sections stay outside Loop A; do not group non-motif segments into it.
- **Grid resolution:** one local Auto/Beat/1-bar/2-bar/4-bar/8-bar/16-bar preference controls both visible musical markers and musical snap targets. The normal timeline may step this density directly with more/fewer-line controls; never thin the stored MusicMap to implement view density.
- **Transitions:** Clean means cuts; Detroit accents are sparse real transition objects using existing renderers (e.g. Light Leak Burn / Film Gate Slip) only where source handles are valid. Keep them visible/selectable on the normal timeline.
- **Musical snapping:** clip moves, trims and razor operations use the same source-mapped musical targets the grid displays. Ctrl/Cmd may temporarily bypass snapping during a drag/trim; preserve existing Alt semantics such as duplicate-drag and rolling edit.
- **Grid correction:** precision alignment must focus/zoom the canonical FreeCut timeline waveform around Bar 1 or a selected beat and edit the same source-domain Beatvideo correction state. Do not add a second waveform/timeline just for correction. Whole-grid shift, verified Bar 1 and local drift anchors remain distinct actions. For stable programmed music, coherent low-end/kick onsets may correct detector phase (including a half-beat phase error) only when the audio evidence is materially stronger than the detector baseline.
- Never build separate Photo and Video render/export engines.
- Existing upstream/legacy projects without a Beatvideo mode resolve to `Video`. New Beatvideo projects default to `Photo`.

## Quality bar

The point of the FreeCut migration is to stop re-inventing mature editor UX.

- Reuse upstream interaction patterns and component primitives before creating new controls.
- Hide or remove features that are irrelevant to the active Beatvideo workflow; do not replace them with half-finished custom versions.
- A visible feature must be useful, correctly placed, and production-quality. If it has no meaningful workflow value yet, keep it out of the normal UI.
- Preserve progressive disclosure. Normal Photo work must not feel like a generic NLE.
- Validate UI changes in the actual editor, not only through component code review.
- Avoid AI-dashboard composition in the editor shell: no routine card-in-card nesting, decorative glows, micro-eyebrow/status-chip clutter or helper copy that merely restates visible controls. Prefer flat regions, thin dividers, aligned fields and direct manipulation.

## Verification

Use the repository's Vite+ toolchain.

Minimum for normal downstream changes:

```bash
vp install
vp run check
vp run check:boundaries
vp run check:deps-contracts
vp test run
vp build
```

For broad editor/runtime changes, use the stronger upstream verification/headless gates where relevant.

Do not vendor upstream GitHub Actions/release policy blindly. This downstream repository owns its own CI.
