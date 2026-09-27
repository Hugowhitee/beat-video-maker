# Beatvideo Maker

Beatvideo Maker is a local-first editor for turning a beat plus photos or footage into a finished music visual. It uses the mature [FreeCut](https://github.com/walterlow/freecut) editor/runtime as its foundation and adds Beatvideo-specific music analysis, Photo/Video workflows and assisted editing.

## Open the app

Primary hosted app: **https://beat-video-maker-live-production.up.railway.app/**

GitHub Pages remains a fallback deployment target: **https://hugowhitee.github.io/beat-video-maker/**. The production container is host-agnostic and serves the same built `dist/` with nginx; it does not rely on Vite Preview host allowlists.

On first use the browser asks for a local workspace folder. Project files, media metadata, caches and exports stay local; Beatvideo Maker does not require a cloud backend.

The normal flow is:

1. open or create a project;
2. choose **Photo** or **Video**, a name, format and FPS — project type is changed from Project Settings, not from a persistent editor toggle;
3. use **Beat** to import/select the beat, analyze it or enter a known BPM, verify the grid and place producer tags/watermarks;
4. use **Visual** to import the hero cover/footage, add layers and effects, and make compatible effect parameters audio-reactive;
5. use **Master** for the project EQ/compressor/saturation/limiter chain;
6. use Advanced Motion/Color or deeper FreeCut editing only when needed;
7. export locally for publishing.

## Product modes

### Photo

Focused cover-art workflow. **Beat → Visual → Master** is the normal path. Visual owns the cover, layers and effects; compatible numeric/animatable effect parameters expose **React** controls for Beat/Downbeat, Threshold, Amount and Release. Reactive presets are only quick starts, not the limit of what can react.

The photo stays the visual hero and normally spans the beat. Photo mode reuses the same timeline, renderer and export path as Video mode; deeper Motion/Color tools remain available under Advanced.

### Video

Footage + beat workflow. In addition to Media and Beat, Video exposes the mature FreeCut editing surface for clips, text, shapes, effects, transitions, motion/keyframes and export.

For the common one-clip workflow, **Loop clip to beat** repeats one imported video across the placed beat using normal FreeCut timeline items. Multi-clip edits remain normal editor operations; there is no second hidden Beatvideo timeline.

## Musical grid

Beat analysis is owned by the Beat This model. Beatvideo stores the resulting MusicMap with the project.

The musical grid is an overlay on FreeCut's canonical timeline:

- the normal timeline ruler owns click-to-seek and scrubbing;
- the normal playhead owns playback position;
- thin grid lines are beats;
- stronger numbered lines are bars;
- bar **1** is explicitly visible and can be locked to the current playhead;
- a BPM override rebuilds the grid analytically around the bar-1 anchor.

There is no separate waveform/playhead implementation, so musical markers cannot drift independently from clips or waveform geometry.

## FreeCut foundation

Beatvideo deliberately reuses FreeCut for specialist editor infrastructure instead of rebuilding simplified copies:

- workspace/project storage;
- media library and proxies;
- multi-track timeline and waveform;
- source preview and playback;
- clip operations, transitions and snapping;
- text, shapes and overlays;
- GPU effects and color tools;
- motion/keyframes;
- export/render queue and codecs.

Beatvideo-specific code should remain a small downstream layer. See [AGENTS.md](AGENTS.md) and [UPSTREAM_FREECUT.md](UPSTREAM_FREECUT.md).

## Development

Requirements: Node 22+ and Vite+.

```bash
vp install
vp dev --host
```

Normal downstream verification:

```bash
vp run check
vp run check:boundaries
vp run check:deps-contracts
vp test run
vp build
```

Railway production builds are source-controlled through `Dockerfile`, `deploy/nginx.conf.template` and `railway.json`. Node/Vite+ builds the app; nginx serves the static `dist/` with SPA fallback and the cross-origin-isolation headers required by the editor. This avoids provider-specific Vite Preview host allowlists.

GitHub Pages production builds remain supported with the project base `/beat-video-maker/`. The Pages workflow installs a SPA fallback so `/projects` and `/editor/<id>` can be refreshed there as well.

## Upstream and license

The downstream foundation started from FreeCut commit `4d62e8082c5eb387a96275bcbd323d28f6e41a62` under the MIT license. Provenance and downstream rules are documented in [UPSTREAM_FREECUT.md](UPSTREAM_FREECUT.md).

Do not copy the pre-migration custom Beatvideo editor back over FreeCut systems. Git history preserves that implementation for reference.
