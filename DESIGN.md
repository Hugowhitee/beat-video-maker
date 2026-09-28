---
name: FreeCut
description: A browser-based, local-first, multi-track video editor for pro editors.
colors:
  background: "oklch(0.225 0.008 78)"
  foreground: "oklch(0.94 0.004 78)"
  surface: "oklch(0.265 0.008 78)"
  panel-header: "oklch(0.23 0.008 78)"
  popover: "oklch(0.255 0.008 78)"
  timeline-bg: "oklch(0.19 0.007 78)"
  primary: "oklch(0.76 0.075 225)"
  primary-foreground: "oklch(0.18 0.012 225)"
  secondary: "oklch(0.31 0.008 78)"
  muted: "oklch(0.285 0.007 78)"
  muted-foreground: "oklch(0.68 0.006 78)"
  accent: "oklch(0.34 0.009 78)"
  destructive: "oklch(0.58 0.22 25)"
  border: "oklch(0.365 0.008 78)"
  input: "oklch(0.35 0.008 78)"
  ring: "oklch(0.76 0.075 225)"
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
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  mono:
    fontFamily: "IBM Plex Mono, Consolas, Monaco, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
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
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.76 0.075 225 / 0.9)"
    textColor: "{colors.primary-foreground}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "oklch(0.98 0 0)"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
---

# Design System: FreeCut

> **Beatvideo downstream theme override.** Beatvideo keeps FreeCut's precision and
> component grammar, but uses a warmer, slightly lighter graphite shell with
> flatter studio-hardware controls and one low-chroma cool-steel state signal.
> The exact runtime tokens in `src/index.css` are authoritative. Do not restore
> the old orange shell or the upstream near-black palette during future UI work.

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

FreeCut is a precision tool that recedes. The visual system behaves like a
well-machined instrument in a darkened room: graphite panels, restrained chrome,
no decoration that doesn't earn its pixels. The footage in the preview is the
brightest, most saturated thing on the screen, and everything else is tuned to
stay out of its way. This is a serious NLE for editors who came from Premiere Pro
and DaVinci Resolve and expect those workflows; the interface projects expert
confidence by being legible, predictable, and fast, never by being loud.

The surface is built from a tight neutral ramp in OKLCH, dark by default and dark
on purpose: long sessions, color-critical grading, and scopes all need a
near-black surround. Depth is carried by tonal layering, not by drop shadows.
Panels sit at slightly different lightness steps (the timeline floor is darkest,
panels a notch up, popovers between) so the eye reads hierarchy from value alone.
A low-chroma cool steel (`oklch(0.76 0.075 225)`) is the one shell signal:
selection, active state, focus, snap and precise location. Its rarity is what
makes it legible; footage and authored cover colors remain independent content.

This system explicitly rejects the consumer-editor look (CapCut/iMovie playful
rounded candy, emoji, gamified flourishes), the flashy SaaS dashboard
(gradient heroes, glassmorphism, big-number metric cards), and the cramped
legacy-NLE chrome (beveled gray toolbars, illegible 10px labels). Density here is
high but always clean and scannable.

**Key Characteristics:**
- Warm-dark graphite ramp; Beatvideo is intentionally lighter than upstream FreeCut while remaining suitable for long editing sessions
- One cool-steel studio signal, used sparingly for active/focus/snap state
- Tonal layering, not shadows, for depth
- IBM Plex Sans for UI, IBM Plex Mono for all technical/numeric data
- Density without noise: dense panels that stay legible at a glance

## 2. Colors

A warm graphite ramp with one low-chroma cool studio signal and a small set of
meaning-bearing clip/marker hues. Runtime tokens in `src/index.css` win over
illustrative values in this document.

### Primary
- **Studio Steel** (`oklch(0.76 0.075 225)`): The shell signal for selected,
  active, focus and snap state. Never decorative and never used just to make a
  panel feel more branded. Creative media, cover typography and timeline item
  hues may use their own meaning-bearing colors.

### Secondary
- **Raised Graphite** (`oklch(0.22 0 0)`): Secondary surfaces and secondary
  buttons, one step up from panel background.
- **Hover Graphite** (`oklch(0.24 0 0)`): Hover backgrounds and input borders.

### Tertiary (clip + marker semantics)
These hues are functional, not decorative; each encodes a timeline item type or
edit landmark and must keep its meaning.
- **Video Slate-Blue** (`oklch(0.3991 0.0401 250)`): Video clips.
- **Audio Violet** (`oklch(0.22 0.02 302)`): Audio clips.
- **Image Blue** (`oklch(0.62 0.17 250)`): Image clips.
- **Text Grey-Violet** (`oklch(0.671 0 290)`): Text clips.
- **Mark-In Green** (`oklch(0.65 0.18 142)`) / **Mark-Out Red** (`oklch(0.61 0.22 29)`):
  Source in/out points.
