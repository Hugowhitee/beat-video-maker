# Beatvideo Maker product

## Purpose

Beatvideo Maker is a focused local-first editor for beat-driven photo and music-video visuals. It combines a fast music-production workflow with the interaction quality of a mature desktop video editor.

The product is downstream of FreeCut. FreeCut owns the general editing engine; Beatvideo owns the narrower workflow, music intelligence and product hierarchy.

## Primary users

Music producers and creators who already understand timelines, beats, bars and basic video editing. They want something faster than setting up a full generic NLE for every beat visual, without losing real editor controls when they need them.

## Primary hierarchy

The app is project-first, not upload-first.

1. **Projects** — open an existing project or create one.
2. **New project** — name, Photo/Video type, output format and FPS.
3. **Media** — bring in cover/beat or footage/beat.
4. **Beat** — analyze and verify the musical grid, then place beat-aware producer tags/watermarks.
5. **Edit** — preview/timeline plus the controls relevant to the selected mode.
6. **Export** — finish the project audio, render locally and optionally continue to publishing.

A source upload is never the app's home screen.

## Photo mode

Photo mode is the fastest path for a beat visual:

- still image is the hero;
- beat audio drives the musical grid;
- Media, Beat, Overlay and Effects are first-class;
- motion/color remain available through FreeCut workspaces/properties;
- generic video-only controls stay out of the normal path.

Overlay means real timeline/compositor layers built from FreeCut primitives: text, imported logo/image and simple shapes. It is not a renamed preset/look menu.

## Video mode

Video mode exposes footage editing without changing engines:

- normal FreeCut timeline, waveform, playhead and seeking;
- cuts, slip/slide and transitions;
- text/shapes/effects;
- motion/keyframes and color;
- **Loop clip to beat** for the common single-footage workflow, materialized onto the same timeline.

Importing footage should make the next action obvious: inspect it or drag it onto the timeline. Beatvideo automation may create timeline items, but it never creates a parallel hidden edit state.

## Musical grid contract

The old standalone Beatvideo waveform/grid is not part of the product direction.

The canonical rule is:

- FreeCut owns the time axis, playhead, waveform and click/scrub behavior;
- Beatvideo analysis is stored in **source-media time** and is mapped through the actual FreeCut timeline clip, including move, trim, speed and reverse;
- never draw raw analysis seconds as absolute timeline seconds;
- Beat This detected beat positions are the default **Detected beatmap** and keep their local timing;
- **Fixed BPM** is a deliberate alternate mode that creates one mathematically even grid; entering a BPM must not silently flatten detected timing;
- beats and bars remain fixed to their waveform while the playhead moves;
- bar 1 is visually unambiguous and detected bar 1 is distinguished from a user-verified bar 1;
- DJ-style corrections (phase nudge and correction anchors) are explicit, reversible source-domain project state;
- multiple correction anchors form a piecewise timing map so long tracks can be corrected without forcing one global BPM;
- analysis progress is visible while work is actually running.

The grid should feel closer to mature DJ/DAW beat-grid tooling than a decorative waveform widget: stable waveform lock, clear downbeats, direct seeking, obvious correction controls and no second hidden timeline.


## Producer tags and watermarks

Producer tags are a musical-timeline workflow, not generic overlay audio and not a second hidden sequencer.

- the beat grid is the timing authority;
- tag audio remains a normal one-shot at its natural playback speed by default; changing project BPM or tag spacing must not time-stretch the voice;
- a tag can define a source trim plus an **anchor inside the trimmed clip** so a meaningful word/hit can land on a bar while a riser or lead-in starts earlier;
- pattern placement exposes a clear first bar plus repeat interval such as 8, 16, 32 or 64 bars;
- generated repetitions materialize as normal FreeCut audio clips on a dedicated producer-tag track;
- after generation, any repetition can be moved, trimmed, faded, turned down or deleted without breaking the rest of the pattern;
- optional automatic ducking belongs to the tag clip and targets the beat/music track, so the music moves behind the spoken tag without requiring the user to build a manual sidechain graph;
- do not force producer-tag audio to declare a BPM unless the user explicitly chooses creative time-stretching in an advanced workflow.

This deliberately borrows the useful mental model from a DAW playlist—bar grid, tracks and editable clips—without copying a DAW channel rack, plugin routing graph or other production complexity into the default Beatvideo surface.

## Audio finish and mastering direction

Beatvideo Maker should be able to finish an already-produced stereo beat for publishing without requiring a separate FL Studio session. This is a **finishing/mastering workflow**, not a replacement for full multitrack music production.

The canonical implementation must build on the existing project-scoped master bus, bus EQ, preview pipeline and export mixer so preview and render remain equivalent.

Default surface:

- one small master/finish preset selector;
- input/output level;
- loudness and true-peak feedback;
- a small intensity/drive control only when it maps to real DSP;
- safe reset/bypass and A/B;
- advanced access to the existing mixer/bus EQ rather than duplicating those controls.

The eventual finishing DSP may include tonal EQ, low-end control, saturation/soft clipping and final limiting, but a control must not appear until the processing exists in both preview and export. Presets such as Clean, Hard/Flat and 808 Punch are product recipes over the same canonical DSP chain, not separate engines.

A stereo master cannot independently remix a buried 808, kick or hat. Do not imply stem-level control when only a finished stereo beat is available.

## Publishing direction

The export flow may continue directly into YouTube publishing so the common producer job can become:

**beat + cover → grid → tags/watermark → visual → finish → export → YouTube**

Publishing remains an explicit user action after a successful local render. It must not silently upload during export.

For YouTube:

- use the official YouTube Data API and OAuth for the connected channel;
- upload the already-rendered Beatvideo output; do not create a separate server-render path only for publishing;
- use resumable uploads with visible progress/retry state;
- let the user review title, description, tags, thumbnail and privacy before upload;
- reuse Beatvideo's publication metadata/templates where available instead of asking for the same information twice;
- keep local export usable without a Google/YouTube connection;
- treat API-project verification/audit requirements as a deployment constraint rather than hiding them behind a non-working Publish button.

Direct publishing should feel like the last step of Export, not a separate social-media dashboard.

## Automation

Beatvideo's music intelligence owns:

- Beat This beat/downbeat analysis;
- MusicMap and musical sections;
- TransNet/ClipMap evidence where required;
- deterministic edit-plan infrastructure for assisted multi-clip editing; only workflows that are fully wired into the product surface should be presented as user-facing modes;
- beat/amplitude/phrase reactive modulation.

Automation must remain inspectable and correctable. It produces normal FreeCut project/timeline data.

## Design

The interface is precise, calm and dense enough to scan quickly. The preview and content carry attention; chrome recedes.

Avoid:

- AI-generated dashboard/card aesthetics;
- tiny ambiguous controls;
- inert placeholder features;
- duplicate controls that do nearly the same thing;
- explanatory copy in place of a working interaction;
- separate custom editor systems where FreeCut already has a mature implementation.

Prefer direct manipulation, conventional editor behavior, consistent spacing and progressive disclosure.

## Local-first boundary

Projects and media stay local. The browser may ask the user to choose a workspace folder before project creation so the editor has a durable local source of truth. Core editing does not require accounts, cloud uploads or a rendering backend.

## Upstream rule

FreeCut remains a maintained dependency/foundation, not a one-time code dump. Keep Beatvideo-specific changes localized and preserve upstream lineage and MIT provenance in `UPSTREAM_FREECUT.md`.
