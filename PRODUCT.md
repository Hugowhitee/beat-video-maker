# Beatvideo Maker product

## Purpose

Beatvideo Maker is a focused local-first editor for beat-driven photo and music-video visuals. It combines a fast music-production workflow with the interaction quality of a mature desktop video editor.

The product is downstream of FreeCut. FreeCut owns the general editing engine; Beatvideo owns the narrower workflow, music intelligence and product hierarchy.

## Primary users

Music producers and creators who already understand timelines, beats, bars and basic video editing. They want something faster than setting up a full generic NLE for every beat visual, without losing real editor controls when they need them.

## Primary hierarchy

The app is project-first globally and **beat-first inside a project**.

1. **Projects** — open an existing project or create one.
2. **New project** — keep setup minimal: name, Photo/Video type and only output settings that must be known up front. Photo/Video is project configuration: change it from project settings when needed, not from a persistent editor-toolbar toggle.
3. **Beat** — import/select the beat, enter a known BPM or analyze it, verify the musical grid and place producer tags/watermarks.
4. **Visual** — add the hero cover or footage. Photo sources can fill the beat automatically; video sources may be analyzed on import, Auto Arranged against the verified grid, looped to the beat or dragged manually onto the normal timeline. Text, overlays, motion/camera movement and one canonical effects inspector live with the visual work instead of being split across unrelated product pages.
5. **Color** — focused grading/correction over the same selected visual/timeline state. Color stays separate because grading is a distinct finishing task; motion does not get a separate top-level Beatvideo page.
6. **Master** — finish the stereo beat through the project master rack plus the existing real track mixer. Dedicated Beat, Producer tags and Watermarks tracks automatically become mixer channels; preview and export use the same processing model.
7. **Publish** — render locally, review publication metadata and optionally continue to YouTube.

A source upload is never the app's global home screen. Inside an opened Beatvideo project, however, the beat is the primary production input and should be the obvious first action.

## Photo mode

Photo mode is the fastest path for a beat visual:

- still image is the hero;
- beat audio drives the musical grid;
- Beat, Visual, Color and Master are the primary workflow pages;
- Visual begins with an explicit **Visual source** action: add/replace the hero still in Photo, or add footage in Video; imported footage may be prepared for scene-aware Auto Arrange immediately;
- Visual uses visible labeled creation tools such as Media, Text and Graphics rather than a collapsed icon rail; effect browsing, applied effects, transform motion, camera shake and audio-reactive controls live together in the visible Inspector on the right;
- Color remains a focused grading workspace; motion/composition internals remain available through FreeCut when needed but are not a normal top-level Beatvideo navigation step;
- generic video-only controls stay out of the normal path.

Overlay means real timeline/compositor layers built from FreeCut primitives: text, imported logo/image and simple shapes. It is not a renamed preset/look menu.

Audio reactivity is a capability of effect parameters, not a small preset category. Quick reactive looks are shortcuts only and belong in the same Inspector as applied effects. Any GPU-effect numeric parameter marked safe/animatable by the effect definition should expose a compact React control next to the real parameter; advanced driver/timing controls stay progressively disclosed. Audio-hit/low/mid/high drivers use analyzed transient evidence, while Beat/Downbeat drivers use the corrected musical grid. Non-numeric choices, quality-only controls and parameters that cannot be modulated deterministically do not expose React. Do not duplicate a second generic “Audio Reactive” panel underneath specialized effect editors.

## Video mode

Video mode exposes footage editing without changing engines:

- normal FreeCut timeline, waveform, playhead and seeking;
- cuts, slip/slide and transitions;
- text/shapes/effects;
- motion/keyframes and color;
- **Auto Arrange footage** for multi-source music-video editing: existing FreeCut scene detection supplies shot boundaries, while the verified corrected beat grid determines every generated internal cut position;
- Auto Arrange exposes meaningful producer controls—pace, **Clean cuts / Detroit accents** and an optional repeating bar motif—without exposing planner internals. Detroit accents are sparse real FreeCut transitions at strong musical section changes, currently alternating Light Leak Burn and Film Gate Slip when source handles permit them;
- section/energy analysis may change cadence and source choice, but a raw section timestamp must never pull a generated cut away from the corrected musical grid. In Loop mode, a high-confidence intro touching the song start and/or high-confidence outro touching the song end stays outside Loop A at beat-locked boundaries; low-confidence labels never invent structure;
- generated shots remain editable through one compact **Arrangement grid** in Visual: each cell represents an existing beat-locked generated slot; a detected shot from the collapsible Shot tray can be dragged onto a cell, while the per-slot selector remains the keyboard/fallback route. Replacing a slot changes source media only—its timeline boundaries stay on the corrected musical grid. A shot can still be marked to avoid on the next rebuild; repeated motif slots propagate source replacement across their linked repeats;
- repeating motifs use one reusable FreeCut **Loop A** sequence with multiple timeline instances. Double-clicking any Loop A instance opens the shared internal cuts; editing that sequence once updates every linked repeat. A future explicit **Make Unique** action may fork one instance for deliberate variation, but repeats must not silently diverge;
- **Fill with one clip** remains a simpler fallback for one repeated source;
- rebuilding a generated arrangement replaces the previous generated clips atomically instead of stacking another edit on top;
- all generated routes materialize normal editable FreeCut timeline clips with source trims and muted footage audio.

