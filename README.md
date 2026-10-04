# Beat Video Maker

Make videos for your beats, without setting up a full editing project every time.

**Beat Video Maker** is a browser-based editor for producers. Start with a track and a cover image or footage, make cuts against the music, add text and effects, adjust the color and audio, and export the video. You can make a simple cover video or work directly on the timeline when you need more control.

[**Open Beat Video Maker**](https://beat-video-maker-live-production.up.railway.app/) · [Alternative link](https://hugowhitee.github.io/beat-video-maker/)

## Getting started

1. **Create a project.** Choose **Photo** for a cover visual or **Video** for footage. You can change the project settings later.
2. **Beat.** Import your audio, check the detected tempo and musical grid, and correct the timing if needed. Producer tags and watermarks are optional.
3. **Visual.** Add a cover, video clips, text or overlays. In video projects, you can review detected shots and build an arrangement, or edit clips yourself on the timeline.
4. **Color.** Adjust the whole video or work on a selected clip.
5. **Master.** Set the final beat level and work with the EQ, compressor, saturator and limiter.
6. **Export.** Choose your output settings and render locally.

The player and timeline stay connected across the editing workspaces. Shots, transitions, overlays and generated arrangements use the normal editor clips rather than a separate export-only sequence.

**Check the results of automatic analysis before publishing.** Tempo detection, beat alignment and scene boundaries can need manual correction, particularly with unusual rhythms or fast-moving footage.

## Local workspace

The editor runs in your browser. On first use, choose a local workspace folder. Projects, imported media, analysis caches and exports are stored locally rather than in an account or online project database.

Use a recent Chromium-based desktop browser for folder access and the full editing workflow. Keep a backup of your workspace if you are working on something you want to preserve.

## Run locally

Requires **Node.js 22+** and [Vite+](https://viteplus.dev/).

```bash
vp install
vp dev --host
```

To check a change before merging:

```bash
vp run check
vp run check:boundaries
vp run check:deps-contracts
vp test run
vp build
```

The frontend lives in `src/`. The editor's normal playback, effects, timeline and export systems are shared across Photo and Video projects. `PRODUCT.md` describes the intended product behavior; `AGENTS.md` documents repository conventions.

Production builds run from `main`. Railway serves the main app through `Dockerfile` and `deploy/nginx.conf.template`; GitHub Pages provides the alternative static build.

Third-party copyright and license information is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