- **Marker Blue** (`oklch(0.65 0.2 250)`): Timeline markers.

### Neutral
- **Canvas Black** (`oklch(0.15 0 0)`): App background.
- **Timeline Floor** (`oklch(0.12 0 0)`): The darkest surface; the timeline well.
- **Panel Header** (`oklch(0.14 0 0)`): Panel header bars, one step under panels.
- **Popover** (`oklch(0.16 0 0)`): Dropdowns and menus.
- **Panel Surface** (`oklch(0.18 0 0)`): Default panel/card background.
- **Muted Fill** (`oklch(0.2 0 0)`): Muted backgrounds, disabled fills.
- **Border** (`oklch(0.25 0 0)`): Subtle separators between panels.
- **Ink** (`oklch(0.95 0 0)`): Primary text.
- **Muted Ink** (`oklch(0.6 0 0)`): Secondary/disabled text and placeholders.

### Named Rules
**The One Signal Rule.** Studio Steel means active/focused/selected or snapped.
It should occupy a small fraction of the shell. Static headings, helper boxes and
decorative cards stay neutral.

**The Value-Hierarchy Rule.** Depth comes from lightness steps in the neutral
ramp (floor `0.12` → header `0.14` → popover `0.16` → panel `0.18`), not from
borders or shadows. When two surfaces must read as distinct, separate them by
value before reaching for a border.

**The Meaning-Bearing Hue Rule.** Clip and marker colors are part of the data, not
the styling. Never repurpose Audio Violet or Mark-In Green for decoration, and
never rely on these hues alone to convey state (pair with icon/label/position).

## 3. Typography

**Display / UI Font:** IBM Plex Sans (with `-apple-system`, `Segoe UI`, sans-serif)
**Mono / Data Font:** IBM Plex Mono (with `Consolas`, `Monaco`, monospace)

**Character:** One humanist-sans family doing all interface work, paired with its
own monospace sibling for every number, timecode, frame count, and technical
value. The pairing reads as engineered and trustworthy without being cold; Plex
was drawn for exactly this kind of dense technical UI. Hierarchy comes from weight
and size, not from a second display face.

### Hierarchy
- **Headline** (600, 1.25rem, 1.3): Dialog titles, major section headers. Slight
  negative tracking (`-0.01em`).
- **Title** (600, 1rem, 1.4): Panel titles, card headers, primary labels.
- **Body** (400, 0.875rem / 14px, 1.5): Default UI text, descriptions, menu items.
- **Label** (500, 0.75rem / 12px, 1.4): Control labels, badges, secondary captions.
- **Mono** (400, 0.75rem, 1.4): Timecode, frame numbers, FPS, durations, dimensions,
  any value an editor reads precisely.

### Named Rules
**The Mono-For-Data Rule.** Every number an editor must read or compare (timecode,
frame, FPS, resolution, dB) is set in IBM Plex Mono so digits align and don't jump
width. Prose and labels stay in Plex Sans.

**The No-Caps-Body Rule.** Uppercase is for short badges and ≤4-word labels only.
Never set sentences or menu items in all-caps; at 12-14px on dark it becomes
unreadable.

## 4. Elevation

This system is **flat by tonal layering**. There is essentially no drop-shadow
vocabulary in the working UI; surfaces are distinguished by stepping lightness in
the neutral ramp (timeline floor darkest, panels lighter, popovers between).
Shadows appear only on detached, floating layers (menus, dialogs) and as an
optional accent glow, never as a default card lift.

### Shadow Vocabulary (sparing)
- **Floating layer** (`box-shadow: 0 4px 24px oklch(0 0 0 / 0.5)`): Popovers,
  dropdowns, dialogs lifting off the panel plane.
- **Signal glow:** avoid it in normal editor chrome. A focused floating layer may
  use a restrained neutral shadow; selection and active state prefer a line,
  underline or value shift over glow.

### Named Rules
**The Flat-By-Default Rule.** Panels and cards are flat at rest. If a surface needs
to feel raised, raise its lightness one step before adding a shadow. Shadows are for things that genuinely float (menus, dialogs, utility windows),
not for routine selected states.

## 5. Components

Components are **refined and restrained**: quiet surfaces, subtle borders, gentle
hover tints. Affordance comes from a small color/value shift, not from heavy
shadows or bevels. Corners are softly rounded (`6px` default), never pill-shaped,
never sharp.

### Buttons
- **Shape:** Softly rounded (`6px`, `{rounded.md}`); default height `36px`, compact
  `32px`, large `40px`. Icon buttons are square (`36×36`).
- **Primary:** Signal Orange fill (`{colors.primary}`) with near-black text
  (`{colors.primary-foreground}`), `8px 16px` padding, a faint default shadow.
- **Hover / Focus:** Primary drops to 90% opacity on hover (`oklch(0.76 0.075 225 / 0.9)`);
  focus shows a 1px orange ring (`{colors.ring}`). Transitions are color-only,
  ~150ms.