Auto Arrange does **not** cut on every beat. Beats/downbeats are timing anchors; pace, music-section energy, available shot duration and reuse policy determine whether a segment lasts 1, 2, 4, 8, 16 or another musically sensible beat span. Internal boundaries still land on the corrected mapped beat grid. Manual edits remain authoritative after generation.

## Musical grid contract

The old standalone Beatvideo waveform/grid is not part of the product direction.

The canonical rule is:

- FreeCut owns the time axis, playhead, waveform and click/scrub behavior;
- Beatvideo analysis is stored in **source-media time** and is mapped through the actual FreeCut timeline clip, including move, trim, speed and reverse;
- never draw raw analysis seconds as absolute timeline seconds;
- Beat This beat/downbeat positions are timing **evidence**, not automatically the final grid. For stable programmed music, fit one global tempo + phase/anchor across the track and accept it only when residual error and local tempo drift stay within confidence bounds;
- coherent source-audio onset evidence may refine the fitted phase so a detector that consistently fires slightly after a kick/transient does not leave the visible grid late;
- when timing genuinely varies, preserve a **Variable beat map** instead of forcing a constant grid that drifts away later in the song;
- **Fixed BPM** entered by the user remains a deliberate manual alternate mode that creates one mathematically even grid; entering a BPM must not silently replace a trusted detected/variable map unless the user chooses it;
- beats and bars remain fixed to their waveform while the playhead moves; viewport waveform canvases must redraw when their absolute timeline window moves so horizontal scrolling can never make waveform pixels drift under a fixed grid;
- grid density is zoom-aware: close zoom may show individual beats, medium zoom prioritizes bars, and wide zoom steps through 2/4/8/16-bar phrase landmarks instead of drawing a fence of lines;
- **Beat grid** visibility and **Beat snap** are separate user controls;
- **Grid resolution** is one local editor preference shared by display and musical snapping: Auto / Beat / 1 bar / 2 bars / 4 bars. Auto thins the grid with zoom; manual bar resolutions are anchored to verified Bar 1. Changing this preference never rewrites the underlying MusicMap;
- when Beat snap is enabled and a musical grid exists, move/trim/razor edits snap to the exact mapped positions currently selected by Grid resolution; generic seconds-based snapping is only the fallback before a beat grid exists or musical snapping is explicitly disabled;
- low/mid/high transient-energy evidence may drive reactive effects, but it is not a second timing axis and does not justify a permanent decorative spectrum strip in Beat. Grid verification uses the canonical waveform plus beat/downbeat/Bar-1 markers; expose spectral evidence only where a reactive-effect control actually needs it;
- bar 1 is visually unambiguous, is never assumed to be 0:00, and detected bar 1 is distinguished from a user-verified bar 1;
- DJ-style corrections (phase nudge and correction anchors) are explicit, reversible source-domain project state;
- precision alignment deliberately reuses the canonical timeline waveform: focusing Bar 1 or a nearby beat zooms and centers the normal timeline to onset detail, shows playhead-to-grid offset, and applies whole-grid/Bar-1/local-anchor correction from there; never introduce a second correction waveform or hidden time axis;
- multiple correction anchors form a piecewise timing map so long tracks can be corrected without forcing one global BPM;
- analysis progress is visible while work is actually running.

The grid should feel closer to mature DJ/DAW beat-grid tooling than a decorative waveform widget: stable waveform lock, clear downbeats, direct seeking, obvious correction controls and no second hidden timeline.


## Producer tags and watermarks

Producer tags are a musical-timeline workflow, not generic overlay audio and not a second hidden sequencer.

