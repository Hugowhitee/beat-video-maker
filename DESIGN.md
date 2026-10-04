---
name: Beat Video Maker
description: A local-first, beat-driven photo and video editor with precision timeline controls.
colors:
  background: "oklch(0.225 0.008 78)"
  foreground: "oklch(0.94 0.004 78)"
  surface: "oklch(0.265 0.008 78)"
  panel-header: "oklch(0.23 0.008 78)"
  popover: "oklch(0.255 0.008 78)"
  timeline-bg: "oklch(0.19 0.007 78)"
  primary: "#b0db47"
  primary-foreground: "#17200d"
  secondary: "oklch(0.31 0.008 78)"
  muted: "oklch(0.285 0.007 78)"
  muted-foreground: "oklch(0.68 0.006 78)"
  accent: "oklch(0.34 0.009 78)"
  warning: "#d6a04b"
  destructive: "oklch(0.58 0.22 25)"
  border: "oklch(0.365 0.008 78)"
  input: "oklch(0.35 0.008 78)"
  ring: "#b0db47"
  clip-video: "oklch(0.3991 0.0401 250)"
  clip-audio: "oklch(0.22 0.02 302)"
  clip-image: "oklch(0.62 0.17 250)"
  clip-text: "oklch(0.671 0 290)"
  clip-shape: "oklch(0.68 0.19 45)"
  mark-in: "oklch(0.65 0.18 142)"
  mark-out: "oklch(0.61 0.22 29)"
  marker: "oklch(0.65 0.2 250)"
typography:
  headline:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "IBM Plex Mono, Consolas, Monaco, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
---

# Design System: Beat Video Maker

The runtime tokens in `src/index.css` are authoritative. The editor-scoped
`[data-studio-v2='true']` grammar defines active/selected/enabled states.

## 1. Creative direction

**North star: The Quiet Instrument.**

Beat Video Maker should feel like purpose-built music/video software rather than a
generic web dashboard: warm graphite surfaces, compact technical typography,
precise controls, restrained chrome, and real media as the most visually dominant
content.

The product may borrow the density and directness of FL Studio, DJ software and
professional NLEs, while staying simpler around the Beat → Visual → Color → Master
workflow. Precision surfaces may be dense; everything else should stay quiet.

Avoid both extremes:
- not a playful consumer editor with candy buttons;
- not a cramped legacy NLE full of tiny permanent icons;
- not a SaaS dashboard made of cards, badges and helper prose;
- not a minimalist mockup that removes values, handles, previews or editable state.

## 2. Color and state semantics

### Shell state signal

**Studio Lime `#b0db47`** is the one editor-state signal. It is not a decorative
brand color and should occupy little screen area.

Use it consistently:

- **Selected** → dark inset/pressed surface + small lime marker.
- **Enabled / ON** → dark switch or hardware state + lime knob/lamp.
- **Focused / snapped / precise location** → lime marker/ring where appropriate.
- **Primary global action** → lime face with dark label only when there is one clear
  primary action.
- **Warning / repair needed** → amber `#d6a04b`, never lime.
- **Disabled** → neutral gray, no accent.

Neutral actions use a light/tactile graphite control with dark/legible glyphs. The
same semantic state must never use different colors in different workspaces.

### Data colors

Timeline clip colors, source A/B/C identity, meters and in/out markers are **data**,
not UI state. Keep them distinct from Studio Lime and never reuse them as arbitrary
decoration.

Audio meters may use green/yellow/red because the color communicates level. Source
colors may differ because they communicate origin. Neither should imply selected or
enabled state.

### Value hierarchy

Depth comes from the warm neutral ramp before borders/shadows. Timeline floor is
darkest, panels are slightly lighter, detached menus/utilities may float above them.

## 3. Typography

- **IBM Plex Sans** for interface prose and labels.
- **IBM Plex Mono** for timecode, BPM, FPS, resolution, dB, frame counts and values
  that benefit from aligned digits.
- Normal body text should stay readable; do not use sub-AA opacity to create
  hierarchy.
- Uppercase is reserved for short technical labels, never full helper sentences.

Hierarchy should come from size/weight/placement, not multiple decorative fonts.

## 4. Controls

### Tactile control grammar

Precision controls may have a restrained hardware feel:
- 1px border;
- small radius, normally 2–6px;
- subtle top highlight / lower edge;
- very small shadow only when it materially improves affordance;
- no glossy bevels or skeuomorphic decoration.

### Segmented selectors

Repeated mode selectors use **one continuous segmented rail**:
- one shared outer bar;
- thin internal dividers;
- active segment = dark inset plate + lime state marker;
- no underline-only selected state;
- no row of detached pills for the same hierarchy.

This grammar is used for:
- Beat / Visual / Color / Master;
- Footage / Shots / Arrange / Sequence;
- Clip / Motion / Effects;
- editing scope;
- pacing/source-mix/transition choices;
- Master presets where appropriate.

### Binary state

ON/OFF controls use the same switch grammar everywhere. Do not represent the same
binary meaning as a green text label in one panel, a black button in another and a
toggle somewhere else.

### Player / transport

Every Program monitor uses the same transport family and order:

**start · previous · play/pause · next · end**

Play is a neutral action when playback is stopped; it should not look like an
enabled toggle. Monitor mute, monitor volume and Program fullscreen use the same
component family across Beat, Visual, Color and Master.

### Toolbar icons

Use one icon family and correct tool metaphors. Timeline precision tools remain
icon-first when the symbol is established (select, scissors, magnet, grid, zoom,
fit). Icons must remain legible against their control face.

Do not replace precision tools with long text buttons merely to appear minimal.

## 5. Product hierarchy

