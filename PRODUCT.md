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
4. **Beat** — analyze and verify the musical grid.
5. **Edit** — preview/timeline plus the controls relevant to the selected mode.
6. **Export** — local render through the canonical FreeCut export path.

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
- Beatvideo Loop / Guided / Auto planning on top of the same timeline.

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

## Automation

Beatvideo's music intelligence owns:

- Beat This beat/downbeat analysis;
- MusicMap and musical sections;
- TransNet/ClipMap evidence where required;
- deterministic Loop / Guided / Auto edit planning;
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
