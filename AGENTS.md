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

- **Photo:** hero still + beat. Default UI should emphasize media, text, effects, motion/color workspaces and later Beatvideo overlays. Hide video-only editing tools unless deliberately exposed as Advanced.
- **Video:** footage + beat. Keep cuts, transitions, shot/scene analysis and manual editing available; Beatvideo Guided/Auto planning is added on top.
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
