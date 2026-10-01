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
- **Photo:** hero still + beat. The normal product route is Beat → Visual → Color → Master. Visual owns source placement plus visible Text/Graphics creation and selected-object effects/motion; Color owns focused grading. Beatvideo Color defaults to one project-level **Full video** adjustment layer spanning the whole visual program; clip grading is an explicit local override, not an incidental consequence of playhead selection. Do not hide primary producer tools behind a generic icon-rail collapse state. Hide video-only editing tools unless deliberately exposed as Advanced.
- **Reactive graphics:** Beat flash/frame/bars quick starts must materialize normal visual timeline layers and use the canonical mapped Beatvideo grid/transients through `audioReactive`. Do not create a separate visualizer time axis or audio-analysis engine. Do not call transient-driven 3-band pulse graphics a continuous FFT spectrum.
- **Reactive timing and UX:** audio-reactive modulation peaks on the mapped audio/beat hit; an optional lead-in may begin before that hit but must never turn into post-hit visual lag. Keep common producer effects and reactive quick starts directly reachable in the canonical Effects Inspector, with deeper parameters progressively disclosed instead of nested mini-cards or a second effects system.
- **Video:** footage + beat. Visual owns one staged footage → shots → placement → sequence flow plus text/effects/motion. Scene analysis is source preparation: expose the detected shot split for review before Auto Arrange, let weak shots be excluded without editing the source, and make generated sequence slots map directly to the real timeline cuts. Auto Arrange/repeating motifs remain rebuildable and every internal generated cut lands on the same corrected mapped beat grid used by timeline/snap. Manual full-clip placement and universal transitions remain available; Beatvideo Guided/Auto planning is added on top.
- **Master workspace:** mastering is the primary job. Give the mastering controls a dedicated wider desktop column instead of inheriting the generic media-sidebar width; keep the canonical timeline available and show dedicated audio lanes only when they exist (Beat / Producer tags / Watermarks), with a narrow real master meter. The visible insert rack is canonical processing state: processor membership/order must persist, drag/drop must change the actual preview/export signal order, and empty/add slots must never advertise processors without a real engine implementation. The full channel mixer is an on-demand floating utility on desktop, not a permanent dock beside the timeline. The mixer owns the project output/master-bus fader; do not duplicate that volume control in the mastering panel. Auto Level adjusts the visible pre-FX Input trim, leaves the Mixer fader untouched, and must show measured source level → applied trim → projected level into the chain plus peak/limiter headroom. Do not label that projection as post-chain loudness. Legacy projects without dedicated audio lanes must fall back to the full timeline instead of showing an empty workspace.
- **Studio shell:** Program fullscreen targets only the Program monitor; monitor mute/volume are listening controls and never alter render gain. Master should expose the existing canonical mixer as a floating/resizable utility window instead of adding another audio workspace.
- **Compact editor:** phone-width layouts expose the same project/editor state through a small set of focused surfaces rather than the desktop shell. Normal Edit/Visual uses Media / Preview / Inspector; Beat uses Beat / Preview / Inspector; Master uses Master / Preview / Mixer; Color uses Color / Preview. Preview keeps the Program monitor visually dominant and includes the compact canonical timeline/timing context underneath it, so those producer workspaces do not add a duplicate Timeline destination. Motion may keep a dedicated Timeline surface because its specialist motion timeline is not embedded in Preview. Keep the canonical Preview/audio runtime mounted while another compact surface is active so start / play-pause / end / monitor controls remain connected to real playback. Use the real dynamic viewport height so browser chrome cannot push the bottom dock off-screen. Frame-step remains a desktop precision action. Do not solve mobile by shrinking the desktop three-column shell. Desktop remains the precision-first layout.
- **Producer timeline:** Beat/Visual/Master use one vertically scrolling FL-style track stack. The normal producer view is semantic and sparse: one Media lane at the top, the dedicated Beat lane directly beneath it, and an on-demand Extras disclosure for real overlays, producer tags, watermarks or auxiliary audio. Empty generic V/A plumbing remains canonical state for FreeCut compatibility but must not render as permanent Beatvideo lanes. Do not split the normal Beatvideo timeline into independently scrolling video/audio panes or let users reorder the semantic Media/Beat rows. Rich split-pane track plumbing may remain in Advanced/Motion when it serves specialist editing.
- **Beat IA:** beat import/source, analysis and grid correction are one primary flow. The project Beat source is an audio file; video media with embedded audio remains visual media and must not appear as a Beat-source candidate. A freshly imported beat starts rhythm analysis automatically; analysis must remain visibly progress-reporting and cancelable, and a runtime/progress failure must never strand the UI in a busy state. Producer tags/watermarks are optional project audio after that flow, not a peer `Grid / Tags` mode. File metadata is a collapsed utility attached to the selected beat source, never a top-level workspace: MP3 tag/cover edits export a new copy, require audio packet-copy instead of hidden re-encoding, and must not claim to remove signal-level fingerprints or signed provenance.
- **Video patterns:** Repeat motif materializes as one reusable Loop A sequence with multiple CompositionItem references to the same compositionId. Editing the shared sequence updates repeats. Reliable intro/outro edge sections stay outside Loop A; do not group non-motif segments into it.
- **Grid resolution:** one local Auto/Beat/1-bar/2-bar/4-bar/8-bar/16-bar preference controls both visible musical markers and musical snap targets. In the normal producer timeline keep this behind one compact Grid control rather than separate +/- density buttons; never thin the stored MusicMap to implement view density.
- **Transitions:** transitions are universal edit objects, never a genre mode. Auto Arrange may use **Cuts only** or sparse **Accent transitions** (currently Light Leak Burn / Film Gate Slip where source handles are valid), but every created transition must remain a normal visible/selectable transition on the timeline. Manual application/replacement/removal through the Transitions surface must always remain available.
- **Musical snapping:** clip moves, trims and razor operations use the same source-mapped musical targets the grid displays. Ctrl/Cmd may temporarily bypass snapping during a drag/trim; preserve existing Alt semantics such as duplicate-drag and rolling edit.
- **Grid correction:** precision alignment must focus/zoom the canonical FreeCut timeline waveform around Bar 1 or a selected beat and edit the same source-domain Beatvideo correction state. Do not add a second waveform/timeline just for correction. Whole-grid shift, verified Bar 1 and local drift anchors remain distinct actions. For stable programmed music, coherent low-end/kick onsets may correct detector phase (including a half-beat phase error) when the audio evidence is materially stronger than the detector baseline. If Bar 1 is right but drift accumulates later, recurring low-end onset measurements may also refine the global fitted period/BPM, but only when multiple independent song regions agree and sparse fills cannot own the result.
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
