# Beatvideo Maker agent workflow

These rules apply to automated coding assistants and human contributors in this repository.

## Product boundary

Beatvideo Maker is a small **local-first, preset-first** browser tool for making beat-synchronised videos. The proven v0.1 path is still cover image + beat; post-v0.1 work may also assemble one or more source videos through explicit Still / Loop / Guided / Auto workflows. It is deliberately not a general NLE.

Keep source media in the browser. Do not add accounts, uploads, cloud rendering, API keys or a backend to the core workflow unless the product scope explicitly changes. Added automation must remain inspectable and directly correctable rather than turning the app into a black-box generator.

## Sources of truth

1. Current `main` plus the single active feature/release PR — implementation truth.
2. `docs/product.md` — stable product scope, UX, compositor and architecture.
3. `README.md` — human-facing setup and currently supported workflow.
4. Git history/releases — historical state. Do not create parallel `v2`, `final`, `backup`, handoff or roadmap files to preserve history.

Before coding, inspect `main`, open PRs and existing branches. Reuse an active branch/PR when the new work belongs to the same logical scope.

## Implementation rules

- Prefer the smallest complete user flow over scaffolding future systems.
- Preserve the still image as the visual hero in Still mode. Video modes may cut between analyzed source shots, but should keep the same restrained publishing aesthetic rather than becoming a generic effects editor.
- Preview and export must call the same compositor/timing functions.
- Do not add a generic Premiere-style timeline, layers panel or dozens of effects. Video automation should be expressed through the focused Still / Loop / Guided / Auto workflows, reusable edit motifs and a compact inspect/correct surface.
- No automatic `Parental Advisory`, badges or third-party-style watermarks. Branding is user-supplied only.
- React + TypeScript + Vite. Keep `App` composition-focused; media/compositor/export logic lives in feature modules.
- **Upstream-first for complex primitives.** Do not hand-roll codecs, container parsing/muxing, general media decoding, resampling, beat/tempo engines, waveform engines or other specialist DSP when a maintained browser-native capability or mature open-source implementation fits. Local code should mainly adapt, compose and validate those primitives for this product.
- Before adopting upstream code, verify license, maintenance/activity, browser support, bundle/runtime cost and testability. Prefer a pinned package/API over copying large source trees; if code is adapted directly, preserve the required attribution/license notices.
- Simple product-specific math and glue may remain local when it is easier to verify than an added dependency (for example layout geometry, small amplitude summaries or timing transforms).
- UI may reuse/adapt proven permissively licensed component patterns and icon sets, but never reuse another product's logo, name, trademark or distinctive brand assets as Beatvideo Maker branding.
- **Hard cuts are the default transition language.** Absence of an effect transition means a clean adjacent cut. Effect transitions are cut-centered boundary objects between two segments and consume hidden source handles; do not encode every hard cut as an effect. Treat effects as sparse musical accents, not decoration on every cut. The first curated accent is Film Burn; if implemented, adapt the MIT-licensed GL Transitions FilmBurn source (Anastasia Dunbar) and preserve attribution rather than recreating the shader.
- Fixed intros/outros/stingers are user media assets pinned into the edit plan, not special-case transition code. The same clip/source pipeline should handle them.
- Avoid heavy dependencies that do not own a real specialist capability better than a small local implementation.
- Browser media capability and analysis confidence are runtime state. Never fake codec support, BPM, bar phase or export success.
- For watermarking, keep one compositor implementation. Preview and export must render the exact same pattern/placement.

## Repository hygiene

- Never preserve superseded implementations as `old`, `copy`, `v2`, `final`, `backup` or commented-out blocks. Git preserves history.
- Temporary screenshots, render outputs, logs and local media stay outside the repo or under ignored paths.
- One canonical owner per responsibility: compositor, media decode, musical grid, export, project state and branding.
- Search for the existing owner before adding a helper/component. Extend the canonical path where possible.
- Refactors remain behavior-preserving unless the task explicitly includes a product change.
- After structural changes, perform a residue scan for dead files/imports/dependencies and stale docs.

## Branch and PR hygiene

