import type { DocPageContent } from '../docs-content'

// order 1.5 places this right after Getting Started in the Start group.
const page = {
  order: 1.5,
  slug: 'concepts',
  title: 'How Beatvideo Maker Works',
  description:
    'The mental model: local-first storage, projects and media, frames and timecode, and the GPU pipeline.',
  category: 'Start',
  related: ['workspaces', 'getting-started', 'editing-tools'],
  sections: [
    {
      title: 'Local-first, by design',
      blocks: [
        {
          kind: 'list',
          items: [
            'Beatvideo Maker runs in your browser and keeps project state on your device.',
            'A normal workspace folder is used when the browser allows folder access; otherwise the app uses browser-private OPFS storage.',
            'Your original video and audio remain local. Project state, caches, generated assets, and analysis data live in the active workspace.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Folder workspaces are directly browsable and easy to back up. Browser-private workspaces are managed by the browser, so use project export when you want a portable backup. See [Workspaces and Storage](workspaces).',
        },
      ],
    },
    {
      title: 'Projects, tracks, and clips',
      blocks: [
        {
          kind: 'list',
          items: [
            'A **project** holds a Photo or Video workflow, a timeline, output settings, music analysis, and references to the media you use.',
            'The timeline stacks **tracks**; higher tracks render over lower ones.',
            'A **clip** on the timeline is a window into a source file — trimming a clip changes which part of the source plays, it does not alter the file.',
            'An **adjustment layer** is a clip that carries no media of its own — it applies its effects and color to every clip below it.',
          ],
        },
      ],
    },
    {
      title: 'Sequences and compound clips',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Beatvideo Maker reuses one mature editing engine for timelines, compositions, effects, and export. Photo and Video are focused workflows over that same runtime, not separate editors.',
        },
        {
          kind: 'list',
          items: [
            'A **Motion composition** opens in **Motion**, where the shared editor keeps your media, preview, and properties in place while the lower dock becomes a layer timeline.',
            'A **sequence** is a standalone timeline in the same project, opened from a tab in the tab bar.',
            'A **compound clip** folds a section of the timeline into a single reusable media item while its contents remain editable in their own timeline.',
          ],
        },
      ],
    },
    {
      title: 'Frames, music, and time',
      blocks: [
        {
          kind: 'list',
          items: [
            'Video timing is measured in **frames** at the project frame rate.',
            'Beatvideo music analysis adds a musical grid of beats, bars, BPM, and an explicit bar-1 anchor on the same canonical timeline time axis.',
            'Source media can have a different frame rate than the project, so source frames are converted to project frames when you edit.',
          ],
        },
        {
          kind: 'note',
          tone: 'tip',
          text: 'Set the project resolution and frame rate to match your delivery target when you create the project.',
        },
      ],
    },
    {
      title: 'Everything renders on your machine',
      blocks: [
        {
          kind: 'list',
          items: [
            'Playback, effects, color, music analysis, and AI tools run locally using your GPU and CPU.',
            '**Proxies** are lighter copies of heavy media that make editing smooth; final export uses the intended source quality.',
            'Because there is no cloud render, keeping the app open during export matters — the render happens in the browser.',
          ],
        },
      ],
    },
  ],
} satisfies DocPageContent

export default page
