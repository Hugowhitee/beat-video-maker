# Beat Video Maker

Beat Video Maker is a local-first editor for turning a beat plus photos or footage into a finished music visual. It combines music-aware editing with a full timeline, real effect previews, motion/keyframes, transitions, color grading, mastering and local export.

## Open the app

GitHub Pages: **https://hugowhitee.github.io/beat-video-maker/**

A production container is also supported through `Dockerfile`, `deploy/nginx.conf.template` and `railway.json`.

On first use the browser asks for a local workspace folder. Project files, media metadata, caches and exports stay local; no cloud backend is required for normal editing.

## Producer workflow

The normal project route is:

1. **Beat** — import/select the beat, analyze or enter BPM, verify the one canonical musical grid, and manage optional producer tags/watermarks.
2. **Visual** — add a hero photo or footage, review detected shots, Auto Arrange or build Loop A, then edit real timeline clips.
3. **Color** — grade the full visual program by default, with clip-local correction available when needed.
4. **Master** — finish the beat through the ordered EQ/compressor/saturation/limiter rack and open the floating Mixer for channel/output control.
5. **Export** — render locally for publishing.

Advanced editing remains available through the same canonical timeline/runtime. Beat Video Maker does not maintain a second hidden editor for automation.

## Key behavior

- One timeline/playhead/waveform and one mapped musical timebase drive visible grid markers, snap, Auto Arrange and beat-reactive effects.
- Effect browsing keeps the real GPU preview pipeline with poster frames and hover previews.
- Motion presets keep their real animated preview system.
- Auto Arrange creates normal editable timeline items. Generated clips can be enabled/disabled, trimmed, replaced, transitioned and given Motion/Effects.
- Multiple footage sources feed one reviewable shot pool while preserving source identity.
- Loop A is a reusable editable sequence with linked repeats; Make Unique creates deliberate variation.
- Transitions remain visible/selectable bridges on real cuts.
- Color defaults to one full-program grade instead of silently duplicating grading across generated clips.
- The Master rack is real processing state: membership/order persist and preview/export follow the same processor order.
- The floating Mixer owns the project output fader; Auto Level adjusts pre-FX input trim.

## Development

Requirements: Node 22+ and Vite+.

```bash
vp install
vp dev --host
```

Normal verification:

```bash
vp run check
vp run check:boundaries
vp run check:deps-contracts
vp test run
vp build
```

The repository also contains headless render/edit verification for broad runtime changes.

## Deployment

GitHub Pages deploys from `main` through `.github/workflows/pages.yml` with SPA fallback for project/editor routes.

The production container serves the same built `dist/` through nginx and keeps the cross-origin-isolation headers required by the editor.

## Ownership and third-party notices

This repository is the canonical Beat Video Maker product and runtime. Historical donor repositories are not implementation authorities.

Third-party license notices for incorporated open-source code are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
