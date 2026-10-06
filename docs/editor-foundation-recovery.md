# Editor recovery — verification ledger

Baseline: `main` at `7c0f8aa` (PR #98). Integrated recovery work: [PR #99](https://github.com/Hugowhitee/beat-video-maker/pull/99). The Figma reference is a visual contract, not evidence of working behavior.

The labels below distinguish an implemented interaction from verified production behavior. **WORKS** means the cited automated checks pass on the final PR commit, not that an end-to-end live workflow has been proven. A failing CI run invalidates the status until repaired.

| Area | State | Evidence / remaining condition |
| --- | --- | --- |
| Program transport/seek → one timeline viewport | PARTIAL | Shared store and tests; manual pan, live follow and end-to-end footage still need browser verification |
| Timecode display, Source/Program format control | PARTIAL | Shared format selector and unit tests; geometry in desktop/compact needs visual QA |
| Beat/Visual/Color/Master producer track dimensions | PARTIAL | Resize/reset restored; full-width track controls and empty/locked behavior need browser QA |
| Ruler and musical grid | PARTIAL | Ruler uses canonical marker/grid source, same viewport; beat-offset/drift tests and visible sync across zoom still need full runtime confirmation |
| Video visual/compositor stacking | PARTIAL | Semantic track order adjusted to underlying compositor with unit tests; masks/effects and export layer order need frame comparisons |
| Source, Shots and Trim | PARTIAL | Shared Source player, persisted shot review, fixed zoom filmstrip and full original thumbnail overview; seek/draft/Save/Cancel/Reset and export need real media workflow QA |
| Text edit on Program | PARTIAL | Draft preview, explicit Save/Cancel, styled text spans; Undo/Redo, native font metrics and actual exported pixels need browser validation |
| Clip effect indicators | PARTIAL | Reads true ItemEffect membership/enabled state; effect signal and inspector must be confirmed visually |
| Master rack, Mixer, Auto level | PARTIAL | Shared DSP owners preserved; responsive layout, preset/edit/custom state, output meter and export parity require end-to-end checks |
| Color and grading | UNVERIFIED | No new full grading/regression pass in this tranche |
| Scenes AI discovery / Auto Arrange / Loop A | UNVERIFIED | No completed end-to-end source→shots→arrangement→save/reopen/export pass in this tranche |
| Project setup, render/export and delivery | UNVERIFIED | Production must not be advanced solely on typecheck/build or visual parity |
| Accessibility, compact and laptop screen sizes | UNVERIFIED | Keyboard/focus/overflow coverage and live screenshots required |

Release gate: `vp run check`, boundaries, dependency contracts, full tests, production build, project-open test, headless round-trip and **actual browser** exercise of editing, audio/video import, waveform/grid zoom, trim, applied effects, Undo/Redo, save/reopen and exported result. Verify deployment SHA and version at the specified Railway URL before treating work as delivered.

Do not duplicate Source/Program timelines or editor state, flatten text layers, or hide a working tool to make the UI appear simplified. Keep the PR draft until all release gates pass.