1. Use one coherent branch per logical change; do not create checkpoint/recovery branches as long-lived state.
2. Keep `main` release-ready. Prefer squash merge for one logical feature/fix.
3. After a PR is merged, the branch is disposable.
4. Do not merge stale branches wholesale. Port only unique useful work and validate it in the active PR.
5. A feature is not complete until relevant checks and the real user flow are verified.

## Versions and releases

- `package.json` is the single app-version field. Do not create versioned source folders or filenames.
- Use SemVer while pre-1.0. Bump version only as part of a deliberate release, not every commit.
- GitHub tags/releases use the matching `vX.Y.Z` or prerelease tag.
- A tagged release must match `package.json`; CI must reject mismatches.
- Development builds may use workflow/run metadata; do not write development counters back into source files.
- Do not maintain a hand-written changelog per commit. Add `CHANGELOG.md` only once public releases make it useful; keep one `Unreleased` section.
- Release artifacts are generated from the tagged commit. Do not commit generated video/build artifacts.

## Validation loop

Run the narrowest useful check while iterating. Dependency installation is lockfile-driven; use `npm ci`, not an unconstrained install. Before merge/release:

```bash
npm run check
```

For UI/media changes also run the actual app and inspect the visible desktop workflow. Check minimum/normal/wide widths, clipping, density, typography, inert controls, image framing, watermark distraction and media-state errors.

For export changes verify a real encoded file, not only that an encoder call returned. Preview and exported frame composition must match.

**CI is evidence, not a waiting state.** Check a newly triggered run once. If it is queued or in progress, continue another useful task that cannot invalidate the run: code/doc review, residue scan, comparison research, preparing the visual-QA review, or inspecting already available evidence. Recheck only at a natural checkpoint or after a new commit. Never create a loop whose only action is polling CI.

## Current baseline and release gate

The v0.1 baseline is: image + audio import → preview/playback/waveform → configurable title/watermark → confidence-aware musical grid with direct correction → five shared-clock presets → deterministic 1080p export with audio. Hosted GitHub Pages PWA/install UX, versioned local preferences, keyboard transport/history, a committed npm lockfile, real encoded-file smoke tests and inspected minimum/normal/wide screenshots are part of that baseline.

Normal CI stays bounded. Before a tagged release, run the manual **Full export smoke** workflow on current `main` with a representative duration and require its OPFS/disk-backed assertion to pass. Do not let presets invent their own tempo/phase logic or turn release-only duration tests into a polling loop.


## Hosted app

The production install surface is the GitHub Pages project site. Keep Pages-specific base-path logic explicit and tested; do not make local development depend on the repository subpath. The README must put a normal user's **open hosted app → install** path immediately after the intro, before status/architecture and developer/npm setup.


## Authoring controls

- Title placement is free-positioned, not limited to three named presets. Keep normalized X/Y plus explicit text alignment as the canonical state.
- Provide a compact 3×3 quick-position grid and direct preview placement as convenience controls over the same canonical coordinates.
- Composition/safe-area guides are editor-only overlays. Export must force guides/grid off so authoring chrome can never leak into rendered video.
- Editable templates use a versioned local `.beatvideo-template.json` contract. Validate the whole document before mutating editor state.
- Template files contain editable title/brand/look state, including the ordered effect stack and modulation records. Do not embed source image/audio/video blobs or uploaded watermark graphics.
- Opening a template must leave every imported setting editable and must clear an existing uploaded watermark graphic when the template contains text-only brand state.


## Effects and modulation

- The canonical model is an ordered `VisualEffectInstance[]` plus separate modulation records. Do not encode stack order in React component order or preset-specific branches.
- Effect targets stay explicit: background, foreground or final composite. The same effect type must not silently change target semantics by preset.
- Keep modulation analytic at render time rather than baking dense per-beat keyframes. The current pulse envelope and registry structure adapt permissively licensed FreeCut patterns.
- Presets may insert/update an effect stack, but they must not own separate render trees.
- Pixel effects should eventually run through one shared GPU pipeline adapted from a mature permissively licensed implementation. Do not add one-off shader canvases per effect.
- Transform/product glue such as deterministic scale/shake/drift evaluation may remain local when it is small, testable and consumed by the canonical compositor.
- Preview and export must evaluate the exact same ordered effect stack and modulation inputs.
