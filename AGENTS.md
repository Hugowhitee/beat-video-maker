# Beatvideo Maker agent workflow

These rules apply to automated coding assistants and human contributors in this repository.

## Product boundary

Beatvideo Maker is a small **local-first, preset-first** browser tool for turning a still cover image plus a beat into a clean YouTube-ready video. It is deliberately not a general NLE.

Keep source media in the browser. Do not add accounts, uploads, cloud rendering, API keys or a backend to the core workflow unless the product scope explicitly changes.

## Sources of truth

1. Current `main` plus the single active feature/release PR — implementation truth.
2. `docs/product.md` — stable product scope, UX, compositor and architecture.
3. `README.md` — human-facing setup and currently supported workflow.
4. Git history/releases — historical state. Do not create parallel `v2`, `final`, `backup`, handoff or roadmap files to preserve history.

Before coding, inspect `main`, open PRs and existing branches. Reuse an active branch/PR when the new work belongs to the same logical scope.

## Implementation rules

- Prefer the smallest complete user flow over scaffolding future systems.
- Preserve the still image as the visual hero. Motion belongs primarily in background/effects/text.
- Preview and export must call the same compositor/timing functions.
- Do not add a generic timeline, layers panel, asset browser or dozens of effects unless scope explicitly changes.
- No automatic `Parental Advisory`, badges or third-party-style watermarks. Branding is user-supplied only.
- React + TypeScript + Vite. Keep `App` composition-focused; media/compositor/export logic lives in feature modules.
- Avoid heavy dependencies. A dependency must own a real capability better than a small local implementation.
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

The v0.1 baseline is: image + audio import → preview/playback/waveform → configurable title/watermark → confidence-aware musical grid with direct correction → five shared-clock presets → deterministic 1080p export with audio. PWA shell, versioned local preferences, keyboard transport/history, a committed npm lockfile, real encoded-file smoke tests and inspected minimum/normal/wide screenshots are part of that baseline.

Normal CI stays bounded. Before a tagged release, run the manual **Full export smoke** workflow on current `main` with a representative duration and require its OPFS/disk-backed assertion to pass. Do not let presets invent their own tempo/phase logic or turn release-only duration tests into a polling loop.
