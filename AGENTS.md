# Beat Video Maker agent instructions

## Source of truth

This repository is the canonical Beat Video Maker product and runtime.

- `main` is the product source of truth.
- The current in-repo editor/runtime is canonical.
- Old chats, deleted branches and pre-migration code are supporting context only.
- Third-party provenance belongs in `THIRD_PARTY_NOTICES.md`, not in product architecture or UI guidance.

Read the current repository state before changing anything.

## Architecture rule

Prefer the repository's existing canonical systems for:

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

Do not add a parallel Beat Video Maker implementation when the canonical runtime already owns the responsibility.

Beat Video Maker-specific workflow code should remain recognizable and cohesive. Reuse canonical runtime primitives instead of creating second systems, especially for:

- beat/downbeat/MusicMap analysis;
- precision musical-grid correction as fallback;
- beat/amplitude/phrase-reactive modulation;
- Beatvideo photo recipes/presets;
- Guided/Auto music-video edit planning.

## Product modes

`Photo` and `Video` are project-level workflows over one canonical project/runtime.

- **Cover layouts:** create normal independent text layers atomically. Never flatten title/subtitle/branding into one rendered asset or add a second cover-only canvas. Reuse the canonical Visual Edit surface, text-motion engine, effects and project persistence.
- **Photo:** hero still + beat. The normal product route is Beat → Visual → Color → Master. Visual owns source placement plus visible Overlays creation (text, producer tags and shapes) and selected-object effects/motion; Color owns focused grading. Beatvideo Color defaults to one project-level **Full video** adjustment layer spanning the whole visual program; clip grading is an explicit local override, not an incidental consequence of playhead selection. Do not hide primary producer tools behind a generic icon-rail collapse state. Hide video-only editing tools unless deliberately exposed as Advanced.
- **Reactive graphics:** Beat flash/frame/bars quick starts must materialize normal visual timeline layers and use the canonical mapped Beatvideo grid/transients through `audioReactive`. Do not create a separate visualizer time axis or audio-analysis engine. Do not call transient-driven 3-band pulse graphics a continuous FFT spectrum.
- **Reactive timing and UX:** audio-reactive modulation peaks on the mapped audio/beat hit; an optional lead-in may begin before that hit but must never turn into post-hit visual lag. Keep common producer effects and reactive quick starts directly reachable in Visual → Effects, with applied/deeper parameters in Visual → Edit and progressively disclosed instead of nested mini-cards or a second effects system.
- **Video:** footage + beat. Visual owns one staged footage → shots → placement → sequence flow plus text/effects/motion. Scene analysis is source preparation: expose the detected shot split for review before Auto Arrange, let weak shots be excluded without editing the source, and make generated sequence slots map directly to the real timeline cuts. Auto Arrange/repeating motifs remain rebuildable and every internal generated cut lands on the same corrected mapped beat grid used by timeline/snap. Manual full-clip placement and universal transitions remain available; Beatvideo Guided/Auto planning is added on top.
- **Master workspace:** mastering is the primary job. Give the mastering controls a dedicated wider desktop column instead of inheriting the generic media-sidebar width; keep the canonical timeline available and show dedicated audio lanes only when they exist (Beat / Producer tags / Watermarks), with a narrow real master meter. The visible insert rack is canonical processing state: processor membership/order must persist, drag/drop must change the actual preview/export signal order, and empty/add slots must never advertise processors without a real engine implementation. The full channel mixer is an on-demand floating **pre-master** utility on desktop, not a permanent dock beside the timeline. It owns only track balance/EQ; do not expose a fake Bus 1/post-master fader there. Master owns the post-rack Output trim and final meter. Auto Level measures the Beat after its track/clip gain, resets Master Output to unity, adjusts the visible pre-FX Input trim, and must show measured source level → applied trim → projected level into the chain plus peak/limiter headroom. Do not label that projection as post-chain loudness. Legacy projects without dedicated audio lanes must fall back to the full timeline instead of showing an empty workspace.
- **Studio shell:** Program fullscreen targets only the Program monitor; monitor mute/volume are listening controls and never alter render gain. Master should expose the existing canonical **track mix** as a floating/resizable pre-master utility window instead of adding another audio workspace. Normal Beat/Visual/Color/Master producer workspaces do **not** carry a permanent project-content rail: Media/Overlays/Effects/Transitions and sequence actions belong to Visual and the canonical timeline, while beat status/grid review belong to Beat. Do not duplicate those destinations in a left sidebar.
- **Compact editor:** phone-width layouts expose the same project/editor state through a small set of focused surfaces rather than the desktop shell. Normal Edit/Visual uses Add / Preview / Edit; Beat uses Beat / Preview / Inspector; Master uses Master / Preview / Mix; Color uses Color / Preview. Preview keeps the Program monitor visually dominant and includes the compact canonical timeline/timing context underneath it, so those producer workspaces do not add a duplicate Timeline destination. Motion may keep a dedicated Timeline surface because its specialist motion timeline is not embedded in Preview. Keep the canonical Preview/audio runtime mounted while another compact surface is active so start / play-pause / end / monitor controls remain connected to real playback. Use the real dynamic viewport height so browser chrome cannot push the bottom dock off-screen. Frame-step remains a desktop precision action. Do not solve mobile by shrinking the desktop three-column shell. Desktop remains the precision-first layout.
- **Producer timeline:** Beat/Visual/Color/Master use one vertically scrolling FL-style track stack. The normal producer view is semantic and sparse: one Media lane at the top, the dedicated Beat lane directly beneath it, and an on-demand Extras disclosure for real overlays, producer tags, watermarks or auxiliary audio. Empty generic V/A plumbing remains canonical state for project/runtime compatibility but must not render as permanent Beatvideo lanes. Do not split the normal Beatvideo timeline into independently scrolling video/audio panes or let users reorder the semantic Media/Beat rows. Rich split-pane track plumbing may remain in Advanced/Motion when it serves specialist editing.
- **Beat IA:** beat import/source, analysis and grid correction are one primary flow. The project Beat source is an audio file; video media with embedded audio remains visual media and must not appear as a Beat-source candidate. A freshly imported beat starts rhythm analysis automatically; analysis must remain visibly progress-reporting and cancelable, and a runtime/progress failure must never strand the UI in a busy state. Completed rhythm analysis and user grid corrections belong to that Beat source revision and must survive workspace navigation and project reopen; do not silently re-run analysis merely because the Beat surface was reopened. Reanalyze only when the source/relevant analysis inputs changed or the user explicitly requests it. Producer tags/watermarks are optional project audio after that flow, not a peer `Grid / Tags` mode. File metadata is a collapsed utility attached to the selected beat source, never a top-level workspace: MP3 tag/cover edits export a new copy, require audio packet-copy instead of hidden re-encoding, and must not claim to remove signal-level fingerprints or signed provenance.
- **Video patterns:** Repeat motif materializes as one reusable Loop A sequence with multiple CompositionItem references to the same compositionId. Editing the shared sequence updates repeats. Reliable intro/outro edge sections stay outside Loop A; do not group non-motif segments into it.
- **Grid resolution:** one local Auto/Beat/1-bar/2-bar/4-bar/8-bar/16-bar preference controls both visible musical markers and musical snap targets. In the normal producer timeline keep this behind one compact Grid control rather than separate +/- density buttons; never thin the stored MusicMap to implement view density.
- **Transitions:** transitions are universal edit objects, never a genre mode. Auto Arrange may use **Cuts only** or sparse **Accent transitions** (currently Light Leak Burn / Film Gate Slip where source handles are valid), but every created transition must remain a normal visible/selectable transition on the timeline. Manual application/replacement/removal through the Transitions surface must always remain available.
- **Musical snapping:** clip moves, trims and razor operations use the same source-mapped musical targets the grid displays. Ctrl/Cmd may temporarily bypass snapping during a drag/trim; preserve existing Alt semantics such as duplicate-drag and rolling edit.
- **Grid correction:** precision alignment must focus/zoom the canonical timeline waveform around Bar 1 or a selected beat and edit the same source-domain Beatvideo correction state. Do not add a second waveform/timeline just for correction. Whole-grid shift, verified Bar 1 and local drift anchors remain distinct actions. For stable programmed music, coherent low-end/kick onsets may correct detector phase (including a half-beat phase error) when the audio evidence is materially stronger than the detector baseline. If Bar 1 is right but drift accumulates later, recurring low-end onset measurements may also refine the global fitted period/BPM, but only when multiple independent song regions agree and sparse fills cannot own the result.
- Never build separate Photo and Video render/export engines.
- Existing legacy projects without a Beatvideo mode resolve to `Video`. New Beatvideo projects default to `Photo`.