- the beat grid is the timing authority;
- tag audio remains a normal one-shot at its natural playback speed by default; changing project BPM or tag spacing must not time-stretch the voice;
- a tag can define a source trim plus an **anchor inside the trimmed clip** so a meaningful word/hit can land on a bar while a riser or lead-in starts earlier;
- pattern placement exposes a clear first bar plus repeat interval such as 8, 16, 32 or 64 bars;
- **Producer tag** and **Watermark** are separate sources and separate tracks: Producer tags are intentional one-shots placed at the playhead; Watermarks are repeated protection tags aligned to musical bars on a dedicated Watermarks track;
- a watermark pattern exposes first bar plus repeat interval such as 8, 16, 32 or 64 bars and reapplying the pattern replaces only the Watermarks track, never the producer-tag source or track;
- generated tag/watermark clips materialize as normal FreeCut audio clips;
- after generation, any clip can be moved, trimmed, faded, turned down or deleted without breaking unrelated tag/watermark content;
- optional automatic ducking belongs to the tag clip and targets the beat/music track, so the music moves behind the spoken tag without requiring the user to build a manual sidechain graph;
- the compact first implementation may use numeric trim/anchor fields, but the intended direct-manipulation UI is a small tag waveform with start/end handles and one draggable anchor marker; do not grow a second waveform/timeline system around it;
- do not force producer-tag audio to declare a BPM unless the user explicitly chooses creative time-stretching in an advanced workflow.

This deliberately borrows the useful mental model from a DAW playlist—bar grid, tracks and editable clips—without copying a DAW channel rack, plugin routing graph or other production complexity into the default Beatvideo surface.

## Audio finish and mastering direction

Beatvideo Maker should be able to finish an already-produced stereo beat for publishing without requiring a separate FL Studio session. This is a **finishing/mastering workflow**, not a replacement for full multitrack music production.

The canonical implementation must build on the existing project-scoped master bus, bus EQ, preview pipeline and export mixer so preview and render remain equivalent.

The default Master surface is a small ordered insert rack rather than a generic settings card:

1. **EQ** — reuse the canonical visual parametric bus EQ.
2. **Compressor** — threshold/ratio/attack/release/makeup with a transfer graph and gain-reduction feedback.
3. **Saturator** — drive/mix/output with a visible transfer curve and bounded oversampling choices.
4. **Peak limiter** — final peak control with threshold/ceiling/release and visible gain reduction.
5. **Output** — project master output gain after the processing chain.

Each processor is selectable, bypassable and visibly editable. The mental model may borrow the useful part of a DAW insert rack—ordered slots and one focused plugin editor—without importing a full channel rack, patch graph or arbitrary plugin-host complexity into the common workflow.

Presets such as **Clean, Punch, Hard, 808 Punch and Warm** are complete deterministic recipes over this same canonical chain, never deltas over hidden leftover EQ/output state and never separate engines or hidden magic. A preset must expose the resulting real parameters so it stays understandable and editable. Users may save/load their own local presets from the same visible parameters.

Saturation dry/wet must remain phase-safe. Do not mix an oversampled waveshaper wet path in parallel with an uncompensated dry path; fold the dry/wet blend into one transfer path (or explicitly compensate latency) so preview and export cannot produce comb-filtered “hollow” tone.

Preview audio must be summed into one shared project master bus before compressor/saturation/limiting. Monitor/listening volume sits after that DSP so changing speaker volume cannot change compression behavior. Export applies the equivalent chain to the final mixed stereo buffer; optimizations that would reset dynamics state at chunk boundaries must be disabled while mastering is active.

Loudness/true-peak metering, A/B level matching and more advanced mastering processors can be added only when they have real preview/export implementations. Do not label estimated peak meters as LUFS or true peak.

A stereo master cannot independently remix a buried 808, kick or hat. **808 Punch** may shape full-mix dynamics/harmonics, but must not imply stem-level control when only a finished stereo beat is available.

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
- support a local **Publication profile** rather than hard-coding one producer brand into the public app: reusable title/description/tag templates may use confirmed project fields such as artist lane, beat name, year, producer name and BPM while keeping per-project overrides;
- never invent metadata to fill a template: BPM may come from a user-confirmed/manual or trusted analyzed grid, while musical key stays absent unless a real key-analysis/verification source exists;
- keep local export usable without a Google/YouTube connection;
- treat API-project verification/audit requirements as a deployment constraint rather than hiding them behind a non-working Publish button.

Direct publishing should feel like the last step of Export, not a separate social-media dashboard.

## Automation

