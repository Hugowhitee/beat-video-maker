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
- **Video:** footage + beat. Visual owns footage import, scene preparation, configurable Auto Arrange/repeating motifs/manual placement plus text/effects/motion. Auto Arrange may use section energy to choose cadence, but every internal generated cut must land on the same corrected mapped beat grid used by the timeline/snap system. Keep generated slots editable/rebuildable and use canonical compound clips when repeated motifs are grouped. Keep cuts, transitions, shot/scene analysis and manual editing available; Beatvideo Guided/Auto planning is added on top.
- **Grid correction:** precision alignment must focus/zoom the canonical FreeCut timeline waveform around Bar 1 or a selected beat and edit the same source-domain Beatvideo correction state. Do not add a second waveform/timeline just for correction. Whole-grid shift, verified Bar 1 and local drift anchors remain distinct actions.
- Never build separate Photo and Video render/export engines.
- Existing upstream/legacy projects without a Beatvideo mode resolve to `Video`. New Beatvideo projects default to `Photo`.

## Quality bar

The point of the FreeCut migration is to stop re-inventing mature editor UX.

- Reuse upstream interaction patterns and component primitives before creating new controls.
- Hide or remove features that are irrelevant to the active Beatvideo workflow; do not replace them with half-finished custom versions.
- A visible feature must be useful, correctly placed, and production-quality. If it has no meaningful workflow value yet, keep it out of the normal UI.
- Preserve progressive disclosure. Normal Photo work must not feel like a generic NLE.
- Validate UI changes in the actual editor, not only through component code review.

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