## Quality bar

The point of the current architecture is to preserve mature editor UX while making Beat Video Maker's producer workflow clearer.

- Reuse established in-repo interaction patterns and component primitives before creating new controls.
- Hide or remove features that are irrelevant to the active Beatvideo workflow; do not replace them with half-finished custom versions.
- A visible feature must be useful, correctly placed, and production-quality. If it has no meaningful workflow value yet, keep it out of the normal UI.
- Preserve progressive disclosure. Normal Photo work must not feel like a generic NLE.
- Before a material redesign of an existing editor surface, build a lightweight live capability/state coverage inventory and classify each existing behavior as `KEEP / REFINE / MERGE / HIDE / REMOVE`. Include interaction behavior that static mockups often lose—drag/drop, resize/collapse, hover/real previews, keyboard/precision actions, empty/loading/error/disabled states, history/persistence and export consequences. A visually coherent Figma shell is not a complete redesign while an existing useful behavior has no intentional destination.
- Validate UI changes in the actual editor, not only through component code review.
- For stateful editor changes, verify the real round trip where applicable: perform the edit → confirm preview/playback uses it → Undo/Redo → save/reopen the project → confirm render/export uses the same state. Figma parity, a green component test or a successful write alone does not prove preservation.
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

For broad editor/runtime changes, use the repository's stronger verification/headless gates where relevant.

This repository owns its CI, deployment and release policy.

- **Visual task surface:** desktop Visual keeps Add/Edit as local modes inside one task column; do not add a separate global Inspector button. An empty Visual Edit surface is a selection prompt, not a duplicate Canvas settings page. Project canvas/background belongs to Project settings.