Beatvideo's music intelligence owns:

- Beat This beat/downbeat analysis;
- MusicMap and musical sections;
- FreeCut's existing fast histogram or adaptive scene detection as source-native shot-boundary evidence;
- a ClipMap adapter that converts persisted scene cuts into footage shots without modifying the user's timeline just to analyze media;
- deterministic, section-aware edit-plan infrastructure for multi-clip Auto Arrange;
- beat/amplitude/phrase reactive modulation.

When motion or quality evidence is unavailable, use neutral planner inputs and mark the evidence unavailable; never fabricate a measured score. Scene detection and musical planning are separate concerns: scene cuts define *what source ranges are valid shots*, while the music grid defines *where timeline edits may land*.

Automation must remain inspectable and correctable. It produces normal FreeCut project/timeline data.

## Design

The interface is precise, calm and dense enough to scan quickly. The preview and content carry attention; chrome recedes.

### Studio interaction grammar

Photo and Video are two workflows over the same studio shell, not two separate editors.

- **Beat information architecture:** Beat source/import, analysis and grid correction form one continuous primary flow. Producer tag/watermark audio is an optional secondary disclosure after the grid tools; never create a competing `Grid / Tags` mode switch for these different jobs.
- **Compact/mobile shell:** below the compact breakpoint, never squeeze the desktop sidebars, Program monitor and timeline into one miniature three-column editor. Render one canonical editor surface at a time and keep them reachable through a persistent bottom dock. Visual uses Tools / Preview / Inspector / Timeline; Master uses Master / Preview / Mixer / Timeline; Color uses Color / Preview / Timeline. These are views over the same stores and project state, not a separate mobile editor.

- **Program monitor:** fullscreen enlarges only the real Program surface. Speaker mute is a one-click temporary monitor mute; monitor volume never changes project/export gain.
- **Mixer:** Master exposes the existing project mixer as a floating/resizable utility window, closer to a DAW mixer than a new top-level workspace. It edits the same Beat / Producer tags / Watermarks / timeline track state as the docked mixer.
- **Timeline:** the timeline is the shared direct-manipulation surface for Photo layers and Video edits. Video adds scene-aware arrangement, Loop A and transitions; Photo leans on layers/text/graphics and the Inspector.
- **Transitions:** generated and manual transitions remain normal selectable FreeCut transition bridges between clips and show their real treatment name when space permits.
- **Pattern editing:** Loop A is a reusable sequence, not a rendered block. Opening it reveals ordinary clips that may be dragged, replaced, trimmed or lengthened with normal timeline tools.
- **Shell hierarchy:** use flat text tabs, separators, aligned controls and contextual utility windows before creating rounded cards. Studio Steel is shell state only; creative colors inside media are independent.


Avoid:

- AI-generated dashboard/card aesthetics;
- tiny ambiguous controls;
- inert placeholder features;
- duplicate controls that do nearly the same thing;
- explanatory copy in place of a working interaction;
- separate custom editor systems where FreeCut already has a mature implementation.

Prefer direct manipulation, conventional editor behavior, consistent spacing and progressive disclosure.


### Interaction safety and density

- effect state has one atomic lifecycle: **add → edit → remove → undo/redo**. Removing an effect also removes its effect-keyframes and audio-reactive bindings in the same history transaction; Undo restores all of them and Redo removes all of them again;
- removing one mapped effect from a multi-selection is one undoable edit, never one hidden history entry per selected clip;
- live slider previews must be cleared before effect removal so preview-only state can never survive a deleted effect;
- the default Beat/Visual/Color/Master path is text-first and progressively disclosed. Do not leave rows of permanent utility icons visible just because FreeCut supports the commands;
- advanced track controls such as disable/solo/lock/sync-lock/close-gaps remain available through contextual menus in the simplified Beatvideo timeline; richer permanent controls may remain in Advanced editor workspaces where they are expected;
- Settings, shortcuts, render queue and project-bundle export belong under a compact utility menu; the primary toolbar should emphasize project identity, Beat/Visual/Color/Master, Inspector when relevant, Project settings near Save, Save and Export.

## Local-first boundary

Projects and media stay local. The browser may ask the user to choose a workspace folder before project creation so the editor has a durable local source of truth. Core editing does not require accounts, cloud uploads or a rendering backend.

## Upstream rule

FreeCut remains a maintained dependency/foundation, not a one-time code dump. Keep Beatvideo-specific changes localized and preserve upstream lineage and MIT provenance in `UPSTREAM_FREECUT.md`.