- **Secondary:** Raised Graphite fill (`{colors.secondary}`), ink text, hover to 80%.
- **Outline:** Transparent over background with a 1px input border; hover fills with
  Hover Graphite (`{colors.accent}`).
- **Ghost:** No fill at rest; hover fills with Hover Graphite. The default for
  toolbar and icon actions.
- **Destructive:** Error Red fill (`{colors.destructive}`) for delete/irreversible.
- **Link:** Orange text, underline on hover.

### Regions / Containers
- A panel is not automatically a card. Prefer open regions separated by spacing,
  one-pixel dividers and tonal steps.
- Do not place rounded cards inside rounded cards merely to group controls.
- Reserve bordered/rounded containers for objects that are actually discrete:
  draggable clips, popovers, dialogs, presets or detachable utility windows.
- Keep nested control groups flatter than the surrounding panel. A heading plus
  aligned fields is usually enough.
- Never add a colored side stripe just to manufacture hierarchy.

### Inputs / Fields
- **Style:** Transparent fill, 1px input border (`{colors.input}`), `6px` radius,
  `36px` height, `4px 12px` padding.
- **Focus:** Border/ring shifts to a 1px orange ring (`{colors.ring}`); outline is
  removed in favor of the ring.
- **Placeholder:** Muted Ink (`oklch(0.6 0 0)`) — verify it clears 4.5:1; bump
  toward ink if not.
- **Disabled:** 50% opacity, `not-allowed` cursor.

### Navigation / Panels
- Primary workflow navigation uses flat text tabs with a thin Studio Steel
  underline rather than filled pills.
- Producer tool tabs reuse the same grammar. Do not invent a second row of
  rounded chips for the same hierarchy.
- Detached utility tools such as Mixer may float and resize; they still edit the
  same underlying project state.
- Keyboard focus is always visible through the canonical ring.

### Signature: Timeline Clips
The timeline is the signature surface. Clips sit on the Timeline Floor
(`oklch(0.12 0 0)`) and are colored by type via the meaning-bearing hues, each with
a matching subtle top-to-bottom gradient (`.bg-video-gradient`, `.bg-audio-gradient`,
etc.). The playhead is the Signal Orange line. Selection and snap use the shared Studio Steel signal. Scrollbars are slim and graphite. This surface is allowed more
density and more color than the rest of the app because the color is data.

## 6. Do's and Don'ts

### Do:
- **Do** keep Studio Steel (`oklch(0.76 0.075 225)`) for shell state only; treat
  it as a signal, not a brand splash.
- **Do** prefer direct manipulation and contextual utility windows over permanent
  rows of icon-only controls.
- **Do** separate surfaces by stepping the neutral ramp's lightness before reaching
  for a border or shadow.
- **Do** set every timecode, frame count, FPS, and dimension in IBM Plex Mono.
- **Do** verify body and placeholder text clears 4.5:1 on its panel; `muted-foreground`
  (`oklch(0.6 0 0)`) is borderline — bump toward ink where it fails.
- **Do** keep components flat and quiet; affordance via a small color/value shift.
- **Do** let the preview/footage be the brightest, most saturated thing on screen.

### Don't:
- **Don't** make it look like a consumer editor (CapCut/iMovie): no playful candy
  buttons, no emoji, no gamified flourishes, no pill-shaped buttons.
- **Don't** drift toward a flashy SaaS dashboard: no gradient hero text, no
  glassmorphism as default, no big-number metric cards inside the working UI.
- **Don't** reproduce cramped legacy-NLE chrome: no beveled gray toolbars, no
  illegible sub-12px labels, no noise-level density.
- **Don't** use a `border-left`/`border-right` greater than 1px as a colored accent
  stripe on cards, list items, or callouts.
- **Don't** use `background-clip: text` gradient text anywhere; emphasis is by weight
  and size.
- **Don't** repurpose the clip/marker hues for decoration, or rely on color alone to
  signal state.
- **Don't** stack opacity on already-muted text (`text-muted-foreground/40–70`).
  `muted-foreground` already sits near the AA floor (~4.8:1); an alpha modifier drops
  readable text to ~2.5–3.5:1. De-emphasize with size/weight, not sub-AA alpha. (Opacity
  is fine on genuinely decorative markers or disabled controls, which AA exempts.)
- **Don't** jump to a white consumer-editor theme; Beatvideo's intended direction is a lighter warm-dark studio shell with restrained contrast.
- **Don't** recreate the AI-dashboard pattern: no card-in-card reflex, decorative
  glows, micro-uppercase eyebrow labels, status chips for ordinary state, or
  helper paragraphs that merely narrate what the visible controls already do.
- **Don't** change shell state color inside authored media: cover/image/text colors
  are content and remain independent from the Studio Steel UI signal.