Global top bar owns project-level actions only:
- Beat Video Maker identity;
- editable project title with pencil affordance;
- project timing/status when useful;
- Project settings;
- Save;
- Export;
- overflow.

Below it, the producer workflow is a separate sequential rail:
**Beat → Visual → Color → Master**.

The normal producer shell has **no permanent left project-content rail**. Media,
overlays, effects and sequences belong to the active Visual tools/timeline; beat status and
grid review belong to Beat. Do not duplicate those destinations as a second sidebar.

Mixer is not a global destination. It is a floating/resizable utility owned from
Master.

## 6. Timeline

The timeline is the signature surface.

### One musical timebase

There is exactly **one** mapped musical grid. It drives:
- visible beat/bar/phrase lines;
- snap targets;
- Auto Arrange;
- transition placement;
- beat/downbeat reactive effects.

The Beat waveform never owns a second grid.

Grid hierarchy:
- strongest: phrase / 4-bar boundaries;
- strong: bars;
- lighter: beats;
- subdivisions appear only at useful zoom/resolution.

The grid must remain visible across clips without overpowering thumbnails/waveforms.
Do not hide it behind media blocks and do not duplicate it inside the Beat lane.

### Track order

Normal producer timeline:
1. Media
2. Beat
3. Overlays / Extras only when meaningful

Beat stays directly under Media. Tracks expose real collapse/resize affordances;
clips fit their lane rather than floating with arbitrary vertical padding.

### Waveform

Production waveform comes from decoded source peaks. Never invent decorative RGB
waveforms or frequency bands. Beat review focuses the same canonical waveform and
grid; it does not open a second timeline.

### Transitions

Clips remain contiguous. A transition is a selectable visual bridge centered on
the cut. Never insert a fake gap between clips to represent a transition.

## 7. Visual workflow

Video preparation follows:

**Footage → Shots → Arrange → Sequence**

- Sources remain grouped by original video.
- Each source has an enabled state for Auto Arrange.
- Detected shots can be reviewed/excluded without destructively editing source
  media.
- Large pools scroll; do not create a second miniature sequence editor.
- Auto Arrange produces normal editable timeline clips.
- Generated clips can be enabled/disabled, trimmed, replaced, reordered,
  transitioned and given Motion/Effects.

### Loop A

Loop A is a real reusable timeline composition with linked repeats. Opening Loop A
shows its actual internal clips.

Editing scopes are explicit:
- This clip
- Selection
- Entire Loop A
- This repeat / All repeats where instance overrides apply

Source repair must allow direct replacement from the grouped shot pool and precise
in/out trimming when scene detection includes black frames or wrong boundaries.

## 8. Effects and Motion

Do not regress working previews into generic icons.

### Effects
- Preserve the real GPU effect thumbnail pipeline.
- Idle shows a real poster frame.
- Hover shows the real effect sweep/preview.
- Applied effects remain inspectable, editable, bypassable and removable.
- Searchable full catalog remains available behind a focused producer-first quick
  section.

### Motion
- Preserve animated Motion preset previews.
- Common motion/reactive controls remain inline and precise.
- `Advanced keyframes` opens the specialist keyframe/graph tooling rather than
  duplicating it in a simplified mini-editor.

## 9. Color

Default Beat Video Maker Color scope is **Full video**:
- one project-level grade/effect chain after Visual compositing;
- one continuous global grade lane over the program;
- Selected clip is an explicit local correction, not the default side effect of
  playhead selection.

Keep the proven Preview → navigator/filmstrip → grading dock architecture and the
real Lift/Gamma/Gain/Offset tools.

## 10. Master and Mixer

Master owns:
- visible pre-FX Input trim;
- Auto Level;
- ordered insert rack;
- mastering metering.

Rack slots are real DSP state:
- loaded slots and empty slots look different;
- processor membership/order persists;
- drag/drop changes actual preview/export order;
- bypass changes actual processing;
- do not advertise processors with no engine implementation.

Track mix opens contextually from Master as a floating/resizable pre-master utility.
It balances real audio lanes before the rack. Master owns the post-rack Output trim
and final meter; do not add a fake Bus 1 strip to the Beatvideo Master workflow.

## 11. Layout and responsive behavior

Desktop is precision-first. Do not shrink the entire desktop shell onto mobile.

Compact layouts show focused surfaces while keeping the same project state:
- Beat → Beat / Preview / Inspector
- Visual → Add / Preview / Edit
- Color → Color / Preview
- Master → Master / Preview / Mixer

The Program monitor stays dominant and the playback runtime remains mounted.

## 12. Do / Don't

### Do
- protect working UI before redesigning it;
- use KEEP / REFINE / MERGE / HIDE / REMOVE explicitly;
- validate related component families side by side;
- show numeric values on precision controls;
- preserve real previews, handles, resizing and drag/drop;
- use one semantic state grammar across the app;
- favor flat regions, dividers and direct manipulation;
- make overflow/30+ clip cases deliberate with real scrolling/zoom.

### Don't
- create cards to fill empty space;
- add icon tiles because a region feels empty;
- hide core producer actions behind generic icon rails;
- add helper copy that restates visible controls;
- replace real previews with decorative placeholders;
- invent a second waveform/grid/timeline for a workflow;
- make every control one monochrome style when data/state meaning differs;
- use large radii/pills as the default;
- redesign proven specialist tools merely for visual uniformity;
- let one local complaint trigger an unrelated whole-screen rewrite.

## 13. Canonical references

- Runtime behavior: live `main` branch.
- Product/interaction ownership: `AGENTS.md` and `PRODUCT.md`.
- Runtime design tokens: `src/index.css`.
- Editable design exploration/contract: current Beat Video Maker Figma file.

Visual desktop uses one task column with local Add/Edit modes. Canvas background is project configuration in Project settings, not an empty-state Inspector control.
