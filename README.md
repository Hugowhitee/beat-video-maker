# Beat Video Maker

Make a cover video or edit footage around your beat, right in the browser.

**[Open Beat Video Maker](https://beat-video-maker-live-production.up.railway.app/)** · [Alternative site](https://hugowhitee.github.io/beat-video-maker/)

## Make a video

Create a **Photo** project for cover artwork or a **Video** project for footage. You can still change the clips, effects and timing manually.

1. **Beat** — Import the track and check the detected tempo, downbeat and beat grid against the audio. Correct it when needed.
2. **Visual** — Add a cover or footage. Review detected shots, arrange cuts to the beat or edit them yourself on the timeline. Add text and overlays as individual editable layers.
3. **Color** — Grade the full video or selected clips.
4. **Master** — Balance the audio and adjust the mastering chain.
5. **Export** — Choose the output settings and render the video.

Automatic beat analysis and shot detection need review before publishing, particularly with unusual rhythms or fast-cut footage. They don't override your manual edits.

## Workspace

The editor stores projects and imported media locally in your browser workspace, not in an online account. When prompted, select a folder for your files. Keep a backup of work you want to preserve.

For folder access and the full editing workflow, use a recent Chromium-based desktop browser.

## Run locally

Requires **Node.js 22+** and [Vite+](https://viteplus.dev/).

```bash
vp install
vp dev --host
```

Before merging editor changes:

```bash
vp run check
vp run check:boundaries
vp run check:deps-contracts
vp test run
vp build
```

The browser editor is in `src/`; headless render and automation tools are in `headless/`. See [PRODUCT.md](PRODUCT.md) for product behavior, [DESIGN.md](DESIGN.md) for interface decisions and [AGENTS.md](AGENTS.md) for repository conventions.

The production site is deployed from `main` through Railway. GitHub Pages provides a static alternative. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for license and attribution details.
